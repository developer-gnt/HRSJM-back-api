import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  AdminPasswordResetMailPayload,
  AssistanceRequestConfirmationMailPayload,
  AssistanceStatusUpdateMailPayload,
  ComplaintConfirmationMailPayload,
  ContactInquiryMailPayload,
  DonationThankYouMailPayload,
  MembershipPaymentSuccessMailPayload,
  MembershipStatusUpdateMailPayload,
  MembershipWelcomeMailPayload,
  PasswordChangedNoticeMailPayload,
  PasswordResetLinkMailPayload,
  SendMailOptions,
  TicketStatusUpdateMailPayload,
} from './mail.interface';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly fromAddress: string;
  private readonly fromName: string;
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('mail.host') || process.env.SMTP_HOST;
    const port = Number(this.configService.get<number>('mail.port') || process.env.SMTP_PORT || 587);
    const user = this.configService.get<string>('mail.user') || process.env.SMTP_USER;
    const pass = (this.configService.get<string>('mail.pass') || process.env.SMTP_PASS || '').trim();
    const secure =
      this.configService.get<boolean>('mail.secure') ||
      process.env.SMTP_SECURE === 'true' ||
      port === 465;

    this.fromAddress =
      this.configService.get<string>('mail.from') ||
      process.env.MAIL_FROM ||
      process.env.SMTP_FROM ||
      'thefarooquicollection@gmail.com';
    this.fromName =
      this.configService.get<string>('mail.fromName') ||
      process.env.SMTP_FROM_NAME ||
      'Human Rights & Social Justice Mission (HRSJM)';

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });
      this.isConfigured = true;
    } else {
      this.isConfigured = false;
      this.logger.warn(
        `SMTP is not fully configured (host=${host}, user=${user}, passSet=${!!pass}). Outgoing emails will be logged only.`,
      );
    }
  }

  async onModuleInit() {
    if (this.transporter && this.isConfigured) {
      try {
        await this.transporter.verify();
        this.logger.log('SMTP Transport successfully connected and ready for outgoing emails.');
      } catch (err) {
        this.logger.warn(`SMTP Transport verification failed: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Universal email dispatcher.
   * Can be used anywhere across backend services to send customized transactional emails.
   */
  async sendMail(
    options: SendMailOptions,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { to, subject, html, text, replyTo, cc, bcc } = options;
    const formattedFrom = `"${this.fromName}" <${this.fromAddress}>`;

    const toList = Array.isArray(to) ? to : [to || ''];
    const isTestDomain = toList.some(addr => {
      const clean = String(addr || '').trim().toLowerCase();
      return (
        /@(example\.(com|org|net)|test\.(com|org|net)|sample\.com|dummy\.com|localhost)$/i.test(clean) ||
        clean.includes('example.com') ||
        clean.includes('test.complainant')
      );
    });

    if (isTestDomain) {
      this.logger.log(
        `[TEST RECIPIENT SUPPRESSED] To: ${to} | Subject: "${subject}" | (Skipped SMTP dispatch to prevent "Address not found" bounce notices)`,
      );
      return {
        success: true,
        messageId: `suppressed-test-email-${Date.now()}`,
      };
    }

    if (!this.transporter || !this.isConfigured) {
      this.logger.log(
        `[MOCK MAIL DISPATCH] To: ${to} | Subject: "${subject}" | (SMTP not configured or credentials missing)`,
      );
      return {
        success: true,
        messageId: `mock-mail-${Date.now()}`,
      };
    }

    try {
      const info = await this.transporter.sendMail({
        from: options.from || formattedFrom,
        to,
        subject,
        text,
        html,
        replyTo: replyTo || this.fromAddress,
        cc,
        bcc,
      });

      this.logger.log(`Email successfully delivered to ${to} | MessageId: ${info.messageId}`);
      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (err) {
      const errorMsg = (err as Error).message;
      this.logger.error(`Failed to send email to ${to}: ${errorMsg}`, (err as Error).stack);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Shoot official Thank You & Acknowledgment Email to donors upon successful payment.
   */
  async sendDonationThankYouEmail(payload: DonationThankYouMailPayload): Promise<boolean> {
    const {
      donorName,
      donorEmail,
      amount,
      receiptNumber,
      receiptDate,
      cause,
      paymentMethod,
      gatewayPaymentId,
    } = payload;

    if (!donorEmail || !donorEmail.includes('@')) {
      this.logger.warn(
        `Skipping donation thank-you email for receipt ${receiptNumber}: invalid or missing recipient email (${donorEmail})`,
      );
      return false;
    }

    const cleanDonorName = donorName?.trim() || 'Valued Donor';
    const formattedAmount = `₹${Number(amount || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    const displayDate = receiptDate
      ? new Date(receiptDate).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })
      : new Date().toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        });
    const causeText = cause?.trim() || 'General Support & Human Rights Protection';
    const methodText = paymentMethod || 'Online (Cashfree)';

    const subject = `Gratitude from HRSJM: Thank You for Your Generous Donation (${receiptNumber})`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thank You for Your Donation - HRSJM</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 30px 15px;">
    <tr>
      <td align="center">
        <!-- Main Container Card -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);">
          
          <!-- Top Decorative Header Bar -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%); padding: 32px 30px; text-align: center;">
              <h1 style="margin: 0 0 6px 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">
                HUMAN RIGHTS & SOCIAL JUSTICE MISSION
              </h1>
              <p style="margin: 0; color: #fbbf24; font-size: 14px; font-weight: 600; letter-spacing: 1px;">
                मानव अधिकार - सामाजिक न्याय
              </p>
            </td>
          </tr>

          <!-- Gold Accent Stripe -->
          <tr>
            <td height="4" style="background-color: #f59e0b; line-height: 4px; font-size: 4px;">&nbsp;</td>
          </tr>

          <!-- Body Content Area -->
          <tr>
            <td style="padding: 36px 32px;">
              <!-- Salutation -->
              <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 20px; font-weight: 700;">
                Dear ${cleanDonorName},
              </h2>

              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                On behalf of the entire team, volunteers, and trustees at the <strong>Human Rights & Social Justice Mission (HRSJM)</strong>, we express our heartfelt gratitude for your compassionate contribution.
              </p>

              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                Your generous gift directly empowers us to defend fundamental rights, provide free legal counselling to vulnerable citizens, support children’s education, and fight for justice at the grassroots level.
              </p>

              <!-- Donation Receipt Summary Box -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin: 0 0 28px 0; overflow: hidden;">
                <tr>
                  <td colspan="2" style="background-color: #e0f2fe; padding: 12px 18px; border-bottom: 1px solid #bae6fd;">
                    <span style="font-size: 13px; font-weight: 700; color: #0369a1; text-transform: uppercase; letter-spacing: 0.5px;">
                      Official Donation Receipt Summary
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 14px; color: #64748b; border-bottom: 1px solid #f1f5f9; width: 40%;">
                    Receipt Number
                  </td>
                  <td style="padding: 12px 18px; font-size: 14px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #f1f5f9;">
                    ${receiptNumber}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 14px; color: #64748b; border-bottom: 1px solid #f1f5f9;">
                    Donation Amount
                  </td>
                  <td style="padding: 12px 18px; font-size: 18px; font-weight: 800; color: #15803d; border-bottom: 1px solid #f1f5f9;">
                    ${formattedAmount}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 14px; color: #64748b; border-bottom: 1px solid #f1f5f9;">
                    Cause / Purpose
                  </td>
                  <td style="padding: 12px 18px; font-size: 14px; color: #0f172a; border-bottom: 1px solid #f1f5f9;">
                    ${causeText}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 14px; color: #64748b; border-bottom: 1px solid #f1f5f9;">
                    Date of Receipt
                  </td>
                  <td style="padding: 12px 18px; font-size: 14px; color: #0f172a; border-bottom: 1px solid #f1f5f9;">
                    ${displayDate}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 14px; color: #64748b; border-bottom: 1px solid #f1f5f9;">
                    Payment Mode
                  </td>
                  <td style="padding: 12px 18px; font-size: 14px; color: #0f172a; border-bottom: 1px solid #f1f5f9;">
                    ${methodText}
                  </td>
                </tr>
                ${
                  gatewayPaymentId
                    ? `<tr>
                        <td style="padding: 12px 18px; font-size: 14px; color: #64748b;">
                          Payment ID / Ref
                        </td>
                        <td style="padding: 12px 18px; font-size: 13px; font-family: monospace; color: #475569;">
                          ${gatewayPaymentId}
                        </td>
                      </tr>`
                    : ''
                }
              </table>

              <!-- Impact Statement Highlight Box -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fefce8; border-left: 4px solid #eab308; border-radius: 4px; margin: 0 0 28px 0;">
                <tr>
                  <td style="padding: 16px 18px;">
                    <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #713f12;">
                      <em>"Every single contribution stands between injustice and a voice being heard. Thank you for standing with the people who need it most."</em>
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Closing -->
              <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                With warm regards and solidarity,
              </p>
              <p style="margin: 0; font-size: 16px; font-weight: 700; color: #0f172a;">
                Human Rights & Social Justice Mission
              </p>
              <p style="margin: 2px 0 0 0; font-size: 13px; color: #64748b;">
                National Headquarters, New Delhi, India
              </p>
            </td>
          </tr>

          <!-- Footer Area -->
          <tr>
            <td style="background-color: #0f172a; padding: 24px 30px; text-align: center; color: #94a3b8; font-size: 12px; line-height: 1.6;">
              <p style="margin: 0 0 8px 0; color: #cbd5e1; font-weight: 600;">
                Human Rights & Social Justice Mission (HRSJM)
              </p>
              <p style="margin: 0 0 12px 0;">
                Dedicated to the preservation of Constitutional Rights, Equality, and Social Welfare.
              </p>
              <p style="margin: 0; color: #64748b;">
                This is an automated acknowledgment and official donation receipt. Please keep this email for your financial records.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const plainText = `
HUMAN RIGHTS & SOCIAL JUSTICE MISSION (HRSJM)
मानव अधिकार - सामाजिक न्याय

Dear ${cleanDonorName},

On behalf of the entire team and trustees at Human Rights & Social Justice Mission (HRSJM), we express our heartfelt gratitude for your generous donation.

DONATION RECEIPT SUMMARY
---------------------------------------------
Receipt Number : ${receiptNumber}
Amount         : ${formattedAmount}
Cause / Purpose: ${causeText}
Date           : ${displayDate}
Payment Mode   : ${methodText}
${gatewayPaymentId ? `Payment Ref    : ${gatewayPaymentId}\n` : ''}---------------------------------------------

Your compassionate support empowers our ongoing work in human rights defense, free legal aid, community education, and social justice.

With warm regards and solidarity,
Human Rights & Social Justice Mission (HRSJM)
National Headquarters, New Delhi, India
    `.trim();

    const result = await this.sendMail({
      to: donorEmail,
      subject,
      html,
      text: plainText,
    });

    return result.success;
  }

  /**
   * Shoot Welcome / Acknowledgment Email to new applicants/members upon membership fee confirmation.
   */
  async sendMembershipWelcomeEmail(payload: MembershipWelcomeMailPayload): Promise<boolean> {
    const { memberName, memberEmail, categoryName, amount, receiptNumber } = payload;
    if (!memberEmail || !memberEmail.includes('@')) return false;

    const subject = `Welcome to HRSJM: Membership Application Confirmed (${receiptNumber || 'Official'})`;
    const text = `
Dear ${memberName},

Welcome to Human Rights & Social Justice Mission (HRSJM).
Your membership application and fee payment of ₹${amount || 0} (${categoryName || 'General Membership'}) has been received and verified.

Receipt Number: ${receiptNumber || 'N/A'}

Thank you for joining our mission to uphold human rights and social justice.

Warm regards,
Human Rights & Social Justice Mission (HRSJM)
    `.trim();

    const result = await this.sendMail({
      to: memberEmail,
      subject,
      text,
    });
    return result.success;
  }

  /**
   * Shoot official Payment Successful & Application Confirmation Email to member applicants.
   */
  async sendMembershipPaymentSuccessEmail(
    payload: MembershipPaymentSuccessMailPayload,
  ): Promise<boolean> {
    const {
      applicantName,
      applicantEmail,
      applicantPhone,
      applicationRef,
      categoryName,
      amount,
      transactionId,
      paymentOrderRef,
      paymentMethod,
      paymentDate,
      status,
    } = payload;

    if (!applicantEmail || !applicantEmail.includes('@')) {
      this.logger.warn(
        `Skipping membership payment email for application ${applicationRef}: missing recipient email (${applicantEmail})`,
      );
      return false;
    }

    const cleanName = applicantName?.trim() || 'Applicant';
    const cleanPhone = applicantPhone?.trim() || 'Not Provided';
    const formattedAmount = `₹${Number(amount || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    const displayDate = paymentDate
      ? new Date(paymentDate).toLocaleString('en-IN', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      : new Date().toLocaleString('en-IN', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
    const txnRef = transactionId || paymentOrderRef || 'N/A';
    const methodText = paymentMethod || 'Online (Cashfree Payment Gateway)';
    const statusText = status === 'APPROVED' ? 'Approved & Active' : 'Under Review (Pending Verification)';

    const subject = `Payment Successful: HRSJM Membership Application Received (${applicationRef})`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Successful - HRSJM Membership Application</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 30px 15px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);">
          
          <!-- Header Bar -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%); padding: 32px 30px; text-align: center;">
              <h1 style="margin: 0 0 6px 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">
                HUMAN RIGHTS & SOCIAL JUSTICE MISSION
              </h1>
              <p style="margin: 0; color: #fbbf24; font-size: 14px; font-weight: 600; letter-spacing: 1px;">
                मानव अधिकार - सामाजिक न्याय
              </p>
            </td>
          </tr>

          <!-- Gold Accent Stripe -->
          <tr>
            <td height="4" style="background-color: #f59e0b; line-height: 4px; font-size: 4px;">&nbsp;</td>
          </tr>

          <!-- Success Alert Box -->
          <tr>
            <td style="padding: 24px 32px 0 32px;">
              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px 20px; text-align: center;">
                <div style="display: inline-block; width: 32px; height: 32px; line-height: 32px; border-radius: 50%; background-color: #16a34a; color: #ffffff; font-size: 18px; font-weight: bold; margin-bottom: 8px;">✓</div>
                <h2 style="margin: 0 0 4px 0; color: #15803d; font-size: 18px; font-weight: 700;">
                  Payment Successful
                </h2>
                <p style="margin: 0; color: #166534; font-size: 13px; font-weight: 500;">
                  Your membership fee payment has been confirmed & application recorded.
                </p>
              </div>
            </td>
          </tr>

          <!-- Body Content Area -->
          <tr>
            <td style="padding: 24px 32px 32px 32px;">
              <!-- Salutation -->
              <h3 style="margin: 0 0 12px 0; color: #0f172a; font-size: 17px; font-weight: 700;">
                Dear ${cleanName},
              </h3>

              <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #334155;">
                Thank you for applying for membership with the <strong>Human Rights & Social Justice Mission (HRSJM)</strong>. We have successfully received and verified your registration fee of <strong>${formattedAmount}</strong>.
              </p>

              <!-- Payment & Application Summary Box -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin: 0 0 24px 0; overflow: hidden;">
                <tr>
                  <td colspan="2" style="background-color: #e0f2fe; padding: 12px 18px; border-bottom: 1px solid #bae6fd;">
                    <span style="font-size: 12px; font-weight: 700; color: #0369a1; text-transform: uppercase; letter-spacing: 0.5px;">
                      Membership Payment & Application Receipt
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9; width: 42%;">
                    Application Reference No.
                  </td>
                  <td style="padding: 12px 18px; font-size: 15px; font-weight: 800; color: #1d4ed8; font-family: monospace; border-bottom: 1px solid #f1f5f9;">
                    ${applicationRef}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">
                    Applicant Email
                  </td>
                  <td style="padding: 12px 18px; font-size: 13px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">
                    ${applicantEmail}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">
                    Registered Mobile
                  </td>
                  <td style="padding: 12px 18px; font-size: 13px; color: #0f172a; border-bottom: 1px solid #f1f5f9;">
                    ${cleanPhone}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">
                    Post / Category
                  </td>
                  <td style="padding: 12px 18px; font-size: 13px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">
                    ${categoryName}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">
                    Amount Paid
                  </td>
                  <td style="padding: 12px 18px; font-size: 16px; font-weight: 800; color: #15803d; border-bottom: 1px solid #f1f5f9;">
                    ${formattedAmount}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">
                    Transaction / Order ID
                  </td>
                  <td style="padding: 12px 18px; font-size: 12px; font-family: monospace; color: #475569; border-bottom: 1px solid #f1f5f9;">
                    ${txnRef}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">
                    Payment Mode
                  </td>
                  <td style="padding: 12px 18px; font-size: 13px; color: #0f172a; border-bottom: 1px solid #f1f5f9;">
                    ${methodText}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">
                    Date & Time
                  </td>
                  <td style="padding: 12px 18px; font-size: 13px; color: #0f172a; border-bottom: 1px solid #f1f5f9;">
                    ${displayDate}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #64748b;">
                    Current Status
                  </td>
                  <td style="padding: 12px 18px; font-size: 13px; font-weight: 700; color: #b45309;">
                    ${statusText}
                  </td>
                </tr>
              </table>

              <!-- Next Steps Info Card -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; margin: 0 0 24px 0;">
                <tr>
                  <td style="padding: 16px 18px;">
                    <h4 style="margin: 0 0 6px 0; font-size: 14px; font-weight: 700; color: #1e40af;">
                      What Happens Next?
                    </h4>
                    <ul style="margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.6; color: #1e3a8a;">
                      <li><strong>Document Verification:</strong> Our administrative committee will review your application and submitted proofs against HRSJM membership standards.</li>
                      <li><strong>Approval & Membership Card:</strong> Upon approval, your official Membership Number and digital ID card will be issued.</li>
                      <li><strong>Login Access:</strong> Once approved, you can log in to the HRSJM Member Portal / Mobile App with your registered mobile number / email and the password you set during registration.</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <!-- Closing -->
              <p style="margin: 0 0 4px 0; font-size: 14px; line-height: 1.5; color: #334155;">
                For any queries, please reply to this email or quote your reference number (<strong>${applicationRef}</strong>) to our support team.
              </p>
              <br/>
              <p style="margin: 0; font-size: 14px; color: #334155;">
                With warm regards,
              </p>
              <p style="margin: 4px 0 0 0; font-size: 15px; font-weight: 700; color: #0f172a;">
                Human Rights & Social Justice Mission
              </p>
              <p style="margin: 2px 0 0 0; font-size: 12px; color: #64748b;">
                National Headquarters, New Delhi, India &bull; <a href="https://hrsjm.org" style="color: #2563eb; text-decoration: none;">hrsjm.org</a>
              </p>
            </td>
          </tr>

          <!-- Footer Area -->
          <tr>
            <td style="background-color: #0f172a; padding: 20px 30px; text-align: center; color: #94a3b8; font-size: 12px; line-height: 1.5;">
              <p style="margin: 0 0 6px 0; color: #cbd5e1; font-weight: 600;">
                Human Rights & Social Justice Mission (HRSJM)
              </p>
              <p style="margin: 0;">
                This is an automated payment confirmation and acknowledgment email. Please save this email for your records.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const plainText = `
HUMAN RIGHTS & SOCIAL JUSTICE MISSION (HRSJM)
मानव अधिकार - सामाजिक न्याय

PAYMENT SUCCESSFUL & MEMBERSHIP APPLICATION RECEIVED
------------------------------------------------------
Dear ${cleanName},

Thank you for completing your membership registration payment with Human Rights & Social Justice Mission (HRSJM). Your payment has been confirmed.

PAYMENT & APPLICATION DETAILS:
- Application Reference No : ${applicationRef}
- Registered Email         : ${applicantEmail}
- Registered Mobile        : ${cleanPhone}
- Post / Category          : ${categoryName}
- Amount Paid              : ${formattedAmount}
- Transaction / Order ID   : ${txnRef}
- Payment Mode             : ${methodText}
- Date & Time              : ${displayDate}
- Application Status       : ${statusText}

WHAT HAPPENS NEXT:
1. Document Verification: Our administration committee is verifying your application and uploaded proofs.
2. Official Approval: Once approved, your official Membership Number will be assigned.
3. Login Access: After approval, you can log in to the HRSJM Member Portal / Mobile App using your registered mobile number and password.

For support, quote your Reference Number (${applicationRef}) and contact support@hrsjm.org.

Warm regards,
Human Rights & Social Justice Mission (HRSJM)
National Headquarters, New Delhi, India
https://hrsjm.org
    `.trim();

    const result = await this.sendMail({
      to: applicantEmail,
      subject,
      html,
      text: plainText,
    });

    return result.success;
  }

  /**
   * Shoot official Complaint / Grievance Confirmation Email to citizen.
   */
  async sendComplaintConfirmationEmail(
    payload: ComplaintConfirmationMailPayload,
  ): Promise<boolean> {
    const {
      complainantName,
      complainantEmail,
      complainantPhone,
      ticketId,
      complaintType,
      state,
      policeStation,
      details,
      submittedAt,
      status,
    } = payload;

    if (!complainantEmail || !complainantEmail.includes('@')) {
      this.logger.warn(
        `Skipping complaint confirmation email for ticket ${ticketId}: missing recipient email (${complainantEmail})`,
      );
      return false;
    }

    const cleanName = complainantName?.trim() || 'Complainant';
    const cleanPhone = complainantPhone?.trim() || 'Not Provided';
    const displayDate = submittedAt
      ? new Date(submittedAt).toLocaleString('en-IN', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      : new Date().toLocaleString('en-IN', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });

    const statusText = status || 'Submitted & Under Review (समीक्षाधीन)';
    const subject = `Complaint Registered: HRSJM Grievance Acknowledgement (${ticketId})`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Complaint Registered - HRSJM</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 30px 15px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);">
          
          <!-- Header Bar -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%); padding: 32px 30px; text-align: center;">
              <h1 style="margin: 0 0 6px 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">
                HUMAN RIGHTS & SOCIAL JUSTICE MISSION
              </h1>
              <p style="margin: 0; color: #fbbf24; font-size: 14px; font-weight: 600; letter-spacing: 1px;">
                मानव अधिकार - सामाजिक न्याय
              </p>
            </td>
          </tr>

          <!-- Gold Accent Stripe -->
          <tr>
            <td height="4" style="background-color: #f59e0b; line-height: 4px; font-size: 4px;">&nbsp;</td>
          </tr>

          <!-- Alert Confirmation Banner -->
          <tr>
            <td style="padding: 24px 32px 0 32px;">
              <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px 20px; text-align: center;">
                <div style="display: inline-block; width: 32px; height: 32px; line-height: 32px; border-radius: 50%; background-color: #2563eb; color: #ffffff; font-size: 18px; font-weight: bold; margin-bottom: 8px;">ℹ</div>
                <h2 style="margin: 0 0 4px 0; color: #1e40af; font-size: 18px; font-weight: 700;">
                  Complaint Received & Under Review
                </h2>
                <p style="margin: 0; color: #1e3a8a; font-size: 13px; font-weight: 500;">
                  आपकी शिकायत सफलतापूर्वक दर्ज कर ली गई है एवं समीक्षाधीन है।
                </p>
              </div>
            </td>
          </tr>

          <!-- Body Content Area -->
          <tr>
            <td style="padding: 24px 32px 32px 32px;">
              <!-- Salutation -->
              <h3 style="margin: 0 0 12px 0; color: #0f172a; font-size: 17px; font-weight: 700;">
                Dear ${cleanName},
              </h3>

              <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #334155;">
                Thank you for reaching out to the <strong>Human Rights & Social Justice Mission (HRSJM)</strong>. We have successfully registered your grievance regarding <strong>${complaintType}</strong>.
              </p>

              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #334155;">
                Our legal aid and human rights grievance committee is currently going through the details you provided. An assigned representative will contact you on your registered phone or email regarding the next steps and available support.
              </p>

              <!-- Complaint Summary Box -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin: 0 0 24px 0; overflow: hidden;">
                <tr>
                  <td colspan="2" style="background-color: #e0f2fe; padding: 12px 18px; border-bottom: 1px solid #bae6fd;">
                    <span style="font-size: 12px; font-weight: 700; color: #0369a1; text-transform: uppercase; letter-spacing: 0.5px;">
                      Official Complaint / Ticket Summary
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9; width: 42%;">
                    Complaint / Ticket ID
                  </td>
                  <td style="padding: 12px 18px; font-size: 15px; font-weight: 800; color: #1d4ed8; font-family: monospace; border-bottom: 1px solid #f1f5f9;">
                    ${ticketId}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">
                    Complainant Name
                  </td>
                  <td style="padding: 12px 18px; font-size: 13px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">
                    ${cleanName}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">
                    Contact Phone
                  </td>
                  <td style="padding: 12px 18px; font-size: 13px; color: #0f172a; border-bottom: 1px solid #f1f5f9;">
                    ${cleanPhone}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">
                    Registered Email
                  </td>
                  <td style="padding: 12px 18px; font-size: 13px; color: #0f172a; border-bottom: 1px solid #f1f5f9;">
                    ${complainantEmail}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">
                    Complaint Category
                  </td>
                  <td style="padding: 12px 18px; font-size: 13px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">
                    ${complaintType}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">
                    State / Jurisdiction
                  </td>
                  <td style="padding: 12px 18px; font-size: 13px; color: #0f172a; border-bottom: 1px solid #f1f5f9;">
                    ${state}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">
                    Nearby Police Station
                  </td>
                  <td style="padding: 12px 18px; font-size: 13px; color: #0f172a; border-bottom: 1px solid #f1f5f9;">
                    ${policeStation}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">
                    Date & Time Filed
                  </td>
                  <td style="padding: 12px 18px; font-size: 13px; color: #0f172a; border-bottom: 1px solid #f1f5f9;">
                    ${displayDate}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #64748b;">
                    Current Status
                  </td>
                  <td style="padding: 12px 18px; font-size: 13px; font-weight: 700; color: #b45309;">
                    ${statusText}
                  </td>
                </tr>
              </table>

              <!-- Concern Summary Highlight Box -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fefce8; border-left: 4px solid #eab308; border-radius: 4px; margin: 0 0 24px 0;">
                <tr>
                  <td style="padding: 14px 18px;">
                    <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 700; color: #854d0e;">
                      Reported Concern Summary:
                    </p>
                    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #713f12;">
                      ${details.length > 300 ? details.slice(0, 300) + '...' : details}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Confidentiality & Next Steps -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-radius: 6px; margin: 0 0 24px 0;">
                <tr>
                  <td style="padding: 14px 18px;">
                    <h4 style="margin: 0 0 6px 0; font-size: 13px; font-weight: 700; color: #334155;">
                      Confidentiality & Assistance:
                    </h4>
                    <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #64748b;">
                      Your identity and submitted concern are treated with strict confidentiality in accordance with HRSJM citizen protection guidelines. Please quote your Reference ID (<strong>${ticketId}</strong>) in any follow-up communications.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Closing -->
              <p style="margin: 0; font-size: 14px; color: #334155;">
                With warm regards,
              </p>
              <p style="margin: 4px 0 0 0; font-size: 15px; font-weight: 700; color: #0f172a;">
                Human Rights & Social Justice Mission
              </p>
              <p style="margin: 2px 0 0 0; font-size: 12px; color: #64748b;">
                National Grievance Cell &bull; <a href="https://hrsjm.org" style="color: #2563eb; text-decoration: none;">hrsjm.org</a>
              </p>
            </td>
          </tr>

          <!-- Footer Area -->
          <tr>
            <td style="background-color: #0f172a; padding: 20px 30px; text-align: center; color: #94a3b8; font-size: 12px; line-height: 1.5;">
              <p style="margin: 0 0 6px 0; color: #cbd5e1; font-weight: 600;">
                Human Rights & Social Justice Mission (HRSJM)
              </p>
              <p style="margin: 0;">
                This is an automated grievance acknowledgment. Please retain your Ticket ID for tracking.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const plainText = `
HUMAN RIGHTS & SOCIAL JUSTICE MISSION (HRSJM)
मानव अधिकार - सामाजिक न्याय

COMPLAINT / GRIEVANCE ACKNOWLEDGEMENT
------------------------------------------------------
Dear ${cleanName},

Thank you for contacting Human Rights & Social Justice Mission (HRSJM).
We have received your complaint regarding: ${complaintType}

COMPLAINT DETAILS:
- Ticket / Complaint ID : ${ticketId}
- Complainant Name      : ${cleanName}
- Contact Phone         : ${cleanPhone}
- Registered Email      : ${complainantEmail}
- Category              : ${complaintType}
- State                 : ${state}
- Nearby Police Station : ${policeStation}
- Date & Time           : ${displayDate}
- Status                : ${statusText}

REPORTED CONCERN:
${details}

WHAT HAPPENS NEXT:
Our human rights grievance committee is reviewing your submission and an assigned case officer will contact you shortly on your phone or email.
Your information is kept strictly confidential.

For any queries, quote your Ticket ID (${ticketId}) and contact grievance@hrsjm.org or support@hrsjm.org.

Warm regards,
Human Rights & Social Justice Mission (HRSJM)
https://hrsjm.org
    `.trim();

    const result = await this.sendMail({
      to: complainantEmail,
      subject,
      html,
      text: plainText,
    });

    return result.success;
  }

  /**
   * Shoot official Ticket Status Update Email (Review Started, Resolved, Closed).
   */
  async sendTicketStatusUpdateEmail(
    payload: TicketStatusUpdateMailPayload,
  ): Promise<boolean> {
    const {
      complainantName,
      complainantEmail,
      ticketId,
      subject: ticketSubject,
      category,
      status,
      note,
      updatedAt,
    } = payload;

    if (!complainantEmail || !complainantEmail.includes('@')) {
      this.logger.warn(
        `Skipping status update email for ticket ${ticketId}: missing recipient email (${complainantEmail})`,
      );
      return false;
    }

    const cleanName = complainantName?.trim() || 'Citizen';
    const displayDate = updatedAt
      ? new Date(updatedAt).toLocaleString('en-IN', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      : new Date().toLocaleString('en-IN', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });

    let statusTitle = '';
    let statusSubtitle = '';
    let statusBadgeColor = '#1e3a8a';
    let statusBadgeBg = '#dbeafe';
    let actionExplanation = '';
    let emailSubject = '';

    if (status === 'UNDER_REVIEW') {
      statusTitle = 'Review Commenced on Your Complaint';
      statusSubtitle = 'समीक्षा शुरू की गई — Under Active Review';
      statusBadgeColor = '#92400e';
      statusBadgeBg = '#fef3c7';
      actionExplanation =
        'Our grievance review committee has commenced active review of your ticket. We are evaluating the particulars and coordinating with the relevant authorities or legal advocates to address your grievance.';
      emailSubject = `[HRSJM] Review Started for Ticket: ${ticketId}`;
    } else if (status === 'RESOLVED') {
      statusTitle = 'Your Complaint Has Been Resolved';
      statusSubtitle = 'शिकायत का निवारण किया गया — Resolved';
      statusBadgeColor = '#065f46';
      statusBadgeBg = '#d1fae5';
      actionExplanation =
        'Your complaint has been successfully reviewed, processed, and marked as Resolved by the Human Rights & Social Justice Mission administration.';
      emailSubject = `[HRSJM] Ticket Resolved: ${ticketId}`;
    } else if (status === 'CLOSED') {
      statusTitle = 'Complaint Ticket Closed';
      statusSubtitle = 'टिकट बंद किया गया — Closed';
      statusBadgeColor = '#991b1b';
      statusBadgeBg = '#fee2e2';
      actionExplanation =
        'Your support ticket has been closed by the administration. Thank you for connecting with the Human Rights & Social Justice Mission.';
      emailSubject = `[HRSJM] Ticket Closed: ${ticketId}`;
    } else {
      statusTitle = `Ticket Status Updated to ${status}`;
      statusSubtitle = 'स्थिति अपडेट की गई';
      actionExplanation = `Your support ticket has been updated to ${status}.`;
      emailSubject = `[HRSJM] Ticket Status Update: ${ticketId}`;
    }

    const noteSectionHtml = note
      ? `
      <div style="margin: 24px 0; background-color: #f8fafc; border-left: 4px solid #1e3a8a; border-radius: 6px; padding: 16px 20px;">
        <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 700; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.5px;">
          Official Administration Note / आधिकारिक टिप्पणी:
        </p>
        <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #334155;">
          ${note.replace(/\n/g, '<br/>')}
        </p>
      </div>`
      : '';

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${statusTitle} - HRSJM</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 30px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%); padding: 32px 30px; text-align: center;">
              <h1 style="margin: 0 0 6px 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">
                HUMAN RIGHTS & SOCIAL JUSTICE MISSION
              </h1>
              <p style="margin: 0; color: #fbbf24; font-size: 14px; font-weight: 600; letter-spacing: 1px;">
                मानव अधिकार • सामाजिक न्याय
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 36px 30px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <span style="display: inline-block; padding: 6px 16px; border-radius: 9999px; background-color: ${statusBadgeBg}; color: ${statusBadgeColor}; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                  ${status}
                </span>
                <h2 style="margin: 16px 0 6px 0; color: #0f172a; font-size: 20px; font-weight: 700;">
                  ${statusTitle}
                </h2>
                <p style="margin: 0; color: #64748b; font-size: 13px; font-weight: 500;">
                  ${statusSubtitle}
                </p>
              </div>

              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                Dear <strong>${cleanName}</strong>,
              </p>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                ${actionExplanation}
              </p>

              ${noteSectionHtml}

              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin: 24px 0;">
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9; width: 40%;">
                    Ticket ID / Reference
                  </td>
                  <td style="padding: 12px 18px; font-size: 14px; font-weight: 700; color: #1e3a8a; border-bottom: 1px solid #f1f5f9;">
                    ${ticketId}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">
                    Subject / Concern
                  </td>
                  <td style="padding: 12px 18px; font-size: 13px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">
                    ${ticketSubject}
                  </td>
                </tr>
                ${category ? `
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">
                    Category
                  </td>
                  <td style="padding: 12px 18px; font-size: 13px; color: #0f172a; border-bottom: 1px solid #f1f5f9;">
                    ${category}
                  </td>
                </tr>` : ''}
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">
                    Date & Time Updated
                  </td>
                  <td style="padding: 12px 18px; font-size: 13px; color: #0f172a; border-bottom: 1px solid #f1f5f9;">
                    ${displayDate}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #64748b;">
                    Current Status
                  </td>
                  <td style="padding: 12px 18px; font-size: 13px; font-weight: 700; color: ${statusBadgeColor};">
                    ${status}
                  </td>
                </tr>
              </table>

              <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px 20px; font-size: 13px; color: #475569; line-height: 1.6;">
                <strong>Need Assistance?</strong> If you have any additional questions or need urgent legal counsel, you can reply directly to this email or reach us at <a href="mailto:grievance@hrsjm.org" style="color: #1e3a8a; text-decoration: underline;">grievance@hrsjm.org</a> quoting your Ticket ID <strong>${ticketId}</strong>.
              </div>
            </td>
          </tr>

          <tr>
            <td style="background-color: #f8fafc; padding: 24px 30px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8; line-height: 1.6;">
              <p style="margin: 0 0 6px 0; font-weight: 600; color: #64748b;">
                Human Rights & Social Justice Mission (HRSJM)
              </p>
              <p style="margin: 0;">
                Official correspondence from the Grievance & Legal Redressal Cell.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const plainText = `
HUMAN RIGHTS & SOCIAL JUSTICE MISSION (HRSJM)
मानव अधिकार - सामाजिक न्याय

TICKET STATUS UPDATE: ${status}
------------------------------------------------------
Dear ${cleanName},

${actionExplanation}

${note ? `OFFICIAL ADMINISTRATION NOTE:\n${note}\n\n` : ''}TICKET DETAILS:
- Ticket ID      : ${ticketId}
- Subject        : ${ticketSubject}
- Category       : ${category || 'Grievance'}
- Status         : ${status}
- Updated Date   : ${displayDate}

If you have any questions or require further guidance, contact grievance@hrsjm.org or support@hrsjm.org quoting your Ticket ID (${ticketId}).

Warm regards,
Human Rights & Social Justice Mission (HRSJM)
https://hrsjm.org
    `.trim();

    const result = await this.sendMail({
      to: complainantEmail,
      subject: emailSubject,
      html,
      text: plainText,
    });

    return result.success;
  }

  /**
   * Shoot official Membership Status Update Email (Approved, Active, Under Review, Rejected).
   */
  async sendMembershipStatusUpdateEmail(
    payload: MembershipStatusUpdateMailPayload,
  ): Promise<boolean> {
    const {
      memberName,
      memberEmail,
      membershipNumber,
      categoryName,
      status,
      validFrom,
      validUntil,
      rejectionReason,
      notes,
    } = payload;

    if (!memberEmail || !memberEmail.includes('@')) {
      return false;
    }

    const cleanName = memberName?.trim() || 'Member';
    const isApproved = status === 'APPROVED' || status === 'ACTIVE';
    const isRejected = status === 'REJECTED';

    const statusBadge = isApproved
      ? { label: 'APPROVED & ACTIVE', bg: '#DCFCE7', text: '#15803D', border: '#86EFAC' }
      : isRejected
      ? { label: 'APPLICATION NOT APPROVED', bg: '#FEE2E2', text: '#B91C1C', border: '#FCA5A5' }
      : { label: 'UNDER REVIEW', bg: '#FEF3C7', text: '#B45309', border: '#FCD34D' };

    const emailSubject = isApproved
      ? `🎉 Congratulations! Your HRSJM Membership #${membershipNumber} is Approved`
      : isRejected
      ? `Important: HRSJM Membership Application Update (${membershipNumber})`
      : `Update: Your HRSJM Membership Application #${membershipNumber} is Under Review`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emailSubject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px 12px; color: #1e293b; }
    .card { max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }
    .gold-bar { height: 5px; background: linear-gradient(90deg, #d4af37, #f3e5ab, #d4af37); }
    .header { background-color: #0F2C59; padding: 28px 24px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }
    .header p { margin: 6px 0 0 0; color: #cbd5e1; font-size: 13px; }
    .content { padding: 32px 28px; }
    .badge-wrap { text-align: center; margin: 16px 0 24px; }
    .badge { display: inline-block; padding: 6px 18px; border-radius: 9999px; font-size: 13px; font-weight: 700; background: ${statusBadge.bg}; color: ${statusBadge.text}; border: 1px solid ${statusBadge.border}; text-transform: uppercase; }
    .greeting { font-size: 18px; font-weight: 700; color: #0F2C59; margin-bottom: 12px; }
    .desc { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
    .info-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; background: #f8fafc; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; }
    .info-table td { padding: 12px 16px; font-size: 13px; border-bottom: 1px solid #e2e8f0; }
    .info-table tr:last-child td { border-bottom: none; }
    .label { color: #64748b; font-weight: 600; width: 38%; }
    .value { color: #0F2C59; font-weight: 600; }
    .alert-box { padding: 14px 16px; border-radius: 8px; margin-bottom: 24px; font-size: 13px; line-height: 1.5; background: ${isApproved ? '#eff6ff' : '#fffbeb'}; border-left: 4px solid ${isApproved ? '#3b82f6' : '#f59e0b'}; color: #1e293b; }
    .footer { background: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; line-height: 1.5; }
    .footer a { color: #0F2C59; font-weight: 600; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="gold-bar"></div>
    <div class="header">
      <h1>HUMAN RIGHTS & SOCIAL JUSTICE MISSION</h1>
      <p>राष्ट्रीय मानवाधिकार एवं सामाजिक न्याय मिशन · Official Membership Registry</p>
    </div>
    <div class="content">
      <div class="badge-wrap">
        <span class="badge">${statusBadge.label}</span>
      </div>
      <div class="greeting">Dear ${cleanName},</div>
      <div class="desc">
        ${isApproved
          ? `We are pleased to inform you that your membership application with the <strong>Human Rights & Social Justice Mission (HRSJM)</strong> has been officially approved and activated by the administrative committee. Welcome to our dedicated mission for truth, equality, and constitutional protection across India.`
          : isRejected
          ? `Thank you for your interest in joining the Human Rights & Social Justice Mission. After reviewing your submitted documents and application profile, our administrative committee was unable to approve your application at this time.`
          : `Your membership application with the Human Rights & Social Justice Mission is currently under active review by the verification committee.`}
      </div>

      <table class="info-table">
        <tr>
          <td class="label">Membership Number</td>
          <td class="value">${membershipNumber}</td>
        </tr>
        <tr>
          <td class="label">Category / Post</td>
          <td class="value">${categoryName || 'General Membership'}</td>
        </tr>
        <tr>
          <td class="label">Current Status</td>
          <td class="value">${status}</td>
        </tr>
        ${validFrom ? `<tr><td class="label">Valid From</td><td class="value">${new Date(validFrom).toLocaleDateString('en-IN')}</td></tr>` : ''}
        ${validUntil ? `<tr><td class="label">Valid Until</td><td class="value">${new Date(validUntil).toLocaleDateString('en-IN')}</td></tr>` : ''}
      </table>

      ${rejectionReason ? `
      <div class="alert-box" style="background:#fef2f2;border-left:4px solid #ef4444;">
        <strong>Reason for Decision:</strong><br/>
        ${rejectionReason}
        <br/><br/>
        You are welcome to re-apply or submit updated documents through your applicant portal.
      </div>` : ''}

      ${isApproved ? `
      <div class="alert-box">
        <strong>Member Access & Benefits:</strong><br/>
        You can now log in to the <strong>HRSJM Member Portal / Mobile App</strong> using your registered mobile number and password to download your digital membership ID card, view national directives, and participate in mission initiatives.
      </div>` : ''}

      <div class="desc" style="margin-bottom:0;">
        For any questions or clarification regarding your membership status, please email <a href="mailto:membership@hrsjm.org" style="color:#0F2C59;font-weight:600;">membership@hrsjm.org</a> quoting your Membership Number.
      </div>
    </div>
    <div class="footer">
      <strong>Human Rights & Social Justice Mission (HRSJM)</strong><br/>
      National Headquarters, New Delhi, India<br/>
      <a href="https://hrsjm.org">www.hrsjm.org</a> · <a href="mailto:support@hrsjm.org">support@hrsjm.org</a>
    </div>
  </div>
</body>
</html>
    `.trim();

    const plainText = `
HUMAN RIGHTS & SOCIAL JUSTICE MISSION (HRSJM)
Membership Status Update: ${status}

Dear ${cleanName},

${isApproved
  ? `Congratulations! Your membership #${membershipNumber} with HRSJM has been approved and activated.`
  : isRejected
  ? `Your membership application #${membershipNumber} could not be approved at this time. Reason: ${rejectionReason || 'Document verification criteria not met'}.`
  : `Your membership application #${membershipNumber} is currently under administrative review.`}

MEMBERSHIP DETAILS:
- Membership Number: ${membershipNumber}
- Category: ${categoryName || 'General Membership'}
- Status: ${status}
${validUntil ? `- Validity Until: ${new Date(validUntil).toLocaleDateString('en-IN')}\n` : ''}

For assistance, contact membership@hrsjm.org.

Warm regards,
Human Rights & Social Justice Mission (HRSJM)
https://hrsjm.org
    `.trim();

    const result = await this.sendMail({
      to: memberEmail,
      subject: emailSubject,
      html,
      text: plainText,
    });
    return result.success;
  }

  /**
   * Shoot Temporary Password Email when an administrator resets user/member password.
   */
  async sendAdminPasswordResetEmail(
    payload: AdminPasswordResetMailPayload,
  ): Promise<boolean> {
    const { recipientName, recipientEmail, temporaryPassword, resetDate } = payload;
    if (!recipientEmail || !recipientEmail.includes('@')) return false;

    const cleanName = recipientName?.trim() || 'User';
    const emailSubject = `🔐 Temporary Password for Your HRSJM Account`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${emailSubject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px 12px; color: #1e293b; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }
    .gold-bar { height: 5px; background: linear-gradient(90deg, #d4af37, #f3e5ab, #d4af37); }
    .header { background-color: #0F2C59; padding: 24px; text-align: center; color: #ffffff; }
    .content { padding: 28px 24px; }
    .pass-box { background: #f8fafc; border: 2px dashed #0F2C59; border-radius: 8px; padding: 18px; text-align: center; margin: 20px 0; }
    .pass-text { font-family: monospace; font-size: 24px; font-weight: 700; color: #0F2C59; letter-spacing: 2px; }
    .warning { font-size: 13px; color: #b45309; background: #fef3c7; padding: 12px 14px; border-radius: 6px; margin: 18px 0; line-height: 1.4; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="gold-bar"></div>
    <div class="header">
      <h2 style="margin:0;font-size:18px;">HUMAN RIGHTS & SOCIAL JUSTICE MISSION</h2>
      <p style="margin:4px 0 0 0;font-size:12px;color:#cbd5e1;">Account Security Services</p>
    </div>
    <div class="content">
      <h3 style="color:#0F2C59;margin-top:0;">Hello ${cleanName},</h3>
      <p style="font-size:14px;color:#475569;line-height:1.5;">
        An administrator has reset the password for your account on the <strong>HRSJM Official Portal / Mobile Application</strong>.
      </p>
      <div class="pass-box">
        <div style="font-size:12px;color:#64748b;margin-bottom:6px;text-transform:uppercase;font-weight:600;">Your Temporary Password</div>
        <div class="pass-text">${temporaryPassword}</div>
      </div>
      <div class="warning">
        ⚠️ <strong>Important Security Notice:</strong> Please sign in immediately using this temporary password and change it to a strong, personal password under your Profile / Settings.
      </div>
      <p style="font-size:13px;color:#64748b;">
        If you did not request this password reset or believe this was done in error, please contact our security team immediately at <a href="mailto:security@hrsjm.org" style="color:#0F2C59;font-weight:600;">security@hrsjm.org</a>.
      </p>
    </div>
    <div class="footer">
      HRSJM National IT & Security Division · <a href="https://hrsjm.org" style="color:#0F2C59;">hrsjm.org</a>
    </div>
  </div>
</body>
</html>
    `.trim();

    const plainText = `
HUMAN RIGHTS & SOCIAL JUSTICE MISSION (HRSJM)
Temporary Account Password

Hello ${cleanName},

An administrator has reset the password for your HRSJM account.

Your Temporary Password: ${temporaryPassword}

Please sign in immediately and update your password under your Profile Settings.

If you did not request this change, contact security@hrsjm.org immediately.

Human Rights & Social Justice Mission (HRSJM)
https://hrsjm.org
    `.trim();

    const result = await this.sendMail({
      to: recipientEmail,
      subject: emailSubject,
      html,
      text: plainText,
    });
    return result.success;
  }

  /**
   * Shoot Assistance Request Received Confirmation Email to citizen.
   */
  async sendAssistanceRequestConfirmationEmail(
    payload: AssistanceRequestConfirmationMailPayload,
  ): Promise<boolean> {
    const { applicantName, applicantEmail, requestId, reason, requestedAmount, submittedAt, status } = payload;
    if (!applicantEmail || !applicantEmail.includes('@')) return false;

    const cleanName = applicantName?.trim() || 'Citizen';
    const emailSubject = `Assistance Application Received: ${requestId} - HRSJM Legal & Social Aid`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${emailSubject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px 12px; color: #1e293b; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    .gold-bar { height: 5px; background: linear-gradient(90deg, #d4af37, #f3e5ab, #d4af37); }
    .header { background-color: #0F2C59; padding: 24px; text-align: center; color: #ffffff; }
    .content { padding: 28px 24px; }
    .table { width: 100%; border-collapse: collapse; margin: 20px 0; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
    .table td { padding: 12px 16px; font-size: 13px; border-bottom: 1px solid #e2e8f0; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="gold-bar"></div>
    <div class="header">
      <h2 style="margin:0;font-size:18px;">HUMAN RIGHTS & SOCIAL JUSTICE MISSION</h2>
      <p style="margin:4px 0 0 0;font-size:12px;color:#cbd5e1;">Legal & Humanitarian Assistance Wing</p>
    </div>
    <div class="content">
      <h3 style="color:#0F2C59;margin-top:0;">Dear ${cleanName},</h3>
      <p style="font-size:14px;color:#475569;line-height:1.5;">
        Your application for citizen assistance has been successfully received and recorded in our humanitarian aid registry. Our advocacy and relief desk evaluates every request with utmost urgency and confidentiality.
      </p>
      <table class="table">
        <tr>
          <td style="color:#64748b;font-weight:600;width:38%;">Request Reference</td>
          <td style="color:#0F2C59;font-weight:700;">${requestId}</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-weight:600;">Assistance Purpose</td>
          <td style="color:#0F2C59;font-weight:600;">${reason}</td>
        </tr>
        ${requestedAmount ? `<tr><td style="color:#64748b;font-weight:600;">Requested Aid</td><td style="color:#0F2C59;font-weight:600;">₹${Number(requestedAmount).toLocaleString('en-IN')}</td></tr>` : ''}
        <tr>
          <td style="color:#64748b;font-weight:600;">Initial Status</td>
          <td style="color:#059669;font-weight:600;">${status || 'Submitted (Pending Review)'}</td>
        </tr>
      </table>
      <p style="font-size:13px;color:#64748b;line-height:1.5;">
        Our team will review your application and contact you if supporting documentation is required. You can track your request at any time using your Reference ID.
      </p>
    </div>
    <div class="footer">
      HRSJM Humanitarian Aid Desk · <a href="https://hrsjm.org" style="color:#0F2C59;">hrsjm.org</a> · <a href="mailto:aid@hrsjm.org" style="color:#0F2C59;">aid@hrsjm.org</a>
    </div>
  </div>
</body>
</html>
    `.trim();

    const plainText = `
HUMAN RIGHTS & SOCIAL JUSTICE MISSION (HRSJM)
Assistance Request Confirmation

Dear ${cleanName},

Your application for assistance (${requestId}) has been received by our relief committee.

DETAILS:
- Reference ID: ${requestId}
- Purpose: ${reason}
${requestedAmount ? `- Amount: ₹${requestedAmount}\n` : ''}
- Status: ${status || 'Submitted'}

For inquiries, contact aid@hrsjm.org.

Warm regards,
Human Rights & Social Justice Mission (HRSJM)
https://hrsjm.org
    `.trim();

    const result = await this.sendMail({
      to: applicantEmail,
      subject: emailSubject,
      html,
      text: plainText,
    });
    return result.success;
  }

  /**
   * Shoot Assistance Status Update Email (Approved, Disbursed, Under Review, Rejected).
   */
  async sendAssistanceStatusUpdateEmail(
    payload: AssistanceStatusUpdateMailPayload,
  ): Promise<boolean> {
    const { applicantName, applicantEmail, requestId, reason, status, approvedAmount, rejectionReason, notes } = payload;
    if (!applicantEmail || !applicantEmail.includes('@')) return false;

    const cleanName = applicantName?.trim() || 'Citizen';
    const isApproved = status === 'APPROVED' || status === 'DISBURSED';
    const isRejected = status === 'REJECTED';

    const statusBadge = isApproved
      ? { label: status === 'DISBURSED' ? 'AID DISBURSED' : 'AID APPROVED', bg: '#DCFCE7', text: '#15803D', border: '#86EFAC' }
      : isRejected
      ? { label: 'REQUEST NOT APPROVED', bg: '#FEE2E2', text: '#B91C1C', border: '#FCA5A5' }
      : { label: 'UNDER REVIEW', bg: '#FEF3C7', text: '#B45309', border: '#FCD34D' };

    const emailSubject = isApproved
      ? `✅ Update: Your HRSJM Assistance Request ${requestId} is ${status === 'DISBURSED' ? 'Disbursed' : 'Approved'}`
      : isRejected
      ? `Update Regarding Your Assistance Request ${requestId}`
      : `Update: Assistance Request ${requestId} is Under Review`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${emailSubject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px 12px; color: #1e293b; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    .gold-bar { height: 5px; background: linear-gradient(90deg, #d4af37, #f3e5ab, #d4af37); }
    .header { background-color: #0F2C59; padding: 24px; text-align: center; color: #ffffff; }
    .content { padding: 28px 24px; }
    .badge-wrap { text-align: center; margin: 16px 0 20px; }
    .badge { display: inline-block; padding: 6px 18px; border-radius: 9999px; font-size: 13px; font-weight: 700; background: ${statusBadge.bg}; color: ${statusBadge.text}; border: 1px solid ${statusBadge.border}; text-transform: uppercase; }
    .table { width: 100%; border-collapse: collapse; margin: 20px 0; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
    .table td { padding: 12px 16px; font-size: 13px; border-bottom: 1px solid #e2e8f0; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="gold-bar"></div>
    <div class="header">
      <h2 style="margin:0;font-size:18px;">HUMAN RIGHTS & SOCIAL JUSTICE MISSION</h2>
      <p style="margin:4px 0 0 0;font-size:12px;color:#cbd5e1;">Assistance & Relief Committee</p>
    </div>
    <div class="content">
      <div class="badge-wrap">
        <span class="badge">${statusBadge.label}</span>
      </div>
      <h3 style="color:#0F2C59;margin-top:0;">Dear ${cleanName},</h3>
      <p style="font-size:14px;color:#475569;line-height:1.5;">
        This is an official communication regarding your assistance application <strong>${requestId}</strong>.
      </p>
      <table class="table">
        <tr>
          <td style="color:#64748b;font-weight:600;width:38%;">Request Reference</td>
          <td style="color:#0F2C59;font-weight:700;">${requestId}</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-weight:600;">Status</td>
          <td style="color:#0F2C59;font-weight:600;">${status}</td>
        </tr>
        ${approvedAmount ? `<tr><td style="color:#64748b;font-weight:600;">Approved Aid</td><td style="color:#15803D;font-weight:700;">₹${Number(approvedAmount).toLocaleString('en-IN')}</td></tr>` : ''}
      </table>
      ${rejectionReason ? `
      <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:6px;font-size:13px;margin:16px 0;color:#1e293b;">
        <strong>Reason for Decision:</strong><br/>${rejectionReason}
      </div>` : ''}
      ${notes ? `
      <div style="background:#f8fafc;border-left:4px solid #0F2C59;padding:12px 16px;border-radius:6px;font-size:13px;margin:16px 0;color:#1e293b;">
        <strong>Committee Note:</strong><br/>${notes}
      </div>` : ''}
    </div>
    <div class="footer">
      HRSJM Humanitarian Aid Desk · <a href="https://hrsjm.org" style="color:#0F2C59;">hrsjm.org</a> · <a href="mailto:aid@hrsjm.org" style="color:#0F2C59;">aid@hrsjm.org</a>
    </div>
  </div>
</body>
</html>
    `.trim();

    const plainText = `
HUMAN RIGHTS & SOCIAL JUSTICE MISSION (HRSJM)
Assistance Status Update: ${status}

Dear ${cleanName},

Your assistance request ${requestId} status is now: ${status}.
${approvedAmount ? `Approved Aid Amount: ₹${approvedAmount}\n` : ''}
${rejectionReason ? `Reason: ${rejectionReason}\n` : ''}
${notes ? `Committee Note: ${notes}\n` : ''}

For questions, please contact aid@hrsjm.org.

Warm regards,
Human Rights & Social Justice Mission (HRSJM)
https://hrsjm.org
    `.trim();

    const result = await this.sendMail({
      to: applicantEmail,
      subject: emailSubject,
      html,
      text: plainText,
    });
    return result.success;
  }

  /**
   * Shoot security notification when user password is changed.
   */
  async sendPasswordChangedNoticeEmail(
    payload: PasswordChangedNoticeMailPayload,
  ): Promise<boolean> {
    const { recipientName, recipientEmail, changedAt } = payload;
    if (!recipientEmail || !recipientEmail.includes('@')) return false;

    const cleanName = recipientName?.trim() || 'User';
    const emailSubject = `Security Alert: Your HRSJM Account Password Was Changed`;
    const displayDate = changedAt
      ? new Date(changedAt).toLocaleString('en-IN')
      : new Date().toLocaleString('en-IN');

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${emailSubject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px 12px; color: #1e293b; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    .gold-bar { height: 5px; background: linear-gradient(90deg, #d4af37, #f3e5ab, #d4af37); }
    .header { background-color: #0F2C59; padding: 24px; text-align: center; color: #ffffff; }
    .content { padding: 28px 24px; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="gold-bar"></div>
    <div class="header">
      <h2 style="margin:0;font-size:18px;">HUMAN RIGHTS & SOCIAL JUSTICE MISSION</h2>
      <p style="margin:4px 0 0 0;font-size:12px;color:#cbd5e1;">Security Notice</p>
    </div>
    <div class="content">
      <h3 style="color:#0F2C59;margin-top:0;">Hello ${cleanName},</h3>
      <p style="font-size:14px;color:#475569;line-height:1.5;">
        This email confirms that the password for your <strong>HRSJM account (${recipientEmail})</strong> was successfully changed on <strong>${displayDate}</strong>.
      </p>
      <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:6px;font-size:13px;margin:20px 0;color:#1e293b;">
        <strong>Did not make this change?</strong><br/>
        If you did not make this change, please contact our emergency security team immediately at <a href="mailto:security@hrsjm.org" style="color:#ef4444;font-weight:700;">security@hrsjm.org</a> to protect your account.
      </div>
    </div>
    <div class="footer">
      HRSJM Security Operations · <a href="https://hrsjm.org" style="color:#0F2C59;">hrsjm.org</a>
    </div>
  </div>
</body>
</html>
    `.trim();

    const plainText = `
HUMAN RIGHTS & SOCIAL JUSTICE MISSION (HRSJM)
Security Alert: Password Changed

Hello ${cleanName},

The password for your HRSJM account was changed on ${displayDate}.

If you did not authorize this change, please contact security@hrsjm.org immediately.

Human Rights & Social Justice Mission (HRSJM)
https://hrsjm.org
    `.trim();

    const result = await this.sendMail({
      to: recipientEmail,
      subject: emailSubject,
      html,
      text: plainText,
    });
    return result.success;
  }

  /**
   * Shoot Contact Form Acknowledgement Email to citizen and alert notification to admin.
   */
  async sendContactInquiryEmail(
    payload: ContactInquiryMailPayload,
  ): Promise<{ citizenSent: boolean; adminSent: boolean; inquiryRef: string }> {
    const { senderName, senderEmail, senderPhone, subject, message, inquiryRef, submittedAt } = payload;
    if (!senderEmail || !senderEmail.includes('@')) {
      return { citizenSent: false, adminSent: false, inquiryRef: '' };
    }

    const cleanName = senderName?.trim() || 'Citizen';
    const ref = inquiryRef || `INQ-${Date.now().toString(36).toUpperCase()}`;
    const cleanSubject = subject?.trim() || 'General Inquiry';
    const cleanPhone = senderPhone?.trim() || 'Not Provided';
    const submittedDateStr = new Date(submittedAt || Date.now()).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    // 1. Citizen Acknowledgment Email
    const citizenSubject = `Inquiry Received [${ref}] - Human Rights & Social Justice Mission`;
    const citizenHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${citizenSubject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px 12px; color: #1e293b; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    .gold-bar { height: 5px; background: linear-gradient(90deg, #d4af37, #f3e5ab, #d4af37); }
    .header { background-color: #0F2C59; padding: 24px; text-align: center; color: #ffffff; }
    .content { padding: 28px 24px; }
    .details-box { background: #f8fafc; border-radius: 8px; padding: 16px; margin: 20px 0; border: 1px solid #e2e8f0; font-size: 13.5px; }
    .details-row { display: flex; padding: 6px 0; border-bottom: 1px solid #edf2f7; }
    .details-label { font-weight: 600; width: 140px; color: #475569; }
    .details-value { flex: 1; color: #0f172a; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="gold-bar"></div>
    <div class="header">
      <h2 style="margin:0;font-size:18px;letter-spacing:0.5px;">HUMAN RIGHTS & SOCIAL JUSTICE MISSION</h2>
      <p style="margin:4px 0 0 0;font-size:12px;color:#cbd5e1;">Citizen Information & Helpdesk</p>
    </div>
    <div class="content">
      <h3 style="color:#0F2C59;margin-top:0;">Dear ${cleanName},</h3>
      <p style="font-size:14px;color:#475569;line-height:1.6;">
        Thank you for reaching out to the <strong>Human Rights & Social Justice Mission (HRSJM)</strong>. We have received your message regarding: <strong>${cleanSubject}</strong>.
      </p>
      <div class="details-box">
        <div style="font-weight:700;color:#0F2C59;margin-bottom:8px;font-size:14px;">Your Submission Details:</div>
        <div class="details-row"><span class="details-label">Reference ID:</span><span class="details-value"><strong>${ref}</strong></span></div>
        <div class="details-row"><span class="details-label">Subject:</span><span class="details-value">${cleanSubject}</span></div>
        <div class="details-row"><span class="details-label">Contact Phone:</span><span class="details-value">${cleanPhone}</span></div>
        <div class="details-row"><span class="details-label">Submitted On:</span><span class="details-value">${submittedDateStr} (IST)</span></div>
        <div style="margin-top:12px;padding-top:10px;border-top:1px dashed #cbd5e1;">
          <div style="font-weight:600;color:#475569;margin-bottom:4px;">Your Message:</div>
          <div style="color:#1e293b;line-height:1.5;white-space:pre-wrap;">${message}</div>
        </div>
      </div>
      <p style="font-size:13.5px;color:#64748b;line-height:1.6;">
        Our secretariat team reviews all incoming inquiries and will respond within <strong>24 to 48 hours</strong>.
      </p>
      <p style="font-size:12.5px;color:#94a3b8;line-height:1.5;margin-top:16px;">
        For urgent matters, feel free to call our helpline at <strong>+91 7021057853</strong> or write to <strong>enquiry@hrsjm.org</strong> quoting reference <strong>${ref}</strong>.
      </p>
    </div>
    <div class="footer">
      HRSJM National Secretariat · Sr. Mathuradas Vasani Rd, Marol Naka, Andheri East, Mumbai 400059<br/>
      <a href="https://hrsjm.org" style="color:#0F2C59;text-decoration:none;font-weight:600;">hrsjm.org</a> · <a href="mailto:enquiry@hrsjm.org" style="color:#0F2C59;text-decoration:none;">enquiry@hrsjm.org</a>
    </div>
  </div>
</body>
</html>
    `.trim();

    const citizenPlainText = `
HUMAN RIGHTS & SOCIAL JUSTICE MISSION (HRSJM)
Inquiry Acknowledgment [${ref}]

Dear ${cleanName},

Thank you for reaching out to HRSJM. We have received your inquiry regarding "${cleanSubject}" under Reference Number: ${ref}.

DETAILS:
- Reference ID : ${ref}
- Name         : ${cleanName}
- Phone        : ${cleanPhone}
- Subject      : ${cleanSubject}
- Submitted On : ${submittedDateStr} (IST)

YOUR MESSAGE:
${message}

Our secretariat team will get back to you within 24 to 48 hours.
Helpline: +91 7021057853 | Email: enquiry@hrsjm.org | Website: https://hrsjm.org
    `.trim();

    // 2. Admin Notification Email
    const adminEmail =
      process.env.ADMIN_NOTIFICATION_EMAIL ||
      process.env.ADMIN_EMAIL ||
      process.env.MAIL_FROM ||
      'thefarooquicollection@gmail.com';

    const adminSubject = `[New Contact Inquiry] ${cleanName} - "${cleanSubject}" [${ref}]`;
    const adminHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${adminSubject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px 12px; color: #1e293b; }
    .card { max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    .alert-bar { height: 5px; background: #ea580c; }
    .header { background-color: #0F2C59; padding: 22px 24px; color: #ffffff; }
    .badge { display: inline-block; background: #ea580c; color: #ffffff; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; margin-bottom: 8px; }
    .content { padding: 24px; }
    .info-table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13.5px; }
    .info-table td { padding: 8px 12px; border-bottom: 1px solid #edf2f7; }
    .info-table td.label { width: 140px; font-weight: 600; color: #475569; background: #f8fafc; }
    .message-card { background: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 16px; margin: 16px 0; font-size: 14px; color: #78350f; line-height: 1.6; }
    .footer { background: #f8fafc; padding: 16px 24px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="alert-bar"></div>
    <div class="header">
      <span class="badge">Website Contact Form</span>
      <h2 style="margin:0;font-size:19px;">New Citizen Inquiry Received</h2>
      <p style="margin:4px 0 0 0;font-size:12px;color:#cbd5e1;">Reference: ${ref}</p>
    </div>
    <div class="content">
      <p style="font-size:14px;color:#334155;margin-top:0;">
        A visitor has submitted a message via the <strong>HRSJM Contact Us</strong> form. Details are provided below:
      </p>

      <table class="info-table">
        <tr>
          <td class="label">Reference ID</td>
          <td><strong>${ref}</strong></td>
        </tr>
        <tr>
          <td class="label">Citizen Name</td>
          <td><strong>${cleanName}</strong></td>
        </tr>
        <tr>
          <td class="label">Email Address</td>
          <td><a href="mailto:${senderEmail}" style="color:#0F2C59;font-weight:600;">${senderEmail}</a></td>
        </tr>
        <tr>
          <td class="label">Phone Number</td>
          <td><a href="tel:${cleanPhone}" style="color:#0F2C59;">${cleanPhone}</a></td>
        </tr>
        <tr>
          <td class="label">Subject</td>
          <td><strong>${cleanSubject}</strong></td>
        </tr>
        <tr>
          <td class="label">Submitted At</td>
          <td>${submittedDateStr} (IST)</td>
        </tr>
      </table>

      <div style="font-weight:700;color:#0F2C59;margin:18px 0 6px 0;font-size:14px;">Inquiry Message:</div>
      <div class="message-card">
        ${message}
      </div>

      <div style="background:#eff6ff;border:1px solid #dbeafe;border-radius:6px;padding:12px 16px;font-size:13px;color:#1e40af;margin-top:16px;">
        💡 <strong>Quick Action:</strong> Click "Reply" in your email client to respond directly to <strong>${cleanName}</strong> at <code>${senderEmail}</code>.
      </div>
    </div>
    <div class="footer">
      This is an automated notification from the HRSJM Website Portal.
    </div>
  </div>
</body>
</html>
    `.trim();

    const adminPlainText = `
[NEW CONTACT INQUIRY RECEIVED]
Reference ID : ${ref}
Citizen Name : ${cleanName}
Email        : ${senderEmail}
Phone        : ${cleanPhone}
Subject      : ${cleanSubject}
Date & Time  : ${submittedDateStr} (IST)

MESSAGE:
${message}

You can reply directly to this email to respond to ${senderEmail}.
    `.trim();

    // 3. Dispatch both emails in parallel
    const [citizenResult, adminResult] = await Promise.all([
      this.sendMail({
        to: senderEmail,
        subject: citizenSubject,
        html: citizenHtml,
        text: citizenPlainText,
      }),
      this.sendMail({
        to: adminEmail,
        replyTo: senderEmail,
        subject: adminSubject,
        html: adminHtml,
        text: adminPlainText,
      }),
    ]);

    this.logger.log(
      `Contact inquiry [${ref}] processed: citizenEmail=${citizenResult.success ? 'sent' : 'failed'}, adminEmail=${adminResult.success ? 'sent' : 'failed'}`
    );

    return {
      citizenSent: citizenResult.success,
      adminSent: adminResult.success,
      inquiryRef: ref,
    };
  }

  /**
   * Dispatch password reset link email with 15-minute validity.
   * Never logs the raw reset URL or tokens.
   */
  async sendPasswordResetLinkEmail(
    payload: PasswordResetLinkMailPayload,
  ): Promise<boolean> {
    const { recipientName, recipientEmail, resetUrl, expiresInMinutes = 15 } = payload;
    if (!recipientEmail || !recipientEmail.includes('@')) return false;

    const cleanName = recipientName?.trim() || 'Valued Member';
    const emailSubject = `🔐 Reset Your Password - Human Rights & Social Justice Mission`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emailSubject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF7F0; margin: 0; padding: 24px 12px; color: #1e293b; }
    .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 20px rgba(1,31,57,0.08); border: 1px solid #DCE4EC; }
    .gold-bar { height: 4px; background: linear-gradient(90deg, #FAD465, #E9B82E, #FAD465); }
    .header { background-color: #011F39; padding: 28px 24px; text-align: center; color: #ffffff; }
    .header h2 { margin: 0; font-size: 19px; letter-spacing: 0.5px; font-weight: 800; color: #FFFFFF; }
    .header p { margin: 6px 0 0 0; font-size: 12px; color: #FAD465; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600; }
    .content { padding: 32px 28px; }
    .content h3 { color: #0B2F52; margin-top: 0; font-size: 18px; font-weight: 700; }
    .content p { font-size: 14px; color: #34516D; line-height: 1.6; margin: 12px 0; }
    .btn-container { text-align: center; margin: 28px 0; }
    .reset-btn { background-color: #FAD465; color: #011F39 !important; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 8px; text-decoration: none; display: inline-block; box-shadow: 0 2px 8px rgba(250,212,101,0.4); }
    .link-box { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 12px 14px; margin: 20px 0; word-break: break-all; font-size: 12px; color: #64748B; line-height: 1.4; }
    .warning { font-size: 13px; color: #92400E; background: #FEF3C7; border: 1px solid #FDE68A; padding: 12px 16px; border-radius: 8px; margin: 20px 0; line-height: 1.5; }
    .footer { background: #F8FAFC; padding: 22px 24px; text-align: center; border-top: 1px solid #E2E8F0; font-size: 12px; color: #718096; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="gold-bar"></div>
    <div class="header">
      <h2>HUMAN RIGHTS &amp; SOCIAL JUSTICE MISSION</h2>
      <p>Official Account Security</p>
    </div>
    <div class="content">
      <h3>Hello ${cleanName},</h3>
      <p>
        We received a request to reset the password for your account associated with <strong>${recipientEmail}</strong> on the <strong>HRSJM Portal and Mobile Application</strong>.
      </p>
      <p>
        To choose a new password, please click the button below:
      </p>
      <div class="btn-container">
        <a href="${resetUrl}" class="reset-btn" target="_blank" rel="noopener noreferrer">Reset Password</a>
      </div>
      <div class="warning">
        ⏳ <strong>Security Notice:</strong> This password reset link is valid for <strong>${expiresInMinutes} minutes</strong> only and can be used once. For your protection, never share this link with anyone.
      </div>
      <p style="font-size: 12px; color: #64748B;">
        If the button above does not work, copy and paste the following URL into your mobile or desktop browser:
      </p>
      <div class="link-box">
        <a href="${resetUrl}" style="color: #174A78; text-decoration: none;">${resetUrl}</a>
      </div>
      <p style="font-size: 13px; color: #718096; margin-top: 24px;">
        If you did not request this password reset, please disregard this email. Your password will remain unchanged and your account is completely safe.
      </p>
    </div>
    <div class="footer">
      Human Rights &amp; Social Justice Mission (HRSJM)<br>
      National IT &amp; Security Division · <a href="https://hrsjm.org" style="color: #0B2F52; text-decoration: none;">hrsjm.org</a> · New Delhi, India
    </div>
  </div>
</body>
</html>
    `.trim();

    const plainText = `
HUMAN RIGHTS & SOCIAL JUSTICE MISSION (HRSJM)
Account Password Reset

Hello ${cleanName},

We received a request to reset your password for your account (${recipientEmail}) on the HRSJM application and portal.

To reset your password, please open the following link in your browser:
${resetUrl}

This link is valid for ${expiresInMinutes} minutes and can only be used once.

If you did not request this reset, you can safely ignore this email. Your password will remain unchanged.

Human Rights & Social Justice Mission
https://hrsjm.org
    `.trim();

    const result = await this.sendMail({
      to: recipientEmail,
      subject: emailSubject,
      html,
      text: plainText,
    });

    return result.success;
  }

}
