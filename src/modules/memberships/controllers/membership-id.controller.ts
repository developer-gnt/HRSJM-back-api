import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { MembershipsService } from '../services/memberships.service';

@ApiTags('membership-id')
@Controller('membership-id')
export class MembershipIdController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get(':membershipNumber/validate')
  @ApiOperation({ summary: 'Validate a digital membership ID (public, for QR scans)' })
  validate(@Param('membershipNumber') membershipNumber: string) {
    return this.membershipsService.validateMembership(membershipNumber);
  }

  @Get(':membershipNumber')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiOperation({ summary: 'Look up digital membership card details' })
  lookup(@Param('membershipNumber') membershipNumber: string) {
    return this.membershipsService.getDigitalId(membershipNumber);
  }
}
