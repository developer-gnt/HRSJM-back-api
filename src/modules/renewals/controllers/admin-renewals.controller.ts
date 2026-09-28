import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { RenewalsService } from '../services/renewals.service';
import {
  ListRenewalsDto,
  ReviewRenewalDto,
  UpdateRenewalPaymentDto,
} from '../dto/renewal.dto';

@ApiTags('admin-renewals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/renewals')
export class AdminRenewalsController {
  constructor(private readonly renewalsService: RenewalsService) {}

  @Get()
  @RequirePermissions('renewal.read')
  @ApiOperation({ summary: 'List and filter renewal requests (admin)' })
  list(@Query() dto: ListRenewalsDto) {
    return this.renewalsService.list(dto);
  }

  @Patch(':id/approve')
  @RequirePermissions('renewal.manage')
  @ApiOperation({ summary: 'Approve a renewal request (admin)' })
  approve(
    @Param('id') id: string,
    @Body() dto: ReviewRenewalDto,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.renewalsService.approve(id, dto, user.sub);
  }

  @Patch(':id/reject')
  @RequirePermissions('renewal.manage')
  @ApiOperation({ summary: 'Reject a renewal request (admin)' })
  reject(
    @Param('id') id: string,
    @Body() dto: ReviewRenewalDto,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.renewalsService.reject(id, dto, user.sub);
  }

  @Patch(':id/payment')
  @RequirePermissions('renewal.manage')
  @ApiOperation({ summary: 'Update renewal payment status (admin)' })
  updatePayment(
    @Param('id') id: string,
    @Body() dto: UpdateRenewalPaymentDto,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.renewalsService.updatePayment(id, dto, user.sub);
  }

  @Post(':id/activate')
  @RequirePermissions('renewal.manage')
  @ApiOperation({ summary: 'Activate approved renewal and extend membership expiry (admin)' })
  activate(
    @Param('id') id: string,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.renewalsService.activate(id, user.sub);
  }
}
