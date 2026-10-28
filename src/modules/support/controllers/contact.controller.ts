import { Body, Controller, Post, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';
import { MailService } from '../../mail/mail.service';
import { CreateContactInquiryDto } from '../dto/create-contact-inquiry.dto';

@ApiTags('contact')
@Controller('contact')
export class ContactController {
  private readonly logger = new Logger(ContactController.name);

  constructor(private readonly mailService: MailService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit contact inquiry form and shoot emails to citizen and admin' })
  @ApiResponse({ status: 200, description: 'Inquiry processed and emails dispatched' })
  async submitContactInquiry(@Body() dto: CreateContactInquiryDto) {
    this.logger.log(`Received contact inquiry from ${dto.name} (${dto.email})`);

    const result = await this.mailService.sendContactInquiryEmail({
      senderName: dto.name,
      senderEmail: dto.email,
      senderPhone: dto.phone,
      subject: dto.subject,
      message: dto.message,
    });

    return {
      success: true,
      message:
        'Your message has been received. A confirmation has been sent to your email and our admin team has been notified.',
      inquiryRef: result.inquiryRef,
      citizenSent: result.citizenSent,
      adminSent: result.adminSent,
    };
  }
}
