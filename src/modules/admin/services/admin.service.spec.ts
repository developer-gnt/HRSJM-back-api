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
import { EventEntity } from '../../events/entities/event.entity';
import { MembershipPaymentEntity } from '../../membership-payments/entities/membership-payment.entity';
import { ReceiptEntity } from '../../membership-payments/entities/receipt.entity';
import { AuditLogEntity } from '../../audit/entities/audit-log.entity';

describe('AdminService', () => {
  let service: AdminService;

  const createMockQB = () => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ total: '500' }),
    getRawMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(UserEntity), useValue: { count: jest.fn().mockResolvedValue(5), createQueryBuilder: jest.fn().mockImplementation(createMockQB) } },
        { provide: getRepositoryToken(MembershipEntity), useValue: { count: jest.fn().mockResolvedValue(3), createQueryBuilder: jest.fn().mockImplementation(createMockQB) } },
        { provide: getRepositoryToken(RenewalRequestEntity), useValue: { count: jest.fn().mockResolvedValue(2), createQueryBuilder: jest.fn().mockImplementation(createMockQB) } },
        { provide: getRepositoryToken(AssistanceRequestEntity), useValue: { count: jest.fn().mockResolvedValue(1), createQueryBuilder: jest.fn().mockImplementation(createMockQB) } },
        { provide: getRepositoryToken(SupportTicketEntity), useValue: { count: jest.fn().mockResolvedValue(1), createQueryBuilder: jest.fn().mockImplementation(createMockQB) } },
        { provide: getRepositoryToken(DonationEntity), useValue: { count: jest.fn().mockResolvedValue(4), createQueryBuilder: jest.fn().mockImplementation(createMockQB) } },
        { provide: getRepositoryToken(DocumentEntity), useValue: { count: jest.fn().mockResolvedValue(0), find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(NotificationRecipientEntity), useValue: { count: jest.fn().mockResolvedValue(0) } },
        { provide: getRepositoryToken(MembershipPaymentEntity), useValue: { count: jest.fn().mockResolvedValue(0), createQueryBuilder: jest.fn().mockImplementation(createMockQB) } },
        { provide: getRepositoryToken(ReceiptEntity), useValue: { count: jest.fn().mockResolvedValue(0), createQueryBuilder: jest.fn().mockImplementation(createMockQB) } },
        { provide: getRepositoryToken(AuditLogEntity), useValue: { count: jest.fn().mockResolvedValue(0), find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(EventEntity), useValue: { count: jest.fn().mockResolvedValue(2), createQueryBuilder: jest.fn().mockImplementation(createMockQB) } },
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
