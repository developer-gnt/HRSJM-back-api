import {
  Body,
  Controller,
  Get,
  Param,
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
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { MembershipPaymentsService } from '../services/membership-payments.service';
import { CreateMembershipPaymentDto } from '../dto/create-membership-payment.dto';
import { VerifyMembershipPaymentDto } from '../dto/verify-membership-payment.dto';
import { UpdateMembershipPaymentStatusDto } from '../dto/update-membership-payment-status.dto';
import { ListMembershipPaymentsDto } from '../dto/list-membership-payments.dto';

@ApiTags('membership-payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('membership-payments')
export class MembershipPaymentsController {
  constructor(
    private readonly paymentsService: MembershipPaymentsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Initiate/record a membership payment' })
  create(
    @Body() dto: CreateMembershipPaymentDto,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    return this.paymentsService.create(dto, user.sub, isAdmin);
  }

  @Get()
  @ApiOperation({ summary: 'List membership payments (own or all for admin)' })
  list(
    @Query() dto: ListMembershipPaymentsDto,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    return this.paymentsService.list(dto, user.sub, isAdmin);
  }

  @Get(':id')
  @ApiOperation({ summary: 'View single payment details' })
  getById(
    @Param('id') id: string,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    return this.paymentsService.getById(id, user.sub, isAdmin);
  }

  @Patch(':id/status')
  @RequirePermissions('payment.manage_status')
  @ApiOperation({ summary: 'Manually update payment status (admin, e.g. for offline payments)' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateMembershipPaymentStatusDto,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.paymentsService.updateStatus(id, dto, user.sub);
  }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Verify gateway payment and activate membership (idempotent)' })
  verify(
    @Param('id') id: string,
    @Body() dto: VerifyMembershipPaymentDto,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    return this.paymentsService.verify(id, dto, user.sub, isAdmin);
  }

  @Get(':id/receipt')
  @ApiOperation({ summary: 'Get generated receipt for verified payment' })
  getReceipt(
    @Param('id') id: string,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    return this.paymentsService.getReceipt(id, user.sub, isAdmin);
  }
}
