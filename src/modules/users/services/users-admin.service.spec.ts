import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersAdminService } from './users-admin.service';
import { CommonStatus } from '../../../common/enums/common-status.enum';

describe('UsersAdminService', () => {
  let service: UsersAdminService;
  let usersRepo: Record<string, jest.Mock>;
  let usersService: Record<string, jest.Mock>;

  beforeEach(() => {
    usersRepo = {
      createQueryBuilder: jest.fn(),
      save: jest.fn(async (x) => x),
    };
    usersService = {
      toProfile: jest.fn((u) => ({
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        mobile_number: u.mobile_number,
        status: u.status,
      })),
      getProfile: jest.fn(),
      findById: jest.fn(),
      updateProfile: jest.fn(),
    };
    service = new UsersAdminService(usersRepo as never, usersService as never);
  });

  describe('getUser', () => {
    it('returns profile when user exists', async () => {
      usersService.getProfile.mockResolvedValue({ id: 'u1', full_name: 'Test' });
      const result = await service.getUser('u1');
      expect(result).toEqual({ id: 'u1', full_name: 'Test' });
    });

    it('throws NotFoundException when user does not exist', async () => {
      usersService.getProfile.mockResolvedValue(null);
      await expect(service.getUser('u1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateUser', () => {
    it('updates user profile via usersService', async () => {
      usersService.findById.mockResolvedValue({ id: 'u1', full_name: 'Old' });
      usersService.updateProfile.mockResolvedValue({ id: 'u1', full_name: 'New' });

      const result = await service.updateUser('u1', { full_name: 'New' }, 'admin-1');
      expect(usersService.updateProfile).toHaveBeenCalledWith(
        { id: 'u1', full_name: 'Old' },
        { full_name: 'New', email: undefined },
      );
      expect(result).toEqual({ id: 'u1', full_name: 'New' });
    });

    it('throws NotFoundException when user not found', async () => {
      usersService.findById.mockResolvedValue(null);
      await expect(service.updateUser('u1', { full_name: 'New' }, 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateUserStatus', () => {
    it('rejects self-status change with ForbiddenException', async () => {
      await expect(
        service.updateUserStatus('admin-1', { status: CommonStatus.INACTIVE }, 'admin-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('updates status when acting on another user', async () => {
      const user = { id: 'u2', status: CommonStatus.ACTIVE };
      usersService.findById.mockResolvedValue(user);

      await service.updateUserStatus('u2', { status: CommonStatus.INACTIVE }, 'admin-1');
      expect(usersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'u2',
          status: CommonStatus.INACTIVE,
          updated_by: 'admin-1',
        }),
      );
    });

    it('throws NotFoundException if target user does not exist', async () => {
      usersService.findById.mockResolvedValue(null);
      await expect(
        service.updateUserStatus('u2', { status: CommonStatus.INACTIVE }, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
