import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { CommonStatus } from '../../../common/enums/common-status.enum';
import { UserEntity } from '../../users/entities/user.entity';
import { UserRoleEntity } from '../../users/entities/user-role.entity';
import { RoleEntity } from '../../roles/entities/role.entity';
import {
  DeliveryStatus,
  NotificationRecipientEntity,
} from '../entities/notification-recipient.entity';
import {
  NotificationAudience,
  NotificationEntity,
  NotificationStatus,
} from '../entities/notification.entity';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { ListNotificationsDto } from '../dto/list-notifications.dto';
import { ListMyNotificationsDto } from '../dto/list-my-notifications.dto';
import { AuditService } from '../../audit/services/audit.service';

const INSERT_CHUNK_SIZE = 250;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationsRepo: Repository<NotificationEntity>,
    @InjectRepository(NotificationRecipientEntity)
    private readonly recipientsRepo: Repository<NotificationRecipientEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRolesRepo: Repository<UserRoleEntity>,
    @InjectRepository(RoleEntity)
    private readonly rolesRepo: Repository<RoleEntity>,
    private readonly audit: AuditService,
  ) {}

  async sendToUser(
    userId: string,
    title: string,
    body: string,
    actingUserId?: string,
  ): Promise<void> {
    try {
      const user = await this.usersRepo.findOne({ where: { id: userId } });
      if (!user) return;

      const actor = actingUserId || userId;
      const notification = this.notificationsRepo.create({
        title: title.trim(),
        body: body.trim(),
        target_audience: NotificationAudience.SPECIFIC_USER,
        status: NotificationStatus.SENT,
        scheduled_at: null,
        sent_at: new Date(),
        created_by: actor,
        updated_by: actor,
      });

      const saved = await this.notificationsRepo.save(notification);

      const recipient = this.recipientsRepo.create({
        notification_id: saved.id,
        user_id: user.id,
        delivery_status: DeliveryStatus.SENT,
        created_by: actor,
        updated_by: actor,
      });
      await this.recipientsRepo.save(recipient);

      this.logger.log(`Real-time notification sent to user ${userId}: ${title}`);
    } catch (err) {
      this.logger.error(`Failed to send notification to user ${userId}: ${(err as Error).message}`);
    }
  }

  async sendToAdmins(
    title: string,
    body: string,
    actingUserId?: string,
  ): Promise<void> {
    try {
      const adminRole = await this.rolesRepo.findOne({ where: { name: 'ADMIN' } });
      if (!adminRole) return;

      const userRoles = await this.userRolesRepo.find({
        where: { role_id: adminRole.id },
        select: ['user_id'],
      });

      const adminUserIds = userRoles.map((ur) => ur.user_id);
      if (adminUserIds.length === 0) return;

      const actor = actingUserId || adminUserIds[0];
      const notification = this.notificationsRepo.create({
        title: title.trim(),
        body: body.trim(),
        target_audience: NotificationAudience.SPECIFIC_USER,
        status: NotificationStatus.SENT,
        scheduled_at: null,
        sent_at: new Date(),
        created_by: actor,
        updated_by: actor,
      });

      const saved = await this.notificationsRepo.save(notification);

      const recipients = adminUserIds.map((adminId) =>
        this.recipientsRepo.create({
          notification_id: saved.id,
          user_id: adminId,
          delivery_status: DeliveryStatus.SENT,
          created_by: actor,
          updated_by: actor,
        }),
      );
      await this.recipientsRepo.save(recipients);

      this.logger.log(`Real-time notification sent to ${adminUserIds.length} admins: ${title}`);
    } catch (err) {
      this.logger.error(`Failed to send notification to admins: ${(err as Error).message}`);
    }
  }

  async create(dto: CreateNotificationDto, actingUserId: string) {
    const scheduledAt = dto.scheduled_at ? new Date(dto.scheduled_at) : null;
    if (scheduledAt && isNaN(scheduledAt.getTime())) {
      throw new BadRequestException({
        message: 'Invalid scheduled_at date string',
        code: 'INVALID_SCHEDULED_DATE',
        details: null,
      });
    }

    const explicitIds = dto.recipient_user_ids ?? [];
    if (
      dto.target_audience === NotificationAudience.SPECIFIC_USER &&
      explicitIds.length === 0
    ) {
      throw new BadRequestException({
        message: 'recipient_user_ids required for SPECIFIC_USER audience',
        code: 'RECIPIENTS_REQUIRED',
        details: null,
      });
    }

    // Resolve audience users
    const recipients = await this.resolveAudience(
      dto.target_audience,
      explicitIds,
    );
    if (recipients.length === 0) {
      throw new BadRequestException({
        message: 'No eligible active recipients found for selected audience',
        code: 'NO_RECIPIENTS_FOUND',
        details: { audience: dto.target_audience },
      });
    }

    const isScheduledFuture =
      scheduledAt && scheduledAt.getTime() > Date.now();

    const notification = this.notificationsRepo.create({
      title: dto.title.trim(),
      body: dto.body.trim(),
      target_audience: dto.target_audience,
      status: isScheduledFuture
        ? NotificationStatus.SCHEDULED
        : NotificationStatus.SENT,
      scheduled_at: scheduledAt,
      sent_at: isScheduledFuture ? null : new Date(),
      created_by: actingUserId,
      updated_by: actingUserId,
    });

    const saved = await this.notificationsRepo.save(notification);

    // Insert recipients in chunks
    for (let i = 0; i < recipients.length; i += INSERT_CHUNK_SIZE) {
      const chunk = recipients.slice(i, i + INSERT_CHUNK_SIZE);
      const recipientEntities = chunk.map((user) =>
        this.recipientsRepo.create({
          notification_id: saved.id,
          user_id: user.id,
          delivery_status: isScheduledFuture
            ? DeliveryStatus.PENDING
            : DeliveryStatus.SENT,
          created_by: actingUserId,
          updated_by: actingUserId,
        }),
      );
      await this.recipientsRepo.save(recipientEntities);
    }

    await this.audit.record({
      event: 'notification.created',
      actorId: actingUserId,
      entityType: 'notifications',
      entityId: saved.id,
      metadata: {
        title: saved.title,
        targetAudience: saved.target_audience,
        recipientCount: recipients.length,
        status: saved.status,
        scheduledAt: saved.scheduled_at,
      },
    });

    return {
      notification: saved,
      recipient_count: recipients.length,
    };
  }

  async listAll(dto: ListNotificationsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.notificationsRepo
      .createQueryBuilder('notification')
      .orderBy('notification.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (dto.status) {
      qb.andWhere('notification.status = :status', { status: dto.status });
    }
    if (dto.target_audience) {
      qb.andWhere('notification.target_audience = :audience', {
        audience: dto.target_audience,
      });
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getById(id: string) {
    const notification = await this.notificationsRepo.findOne({
      where: { id },
    });
    if (!notification) {
      throw new NotFoundException({
        message: 'Notification not found',
        code: 'NOTIFICATION_NOT_FOUND',
        details: { id },
      });
    }
    return notification;
  }

  async listRecipients(id: string) {
    await this.getById(id);

    const recipients = await this.recipientsRepo
      .createQueryBuilder('recipient')
      .leftJoinAndSelect('recipient.user', 'user')
      .where('recipient.notification_id = :id', { id })
      .orderBy('recipient.created_at', 'ASC')
      .take(500)
      .getMany();

    return {
      notification_id: id,
      items: recipients.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        user_name: r.user?.full_name ?? null,
        user_email: r.user?.email ?? null,
        delivery_status: r.delivery_status,
        read_at: r.read_at,
        created_at: r.created_at,
      })),
    };
  }

  async listMine(userId: string, dto: ListMyNotificationsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.recipientsRepo
      .createQueryBuilder('recipient')
      .leftJoinAndSelect('recipient.notification', 'notification')
      .where('recipient.user_id = :userId', { userId })
      .andWhere('recipient.delivery_status = :status', {
        status: DeliveryStatus.SENT,
      })
      .orderBy('recipient.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (dto.unread_only) {
      qb.andWhere('recipient.read_at IS NULL');
    }

    const [recipients, total] = await qb.getManyAndCount();
    const unreadCount = await this.recipientsRepo.count({
      where: {
        user_id: userId,
        delivery_status: DeliveryStatus.SENT,
        read_at: IsNull(),
      },
    });

    return {
      items: recipients.map((r) => ({
        recipient_id: r.id,
        is_read: r.read_at !== null,
        read_at: r.read_at,
        created_at: r.created_at,
        notification: {
          id: r.notification?.id,
          title: r.notification?.title,
          body: r.notification?.body,
          target_audience: r.notification?.target_audience,
          sent_at: r.notification?.sent_at,
        },
      })),
      unread_count: unreadCount,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async markRead(recipientId: string, userId: string) {
    const recipient = await this.recipientsRepo.findOne({
      where: { id: recipientId },
    });

    if (!recipient || recipient.user_id !== userId) {
      throw new NotFoundException({
        message: 'Notification recipient record not found',
        code: 'NOTIFICATION_NOT_FOUND',
        details: { id: recipientId },
      });
    }

    if (!recipient.read_at) {
      recipient.read_at = new Date();
      await this.recipientsRepo.save(recipient);
    }

    return {
      recipient_id: recipient.id,
      is_read: true,
      read_at: recipient.read_at,
    };
  }

  async markAllRead(userId: string) {
    const result = await this.recipientsRepo.update(
      {
        user_id: userId,
        delivery_status: DeliveryStatus.SENT,
        read_at: IsNull(),
      },
      { read_at: new Date() },
    );

    return {
      updated_count: result.affected ?? 0,
    };
  }

  private async resolveAudience(
    audience: NotificationAudience,
    explicitIds: string[] = [],
  ): Promise<UserEntity[]> {
    if (audience === NotificationAudience.ALL_USERS) {
      return this.usersRepo.find({ where: { status: CommonStatus.ACTIVE } });
    }

    if (audience === NotificationAudience.SPECIFIC_USER) {
      if (explicitIds.length === 0) return [];
      return this.usersRepo.find({
        where: { id: In(explicitIds), status: CommonStatus.ACTIVE },
      });
    }

    // Role-targeted audience (MEMBERS, DONORS, DONATION_SEEKERS)
    const roleName =
      audience === NotificationAudience.MEMBERS
        ? 'MEMBER'
        : audience === NotificationAudience.DONORS
          ? 'DONOR'
          : 'DONATION_SEEKER';

    const role = await this.rolesRepo.findOne({ where: { name: roleName } });
    if (!role) return [];

    const userRoles = await this.userRolesRepo.find({
      where: { role_id: role.id },
      select: ['user_id'],
    });

    const userIds = userRoles.map((ur) => ur.user_id);
    if (userIds.length === 0) return [];

    return this.usersRepo.find({
      where: { id: In(userIds), status: CommonStatus.ACTIVE },
    });
  }
}
