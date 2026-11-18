import { Test, TestingModule } from '@nestjs/testing';
import { ContactController } from './contact.controller';
import { MailService } from '../../mail/mail.service';
import { SupportService } from '../services/support.service';

describe('ContactController', () => {
  let controller: ContactController;
  let mailService: MailService;
  let supportService: SupportService;

  const mockMailService = {
    sendContactInquiryEmail: jest.fn().mockResolvedValue({
      citizenSent: true,
      adminSent: true,
      inquiryRef: 'HRSJM-MSG-TEST1',
    }),
  };

  const mockSupportService = {
    createContactInquiryTicket: jest.fn().mockResolvedValue({
      ticketId: 't-12345',
      ticketRef: 'HRSJM-MSG-TEST1',
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContactController],
      providers: [
        { provide: MailService, useValue: mockMailService },
        { provide: SupportService, useValue: mockSupportService },
      ],
    }).compile();

    controller = module.get<ContactController>(ContactController);
    mailService = module.get<MailService>(MailService);
    supportService = module.get<SupportService>(SupportService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should accept general contact inquiry and dispatch to admin and citizen', async () => {
    const res = await controller.submitContactInquiry({
      name: 'Ravi Kumar',
      email: 'ravi@example.com',
      phone: '7021057853',
      subject: 'General Enquiry',
      message: 'Hello HRSJM, I would like more information on upcoming events.',
      formName: 'General Enquiry',
    });

    expect(res.success).toBe(true);
    expect(res.inquiryRef).toBe('HRSJM-MSG-TEST1');
    expect(mockSupportService.createContactInquiryTicket).toHaveBeenCalledTimes(1);
    expect(mockMailService.sendContactInquiryEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        formName: 'General Enquiry',
        senderName: 'Ravi Kumar',
        senderEmail: 'ravi@example.com',
        senderPhone: '7021057853',
        subject: 'General Enquiry',
      }),
    );
  });

  it('should catch honeypot bot submissions without creating database tickets or firing emails', async () => {
    const res = await controller.submitContactInquiry({
      name: 'Bot Spammer',
      email: 'spammer@bot.com',
      message: 'Cheap sunglasses',
      _hp: 'http://spam.ru',
    } as any);

    expect(res.success).toBe(true);
    expect(res.inquiryRef).toBe('HRSJM-SPAM-PREVENTED');
    expect(mockSupportService.createContactInquiryTicket).not.toHaveBeenCalled();
    expect(mockMailService.sendContactInquiryEmail).not.toHaveBeenCalled();
  });
});
