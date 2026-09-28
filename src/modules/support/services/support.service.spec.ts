import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SupportService } from './support.service';
import { TicketStatus } from '../entities/support-ticket.entity';

describe('SupportService', () => {
  let service: SupportService;
  let ticketsRepo: Record<string, jest.Mock>;
  let messagesRepo: Record<string, jest.Mock>;
  let docsService: Record<string, jest.Mock>;
  let audit: Record<string, jest.Mock>;

  beforeEach(() => {
    ticketsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'ticket-1', ...x })),
    };
    messagesRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'msg-1', ...x })),
    };
    docsService = { upload: jest.fn().mockResolvedValue({ id: 'doc-1' }) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    const notifications = {
      sendToUser: jest.fn().mockResolvedValue(undefined),
      sendToAdmins: jest.fn().mockResolvedValue(undefined),
    };

    service = new SupportService(
      ticketsRepo as never,
      messagesRepo as never,
      docsService as never,
      audit as never,
      notifications as never,
    );
  });

  describe('create', () => {
    it('creates ticket in SUBMITTED status', async () => {
      const result = await service.create(
        { subject: 'Login issue', description: 'Cannot reset password' },
        'u1',
      );

      expect(ticketsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'u1',
          status: TicketStatus.SUBMITTED,
          subject: 'Login issue',
        }),
      );
      expect(result.id).toBe('ticket-1');
    });
  });

  describe('getById', () => {
    it('returns ticket for owner', async () => {
      ticketsRepo.findOne.mockResolvedValue({ id: 'ticket-1', user_id: 'u1' });
      const result = await service.getById('ticket-1', 'u1', false);
      expect(result.id).toBe('ticket-1');
    });

    it('throws ForbiddenException for unauthorized user', async () => {
      ticketsRepo.findOne.mockResolvedValue({ id: 'ticket-1', user_id: 'u2' });
      await expect(service.getById('ticket-1', 'u1', false)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateStatus', () => {
    it('updates status to UNDER_REVIEW', async () => {
      ticketsRepo.findOne.mockResolvedValue({
        id: 'ticket-1',
        status: TicketStatus.SUBMITTED,
      });

      const result = await service.updateStatus(
        'ticket-1',
        { status: TicketStatus.UNDER_REVIEW },
        'admin-1',
      );

      expect(ticketsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: TicketStatus.UNDER_REVIEW,
          updated_by: 'admin-1',
        }),
      );
      expect(result.id).toBe('ticket-1');
    });
  });

  describe('addMessage', () => {
    it('adds message and auto-moves SUBMITTED ticket to UNDER_REVIEW when admin replies', async () => {
      ticketsRepo.findOne.mockResolvedValue({
        id: 'ticket-1',
        user_id: 'u1',
        status: TicketStatus.SUBMITTED,
      });

      const result = await service.addMessage(
        'ticket-1',
        { body: 'We are looking into this.' },
        'admin-1',
        true,
      );

      expect(messagesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          ticket_id: 'ticket-1',
          author_id: 'admin-1',
          body: 'We are looking into this.',
        }),
      );
      expect(result.id).toBe('msg-1');
      expect(ticketsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: TicketStatus.UNDER_REVIEW }),
      );
    });
  });
});
