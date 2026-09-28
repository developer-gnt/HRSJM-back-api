import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminService } from './admin.service';
import { UserEntity } from '../../users/entities/user.entity';
import { MembershipEntity } from '../../memberships/entities/membership.entity';
import { RenewalRequestEntity } from '../../renewals/entities/renewal-request.entity';
import { AssistanceRequestEntity } from '../../assistance/entities/assistance-request.entity';
import { SupportTicketEntity } from '../../support/entities/support-ticket.entity';
import { DonationEntity } from '../../donations/entities/donation.entity';
import { DocumentEntity } from '../../documents/entities/document.entity';
import { NotificationRecipientEntity } from '../../notifications/entities/notification-recipient.entity';

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(UserEntity), useValue: { count: jest.fn().mockResolvedValue(5), createQueryBuilder: jest.fn() } },
        { provide: getRepositoryToken(MembershipEntity), useValue: { count: jest.fn().mockResolvedValue(3), createQueryBuilder: jest.fn() } },
        { provide: getRepositoryToken(RenewalRequestEntity), useValue: { count: jest.fn().mockResolvedValue(2), createQueryBuilder: jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), getRawOne: jest.fn().mockResolvedValue({ total: '500' }) }) } },
        { provide: getRepositoryToken(AssistanceRequestEntity), useValue: { count: jest.fn().mockResolvedValue(1) } },
        { provide: getRepositoryToken(SupportTicketEntity), useValue: { count: jest.fn().mockResolvedValue(1) } },
        { provide: getRepositoryToken(DonationEntity), useValue: { count: jest.fn().mockResolvedValue(4), createQueryBuilder: jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), getRawOne: jest.fn().mockResolvedValue({ total: '1500' }) }) } },
        { provide: getRepositoryToken(DocumentEntity), useValue: { count: jest.fn().mockResolvedValue(0), find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(NotificationRecipientEntity), useValue: { count: jest.fn().mockResolvedValue(0) } },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return dashboard metrics', async () => {
    const res = await service.getDashboard();
    expect(res).toBeDefined();
    expect(res.users.total).toBe(5);
    expect(res.memberships.total).toBe(3);
  });
});
