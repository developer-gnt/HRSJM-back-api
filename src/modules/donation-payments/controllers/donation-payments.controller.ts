import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedRequest,
  JwtAuthGuard,
} from '../../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../../common/guards/optional-jwt-auth.guard';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/guards/permissions.guard';
import { DonationPaymentsService } from '../services/donation-payments.service';
import { CreateDonationPaymentDto } from '../dto/create-donation-payment.dto';
import { VerifyDonationPaymentDto } from '../dto/verify-donation-payment.dto';
import { UpdateDonationPaymentStatusDto } from '../dto/update-donation-payment-status.dto';
import { ListDonationPaymentsDto } from '../dto/list-donation-payments.dto';

@ApiTags('donation-payments')
@Controller('donation-payments')
export class DonationPaymentsController {
  constructor(
    private readonly donationPaymentsService: DonationPaymentsService,
  ) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Initiate/record a donation payment' })
  create(
    @Body() dto: CreateDonationPaymentDto,
    @AuthenticatedUser() user?: { sub: string },
  ) {
    return this.donationPaymentsService.create(dto, user?.sub);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiOperation({ summary: 'List donation payments (own or all for admin)' })
  list(
    @Query() dto: ListDonationPaymentsDto,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    return this.donationPaymentsService.list(dto, user.sub, isAdmin);
  }

  @Get('my')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List current user donation payments' })
  getMyDonations(
    @Query() dto: ListDonationPaymentsDto,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.donationPaymentsService.list(dto, user.sub, false);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'View single donation payment details' })
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthenticatedUser() user?: { sub: string },
    @Req() req?: AuthenticatedRequest,
  ) {
    const isAdmin = req?.user?.roles?.includes('ADMIN') ?? false;
    return this.donationPaymentsService.getById(id, user?.sub, isAdmin);
  }

  @Post('verify')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Verify gateway donation payment (id in body)' })
  verifyDirect(
    @Body() dto: VerifyDonationPaymentDto,
    @AuthenticatedUser() user?: { sub: string },
    @Req() req?: AuthenticatedRequest,
  ) {
    const isAdmin = req?.user?.roles?.includes('ADMIN') ?? false;
    const paymentId = dto.payment_id;
    if (!paymentId) {
      throw new BadRequestException('payment_id is required in body');
    }
    return this.donationPaymentsService.verify(paymentId, dto, user?.sub, isAdmin);
  }

  @Post(':id/verify')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Verify gateway donation payment and post the accounting entry (idempotent)',
  })
  verify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyDonationPaymentDto,
    @AuthenticatedUser() user?: { sub: string },
    @Req() req?: AuthenticatedRequest,
  ) {
    const isAdmin = req?.user?.roles?.includes('ADMIN') ?? false;
    return this.donationPaymentsService.verify(id, dto, user?.sub, isAdmin);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('payment.manage_status')
  @ApiOperation({
    summary:
      'Manually update donation payment status (admin offline marks; REFUNDED must use the refund endpoint)',
  })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDonationPaymentStatusDto,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.donationPaymentsService.updateStatus(
      id,
      dto,
      user.sub,
      true,
    );
  }

  @Get(':id/receipt')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get generated receipt for a verified donation payment' })
  getReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthenticatedUser() user?: { sub: string },
    @Req() req?: AuthenticatedRequest,
  ) {
    const isAdmin = req?.user?.roles?.includes('ADMIN') ?? false;
    return this.donationPaymentsService.getReceipt(id, user?.sub, isAdmin);
  }
}
