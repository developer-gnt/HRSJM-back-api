import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationAudience, NotificationStatus } from '../entities/notification.entity';
import { DeliveryStatus } from '../entities/notification-recipient.entity';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notificationsRepo: Record<string, jest.Mock>;
  let recipientsRepo: Record<string, jest.Mock>;
  let usersRepo: Record<string, jest.Mock>;
  let userRolesRepo: Record<string, jest.Mock>;
  let rolesRepo: Record<string, jest.Mock>;
  let audit: Record<string, jest.Mock>;
  let qb: Record<string, jest.Mock>;

  beforeEach(() => {
    qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getMany: jest.fn().mockResolvedValue([]),
    };

    notificationsRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'notif-1', ...x })),
      findOne: jest.fn().mockResolvedValue(null),
    };

    recipientsRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    usersRepo = {
      find: jest.fn().mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]),
    };

    userRolesRepo = {
      find: jest.fn().mockResolvedValue([{ user_id: 'u1' }]),
    };

    rolesRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'r1', name: 'MEMBER' }),
    };

    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    service = new NotificationsService(
      notificationsRepo as never,
      recipientsRepo as never,
      usersRepo as never,
      userRolesRepo as never,
      rolesRepo as never,
      audit as never,
    );
  });

  describe('create', () => {
    it('creates and sends notification to ALL_USERS audience immediately', async () => {
      const result = await service.create(
        {
          title: 'Welcome',
          body: 'Welcome to HRSJM',
          target_audience: NotificationAudience.ALL_USERS,
        },
        'admin-1',
      );

      expect(notificationsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Welcome',
          body: 'Welcome to HRSJM',
          target_audience: NotificationAudience.ALL_USERS,
          status: NotificationStatus.SENT,
          created_by: 'admin-1',
        }),
      );
      expect(result.recipient_count).toBe(2);
      expect(recipientsRepo.save).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'notification.created' }),
      );
    });

    it('throws BadRequestException when target_audience is SPECIFIC_USER but recipient_user_ids is empty', async () => {
      await expect(
        service.create(
          {
            title: 'Welcome',
            body: 'Welcome to HRSJM',
            target_audience: NotificationAudience.SPECIFIC_USER,
            recipient_user_ids: [],
          },
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when no recipients are resolved', async () => {
      usersRepo.find.mockResolvedValue([]);

      await expect(
        service.create(
          {
            title: 'Welcome',
            body: 'Welcome to HRSJM',
            target_audience: NotificationAudience.ALL_USERS,
          },
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('markRead', () => {
    it('marks recipient notification as read', async () => {
      recipientsRepo.findOne.mockResolvedValue({
        id: 'rec-1',
        user_id: 'user-1',
        read_at: null,
      });

      const result = await service.markRead('rec-1', 'user-1');
      expect(result.is_read).toBe(true);
      expect(recipientsRepo.save).toHaveBeenCalled();
    });

    it('throws NotFoundException when recipient does not belong to user', async () => {
      recipientsRepo.findOne.mockResolvedValue({
        id: 'rec-1',
        user_id: 'other-user',
      });

      await expect(service.markRead('rec-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
