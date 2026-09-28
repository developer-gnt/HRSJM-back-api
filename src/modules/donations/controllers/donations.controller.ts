import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { DonationsService } from '../services/donations.service';
import { RefundDonationDto } from '../dto/refund-donation.dto';

/**
 * Scaffold controller — full donations CRUD belongs to Arshad's future
 * module. Phase 9 owns only the financial refund endpoint on this resource.
 */
@ApiTags('donations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('donations')
export class DonationsController {
  constructor(private readonly donationsService: DonationsService) {}

  @Post(':id/refund')
  @RequirePermissions('donation.refund')
  @ApiOperation({
    summary:
      'Refund a verified donation in full — posts a mirrored accounting reversal (admin)',
  })
  refund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundDonationDto,
    @AuthenticatedUser() user?: { sub: string },
  ) {
    return this.donationsService.refund(id, dto ?? {}, user?.sub ?? '');
  }
}
