import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService - Form Sources & Logo Removal Verification', () => {
  let service: MailService;
  let sendMailSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'mail.adminRecipient') return 'president.hrsjm@gmail.com';
              if (key === 'mail.from') return 'HRSJM <enquiry@hrsjm.org>';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
    sendMailSpy = jest.spyOn(service, 'sendMail').mockResolvedValue({
      success: true,
      messageId: 'mock-e2e-id',
    });
  });

  const testCases = [
    {
      name: 'Contact Us',
      payload: {
        formName: 'Contact Us',
        submitterName: 'Aarav Mehta',
        submitterEmail: 'aarav.mehta@example.com',
        submitterPhone: '9876543210',
        subject: 'Contact Us',
        message: 'Inquiry regarding contact details.',
      },
      expectedSubjectPrefix: '[HRSJM] New Contact Us Enquiry',
      expectedSourceLabel: 'CONTACT US ENQUIRY',
    },
    {
      name: 'General Enquiry',
      payload: {
        formName: 'General Enquiry',
        submitterName: 'Sunita Sharma',
        submitterEmail: 'sunita.sharma@example.com',
        submitterPhone: '9876543211',
        subject: 'General Enquiry',
        message: 'Question regarding mission programs in Delhi.',
      },
      expectedSubjectPrefix: '[HRSJM] New General Enquiry',
      expectedSourceLabel: 'GENERAL ENQUIRY',
    },
    {
      name: 'Membership Enquiry',
      payload: {
        formName: 'Membership Enquiry',
        submitterName: 'Rohan Gupta',
        submitterEmail: 'rohan.gupta@example.com',
        submitterPhone: '9876543212',
        subject: 'Membership Enquiry',
        message: 'Want to join as District General Member.',
      },
      expectedSubjectPrefix: '[HRSJM] New Membership Enquiry',
      expectedSourceLabel: 'MEMBERSHIP ENQUIRY',
    },
    {
      name: 'Membership Application',
      payload: {
        formName: 'Membership Application',
        submitterName: 'Kavita Joshi',
        submitterEmail: 'kavita.joshi@example.com',
        submitterPhone: '9876543213',
        subject: 'Membership Application: State Coordinator',
        message: 'Registration fee completed and application under review.',
      },
      expectedSubjectPrefix: '[HRSJM] New Membership Application',
      expectedSourceLabel: 'MEMBERSHIP APPLICATION',
    },
    {
      name: 'Donation Enquiry',
      payload: {
        formName: 'Donation Enquiry',
        submitterName: 'Rajesh Nair',
        submitterEmail: 'rajesh.nair@example.com',
        submitterPhone: '9876543214',
        subject: 'Donation Enquiry',
        message: 'Want to donate computers to the rural school program.',
      },
      expectedSubjectPrefix: '[HRSJM] New Donation Enquiry',
      expectedSourceLabel: 'DONATION ENQUIRY',
    },
    {
      name: 'Event Enquiry',
      payload: {
        formName: 'Event Enquiry',
        submitterName: 'Ananya Roy',
        submitterEmail: 'ananya.roy@example.com',
        submitterPhone: '9876543215',
        subject: 'Event Enquiry',
        message: 'Need registration info for the upcoming Youth Rights Summit.',
      },
      expectedSubjectPrefix: '[HRSJM] New Event Enquiry',
      expectedSourceLabel: 'EVENT ENQUIRY',
    },
    {
      name: 'Support Enquiry',
      payload: {
        formName: 'Support Enquiry',
        submitterName: 'Mohammad Farooq',
        submitterEmail: 'farooq@example.com',
        submitterPhone: '9876543216',
        subject: 'Support Enquiry',
        message: 'Seeking legal guidance regarding labor dispute.',
      },
      expectedSubjectPrefix: '[HRSJM] New Support Enquiry',
      expectedSourceLabel: 'SUPPORT ENQUIRY',
    },
    {
      name: 'Website Feedback',
      payload: {
        formName: 'Feedback',
        submitterName: 'Priya Iyer',
        submitterEmail: 'priya.iyer@example.com',
        submitterPhone: '9876543217',
        subject: 'Feedback',
        message: 'The new portal layout is very accessible and easy to use.',
      },
      expectedSubjectPrefix: '[HRSJM] New Website Feedback',
      expectedSourceLabel: 'WEBSITE FEEDBACK',
    },
  ];

  for (const tc of testCases) {
    it(`should correctly dispatch for ${tc.name} with dynamic subject, visible form source, and no logo`, async () => {
      sendMailSpy.mockClear();

      const result = await service.sendCentralizedWebsiteNotification(tc.payload);

      expect(result.success).toBe(true);
      expect(sendMailSpy).toHaveBeenCalledTimes(1);

      const mailOptions = sendMailSpy.mock.calls[0][0];

      // 1. Correct recipient
      expect(mailOptions.to).toBe('president.hrsjm@gmail.com');
      // 2. Direct replyTo set to submitter
      expect(mailOptions.replyTo).toBe(tc.payload.submitterEmail);
      // 3. Dynamic subject line identifiable directly from Gmail inbox
      expect(mailOptions.subject).toContain(tc.expectedSubjectPrefix);
      // 4. Prominent FORM SOURCE and NEW WEBSITE ENQUIRY at top
      expect(mailOptions.html).toContain('NEW WEBSITE ENQUIRY');
      expect(mailOptions.html).toContain(`FORM SOURCE: ${tc.expectedSourceLabel}`);
      // 5. Clean structured submission details
      expect(mailOptions.html).toContain(tc.payload.submitterName);
      expect(mailOptions.html).toContain(tc.payload.submitterEmail);
      expect(mailOptions.html).toContain(tc.payload.submitterPhone);
      expect(mailOptions.html).toContain(tc.payload.message);

      // 6. Complete removal of logo
      expect(mailOptions.html).not.toContain('cid:hrsjm_logo');
      expect(mailOptions.html).not.toContain('cid:logo');
      expect(mailOptions.html).not.toContain('<img');
      expect(mailOptions.noLogoAttachment).toBe(true);
      expect(mailOptions.attachments).toEqual([]);
    });
  }
});
