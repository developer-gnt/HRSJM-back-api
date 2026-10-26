import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  ComplaintConfirmationMailPayload,
  DonationThankYouMailPayload,
  MembershipPaymentSuccessMailPayload,
  MembershipWelcomeMailPayload,
  SendMailOptions,
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
}


