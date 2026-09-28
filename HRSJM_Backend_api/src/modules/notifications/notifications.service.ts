import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";
import { AuthenticatedUser } from "../../shared/decorators/current-user.decorator";
import { buildPaginationMeta } from "../../shared/dto/pagination.dto";
import { User, UserRole, UserStatus } from "../users/entities/user.entity";
import { NotificationRecipient, DeliveryStatus } from "./entities/notification-recipient.entity";
import {
  Notification,
  NotificationAudience,
  NotificationStatus,
} from "./entities/notification.entity";
import {
  CreateNotificationDto,
  ListMyNotificationsQueryDto,
  ListNotificationsQueryDto,
} from "./dto/notification.dto";

// Recipient rows are inserted in chunks so a huge audience never builds
// one oversized INSERT statement.
const INSERT_CHUNK_SIZE = 500;
const SCHEDULE_TICK_MS = Number(process.env.NOTIFICATION_SCHEDULE_TICK_MS) || 30_000;

function toSafeNotification(notification: Notification, recipientCount?: number) {
  const safe = {
    id: notification.id,
    title: notification.title,
    body: notification.body,
    targetAudience: notification.targetAudience,
    status: notification.status,
    scheduledAt: notification.scheduledAt,
    sentAt: notification.sentAt,
    createdAt: notification.createdAt,
  };
  if (recipientCount !== undefined) {
    return { ...safe, recipientCount };
  }
  return safe;
}

function toSafeRecipient(recipient: NotificationRecipient) {
  return {
    id: recipient.id,
    notificationId: recipient.notificationId,
    deliveryStatus: recipient.deliveryStatus,
    readAt: recipient.readAt,
    createdAt: recipient.createdAt,
    user: recipient.user
      ? { id: recipient.user.id, fullName: recipient.user.fullName, email: recipient.user.email }
      : undefined,
  };
}

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("Notifications");
  private scheduleTicker: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepo: Repository<Notification>,
    @InjectRepository(NotificationRecipient)
    private readonly recipientsRepo: Repository<NotificationRecipient>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  // Scheduled-send dispatcher: every tick picks up notifications whose
  // scheduledAt has passed and fans them out to their audience.
  onModuleInit() {
    this.scheduleTicker = setInterval(() => {
      void this.processDueSends();
    }, SCHEDULE_TICK_MS);
    this.logger.log("Scheduled-send ticker started (every 30s)");
  }

  onModuleDestroy() {
    if (this.scheduleTicker) {
      clearInterval(this.scheduleTicker);
    }
  }

  async create(actor: AuthenticatedUser, dto: CreateNotificationDto) {
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;

    // SPECIFIC_USER targets must be validated up front so a bad id fails at
    // creation time, not at dispatch time.
    let explicitIds: string[] = [];
    if (dto.targetAudience === NotificationAudience.SPECIFIC_USER) {
      if (!dto.userIds || dto.userIds.length === 0) {
        throw new BadRequestException("userIds is required when targetAudience is SPECIFIC_USER");
      }
      explicitIds = [...new Set(dto.userIds)];
      const found = await this.usersRepo.find({
        where: { id: In(explicitIds), status: UserStatus.ACTIVE },
      });
      const missing = explicitIds.filter((id) => !found.some((u) => u.id === id));
      if (missing.length > 0) {
        throw new BadRequestException(`Unknown or inactive user ids: ${missing.join(", ")}`);
      }
    }

    // Fan out recipient rows now, delivery pending. In-app delivery flips
    // them to SENT at dispatch; PENDING rows never appear in user feeds.
    const recipients = await this.resolveAudience(dto.targetAudience, explicitIds);
    const notification = await this.notificationsRepo.save(
      this.notificationsRepo.create({
        title: dto.title.trim(),
        body: dto.body.trim(),
        targetAudience: dto.targetAudience,
        status: NotificationStatus.SCHEDULED,
        scheduledAt,
        createdBy: actor.id,
      }),
    );
    for (let i = 0; i < recipients.length; i += INSERT_CHUNK_SIZE) {
      await this.recipientsRepo.insert(
        recipients.slice(i, i + INSERT_CHUNK_SIZE).map((user) => ({
          notificationId: notification.id,
          userId: user.id,
          deliveryStatus: DeliveryStatus.PENDING,
        })),
      );
    }

    if (scheduledAt && scheduledAt.getTime() > Date.now()) {
      this.logger.log(
        `Notification scheduled: ${notification.id} for ${scheduledAt.toISOString()} ` +
          `(${recipients.length} recipient(s), ${notification.targetAudience})`,
      );
      return {
        message: "Notification scheduled",
        data: toSafeNotification(notification, recipients.length),
      };
    }

    await this.dispatch(notification);
    const saved = await this.notificationsRepo.findOneOrFail({ where: { id: notification.id } });
    return {
      message: "Notification sent",
      data: toSafeNotification(saved, recipients.length),
    };
  }

  async listAll(query: ListNotificationsQueryDto) {
    const qb = this.notificationsRepo
      .createQueryBuilder("notification")
      .orderBy("notification.createdAt", "DESC")
      .skip(((query.page ?? 1) - 1) * (query.limit ?? 10))
      .take(query.limit ?? 10)
      .loadRelationCountAndMap("notification.recipientCount", "notification.recipients");

    if (query.status) {
      qb.andWhere("notification.status = :status", { status: query.status });
    }
    if (query.audience) {
      qb.andWhere("notification.targetAudience = :audience", { audience: query.audience });
    }

    const [notifications, total] = await qb.getManyAndCount();
    return {
      message: "Notifications fetched",
      data: {
        items: notifications.map((n) =>
          toSafeNotification(n, (n as Notification & { recipientCount?: number }).recipientCount),
        ),
        meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 10),
      },
    };
  }

  async listRecipients(id: string) {
    const notification = await this.notificationsRepo.findOne({ where: { id } });
    if (!notification) {
      throw new NotFoundException("Notification not found");
    }
    const recipients = await this.recipientsRepo
      .createQueryBuilder("recipient")
      .leftJoinAndSelect("recipient.user", "user")
      .where("recipient.notificationId = :id", { id })
      .orderBy("recipient.createdAt", "ASC")
      .take(500)
      .getMany();

    return {
      message: "Notification recipients fetched",
      data: {
        notification: toSafeNotification(notification),
        items: recipients.map(toSafeRecipient),
      },
    };
  }

  async listMine(actor: AuthenticatedUser, query: ListMyNotificationsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const qb = this.recipientsRepo
      .createQueryBuilder("recipient")
      .leftJoinAndSelect("recipient.notification", "notification")
      .where("recipient.userId = :userId", { userId: actor.id })
      .andWhere("recipient.deliveryStatus = :status", { status: DeliveryStatus.SENT })
      .orderBy("recipient.createdAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (query.unreadOnly) {
      qb.andWhere("recipient.readAt IS NULL");
    }

    const [recipients, total] = await qb.getManyAndCount();
    const unreadCount = await this.recipientsRepo.count({
      where: { userId: actor.id, deliveryStatus: DeliveryStatus.SENT, readAt: IsNull() },
    });

    return {
      message: "Your notifications fetched",
      data: {
        items: recipients.map((r) => ({
          ...toSafeRecipient(r),
          isRead: r.readAt !== null,
          notification: {
            id: r.notification.id,
            title: r.notification.title,
            body: r.notification.body,
            sentAt: r.notification.sentAt,
          },
        })),
        meta: buildPaginationMeta(total, page, limit),
        unreadCount,
      },
    };
  }

  async markRead(actor: AuthenticatedUser, recipientId: string) {
    const recipient = await this.recipientsRepo.findOne({
      where: { id: recipientId },
      relations: { notification: true },
    });
    if (!recipient) {
      throw new NotFoundException("Notification not found");
    }
    if (recipient.userId !== actor.id) {
      throw new NotFoundException("Notification not found");
    }
    if (recipient.readAt === null) {
      recipient.readAt = new Date();
      await this.recipientsRepo.save(recipient);
    }
    return {
      message: "Notification marked as read",
      data: toSafeRecipient(recipient),
    };
  }

  async markAllRead(actor: AuthenticatedUser) {
    const result = await this.recipientsRepo.update(
      { userId: actor.id, deliveryStatus: DeliveryStatus.SENT, readAt: IsNull() },
      { readAt: new Date() },
    );
    return {
      message: "All notifications marked as read",
      data: { updated: result.affected ?? 0 },
    };
  }

  // Delivery step: flips the pending recipient rows to SENT and marks the
  // notification sent. If it throws, rows stay PENDING and the ticker
  // retries the SCHEDULED notification.
  private async dispatch(notification: Notification) {
    await this.recipientsRepo.update(
      { notificationId: notification.id, deliveryStatus: DeliveryStatus.PENDING },
      { deliveryStatus: DeliveryStatus.SENT },
    );

    notification.status = NotificationStatus.SENT;
    notification.sentAt = new Date();
    await this.notificationsRepo.save(notification);
    this.logger.log(`Notification ${notification.id} dispatched (${notification.targetAudience})`);
  }

  private async resolveAudience(
    audience: NotificationAudience,
    explicitIds: string[] = [],
  ): Promise<User[]> {
    switch (audience) {
      case NotificationAudience.ALL_USERS:
        return this.usersRepo.find({ where: { status: UserStatus.ACTIVE } });
      case NotificationAudience.MEMBERS:
        return this.usersRepo.find({
          where: { role: UserRole.MEMBER, status: UserStatus.ACTIVE },
        });
      case NotificationAudience.DONORS:
        return this.usersRepo.find({
          where: { role: UserRole.DONOR, status: UserStatus.ACTIVE },
        });
      case NotificationAudience.DONATION_SEEKERS:
        return this.usersRepo.find({
          where: { role: UserRole.DONATION_SEEKER, status: UserStatus.ACTIVE },
        });
      case NotificationAudience.SPECIFIC_USER:
        if (explicitIds.length === 0) {
          return [];
        }
        return this.usersRepo.find({
          where: { id: In(explicitIds), status: UserStatus.ACTIVE },
        });
    }
  }

  private async processDueSends() {
    if (this.ticking) {
      return;
    }
    this.ticking = true;
    try {
      const due = await this.notificationsRepo
        .createQueryBuilder("notification")
        .where("notification.status = :status", { status: NotificationStatus.SCHEDULED })
        .andWhere("notification.scheduledAt IS NOT NULL")
        .andWhere("notification.scheduledAt <= :now", { now: new Date() })
        .orderBy("notification.scheduledAt", "ASC")
        .take(20)
        .getMany();
      for (const notification of due) {
        try {
          await this.dispatch(notification);
        } catch (error) {
          this.logger.error(
            `Dispatch failed for notification ${notification.id}: ${String(error)}`,
          );
        }
      }
    } finally {
      this.ticking = false;
    }
  }
}