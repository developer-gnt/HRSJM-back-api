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
        to: 'donor@hrsjm.org',
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
      expect(sendSpy).toHaveBeenCalledTimes(2);
      const callArg = sendSpy.mock.calls[0][0];
      expect(callArg.to).toBe('ravi@example.com');
      expect(callArg.subject).toContain('HRSJM-REC-2026-98765');
      expect(callArg.html).toContain('Ravi Kumar');
      expect(callArg.html).toContain('Legal Aid Support');

      const adminCall = sendSpy.mock.calls[1][0];
      expect(adminCall.to).toBe('president.hrsjm@gmail.com');
      expect(adminCall.subject).toContain('[HRSJM] New Donation Enquiry');
      expect(adminCall.html).toContain('FORM SOURCE: DONATION ENQUIRY');
      expect(adminCall.noLogoAttachment).toBe(true);
    });
  });

  describe('sendCentralizedWebsiteNotification', () => {
    it('should deliver notification to president.hrsjm@gmail.com with submitter email as replyTo, dynamic subject, and no logo', async () => {
      const sendSpy = jest.spyOn(service, 'sendMail').mockResolvedValue({
        success: true,
        messageId: 'pres-msg-999',
      });

      const result = await service.sendCentralizedWebsiteNotification({
        formName: 'Membership Enquiry',
        submitterName: 'Pooja Verma',
        submitterEmail: 'pooja.verma@example.com',
        submitterPhone: '7021057853',
        subject: 'District Post Details',
        message: 'I want to know about District Unit Post registration.',
        referenceId: 'HRSJM-MEM-1234',
        metadata: { City: 'Mumbai', Role: 'Advocate' },
      });

      expect(result.success).toBe(true);
      expect(sendSpy).toHaveBeenCalledTimes(1);
      const callArg = sendSpy.mock.calls[0][0];
      expect(callArg.to).toBe('president.hrsjm@gmail.com');
      expect(callArg.replyTo).toBe('pooja.verma@example.com');
      expect(callArg.subject).toContain('[HRSJM] New Membership Enquiry');
      expect(callArg.html).toContain('NEW WEBSITE ENQUIRY');
      expect(callArg.html).toContain('FORM SOURCE: MEMBERSHIP ENQUIRY');
      expect(callArg.html).toContain('Pooja Verma');
      expect(callArg.html).toContain('7021057853');
      expect(callArg.html).toContain('District Unit Post registration');
      expect(callArg.html).toContain('Mumbai');
      // Logo removal verification:
      expect(callArg.html).not.toContain('cid:hrsjm_logo');
      expect(callArg.html).not.toContain('cid:logo');
      expect(callArg.html).not.toContain('<img');
      expect(callArg.noLogoAttachment).toBe(true);
      expect(callArg.attachments).toEqual([]);
    });

    it('should correctly resolve canonical Form Source and dynamic subjects for all form types', () => {
      expect(service.resolveFormSourceDetails('Contact Us', '').sourceLabel).toBe('CONTACT US ENQUIRY');
      expect(service.resolveFormSourceDetails('', 'General Enquiry').sourceLabel).toBe('GENERAL ENQUIRY');
      expect(service.resolveFormSourceDetails('Membership', '').sourceLabel).toBe('MEMBERSHIP ENQUIRY');
      expect(service.resolveFormSourceDetails('Membership Application', '').sourceLabel).toBe('MEMBERSHIP APPLICATION');
      expect(service.resolveFormSourceDetails('Donation', '').sourceLabel).toBe('DONATION ENQUIRY');
      expect(service.resolveFormSourceDetails('Event Enquiry', '').sourceLabel).toBe('EVENT ENQUIRY');
      expect(service.resolveFormSourceDetails('', 'Support Enquiry').sourceLabel).toBe('SUPPORT ENQUIRY');
      expect(service.resolveFormSourceDetails('', 'Feedback').sourceLabel).toBe('WEBSITE FEEDBACK');
    });
  });
});
