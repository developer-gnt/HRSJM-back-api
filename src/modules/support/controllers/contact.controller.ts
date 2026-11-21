import { Body, Controller, Post, HttpCode, HttpStatus, Logger, InternalServerErrorException } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';
import { MailService } from '../../mail/mail.service';
import { SupportService } from '../services/support.service';
import { CreateContactInquiryDto } from '../dto/create-contact-inquiry.dto';

@ApiTags('contact')
@Controller('contact')
export class ContactController {
  private readonly logger = new Logger(ContactController.name);

  constructor(
    private readonly mailService: MailService,
    private readonly supportService: SupportService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit contact inquiry form and shoot emails to citizen and admin' })
  @ApiResponse({ status: 200, description: 'Inquiry processed and emails dispatched' })
  async submitContactInquiry(@Body() dto: CreateContactInquiryDto) {
    const formName = dto.formName?.trim() || 'Contact Us';
    this.logger.log(`Received ${formName} submission from ${dto.name} (${dto.email})`);

    // Server-side spam protection / honeypot check
    const rawBody: any = dto;
    if (rawBody.website || rawBody._hp || rawBody.honeypot) {
      this.logger.warn(`Spam bot submission trapped from ${dto.email}`);
      return {
        success: true,
        message: 'Your message has been received successfully! Our administrative team will get back to you shortly.',
        inquiryRef: 'HRSJM-SPAM-PREVENTED',
        ticketId: '',
        citizenSent: false,
        adminSent: false,
        formName,
      };
    }

    let ticketRef = '';
    let ticketId = '';
    try {
      const ticketResult = await this.supportService.createContactInquiryTicket(dto);
      ticketRef = ticketResult.ticketRef;
      ticketId = ticketResult.ticketId;
    } catch (err: any) {
      this.logger.error(`Failed creating ticket for contact inquiry: ${err?.message}`, err?.stack);
    }

    let emailResult: any = { inquiryRef: ticketRef, citizenSent: false, adminSent: false };
    try {
      emailResult = await this.mailService.sendContactInquiryEmail({
        formName,
        senderName: dto.name,
        senderEmail: dto.email,
        senderPhone: dto.phone,
        subject: dto.subject,
        message: dto.message,
        inquiryRef: ticketRef,
        metadata: dto.metadata,
      });
    } catch (err: any) {
      this.logger.warn(`Could not dispatch contact inquiry email: ${err?.message}`);
    }

    const ref = ticketRef || emailResult.inquiryRef || `HRSJM-MSG-${Date.now().toString().slice(-6)}`;

    // Do not report a successful submission if email delivery fails, unless the submission
    // has been successfully saved to database as a ticket.
    if (!emailResult.adminSent && !ticketId) {
      throw new InternalServerErrorException(
        'Unable to deliver notification email or record enquiry at this time. Please try again shortly or write to president.hrsjm@gmail.com directly.',
      );
    }

    return {
      success: true,
      message:
        'Your message has been received successfully! Our administrative team will get back to you shortly.',
      inquiryRef: ref,
      ticketId,
      citizenSent: emailResult.citizenSent,
      adminSent: emailResult.adminSent,
      emailPending: !emailResult.adminSent && Boolean(ticketId),
      formName,
    };
  }
}
