import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      switch (key) {
        case 'mail.host':
          return 'smtp.gmail.com';
        case 'mail.port':
          return 587;
        case 'mail.user':
          return 'test@gmail.com';
        case 'mail.pass':
          return 'samplepass';
        case 'mail.from':
          return 'test@gmail.com';
        case 'mail.fromName':
          return 'HRSJM';
        default:
          return null;
      }
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendMail', () => {
    it('should successfully dispatch email or handle mocked send', async () => {
      // Mock transporter.sendMail
      const mockTransporter = {
        sendMail: jest.fn().mockResolvedValue({ messageId: 'msg-test-123' }),
      };
      (service as any).transporter = mockTransporter;

      const result = await service.sendMail({
        to: 'donor@example.com',
        subject: 'Test Subject',
        text: 'Test Body',
      });

      expect(result).toHaveProperty('success');
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg-test-123');
    });
  });

  describe('sendDonationThankYouEmail', () => {
    it('should return false if donor email is missing or empty', async () => {
      const result = await service.sendDonationThankYouEmail({
        donorName: 'John Doe',
        donorEmail: '',
        amount: 1000,
        receiptNumber: 'HRSJM-REC-2026-12345',
      });

      expect(result).toBe(false);
    });

    it('should format and dispatch thank you email when valid donor email is provided', async () => {
      const sendSpy = jest.spyOn(service, 'sendMail').mockResolvedValue({
        success: true,
        messageId: 'test-msg-id',
      });

      const result = await service.sendDonationThankYouEmail({
        donorName: 'Ravi Kumar',
        donorEmail: 'ravi@example.com',
        amount: 2500,
        receiptNumber: 'HRSJM-REC-2026-98765',
        cause: 'Legal Aid Support',
        paymentMethod: 'ONLINE',
      });

      expect(result).toBe(true);
      expect(sendSpy).toHaveBeenCalledTimes(1);
      const callArg = sendSpy.mock.calls[0][0];
      expect(callArg.to).toBe('ravi@example.com');
      expect(callArg.subject).toContain('HRSJM-REC-2026-98765');
      expect(callArg.html).toContain('Ravi Kumar');
      expect(callArg.html).toContain('Legal Aid Support');
    });
  });
});
