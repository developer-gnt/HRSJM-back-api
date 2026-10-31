import { Body, Controller, Post, HttpCode, HttpStatus, Logger } from '@nestjs/common';
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
    this.logger.log(`Received contact inquiry from ${dto.name} (${dto.email})`);

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
        senderName: dto.name,
        senderEmail: dto.email,
        senderPhone: dto.phone,
        subject: dto.subject,
        message: dto.message,
      });
    } catch (err: any) {
      this.logger.warn(`Could not dispatch contact inquiry email: ${err?.message}`);
    }

    const ref = ticketRef || emailResult.inquiryRef || `HRSJM-MSG-${Date.now().toString().slice(-6)}`;

    return {
      success: true,
      message:
        'Your message has been received successfully! Our administrative team will get back to you shortly.',
      inquiryRef: ref,
      ticketId,
      citizenSent: emailResult.citizenSent,
      adminSent: emailResult.adminSent,
    };
  }
}
