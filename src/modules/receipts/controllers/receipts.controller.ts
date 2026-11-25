import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../../common/guards/optional-jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { ReceiptsService } from '../services/receipts.service';

@ApiTags('receipts')
@Controller()
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get('receipts/my')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List all receipts for current user' })
  getMyReceipts(
    @AuthenticatedUser() user: { sub: string },
    @Query('page') page = 1,
    @Query('limit') limit = 50,
    @Query('type') type?: string,
  ) {
    return this.receiptsService.listByUser(
      user.sub,
      Number(page) || 1,
      Number(limit) || 50,
      type,
    );
  }

  @Get('receipts/membership/:paymentId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get receipt by membership payment ID' })
  getByMembershipPayment(@Param('paymentId') paymentId: string) {
    return this.receiptsService.getByMembershipPaymentId(paymentId);
  }

  @Get('receipts/donation/:donationId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get receipt by donation ID, payment ID, or receipt number' })
  getByDonation(@Param('donationId') donationId: string) {
    return this.receiptsService.getByDonationPaymentId(donationId);
  }

  @Get('admin/receipts')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('payment.read')
  @ApiOperation({ summary: 'List all issued receipts (admin)' })
  listAll(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.receiptsService.listAll(Number(page) || 1, Number(limit) || 20);
  }

  @Get('receipts/:id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get receipt details by ID or Receipt Number' })
  getReceiptById(
    @Param('id') id: string,
    @AuthenticatedUser() user?: { sub: string; roles?: string[] },
  ) {
    const isAdmin = (user?.roles || []).includes('ADMIN');
    return this.receiptsService.getByIdOrNumber(id, user?.sub || '', isAdmin);
  }
}
