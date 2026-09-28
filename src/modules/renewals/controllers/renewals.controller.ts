import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedRequest,
  JwtAuthGuard,
} from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { RenewalsService } from '../services/renewals.service';
import { CreateRenewalDto } from '../dto/renewal.dto';

@ApiTags('renewals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('renewals')
export class RenewalsController {
  constructor(private readonly renewalsService: RenewalsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a membership renewal request' })
  apply(
    @Body() dto: CreateRenewalDto,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.renewalsService.apply(dto, user.sub);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user renewal requests' })
  getMyRenewals(@AuthenticatedUser() user: { sub: string }) {
    return this.renewalsService.listMyRenewals(user.sub);
  }

  @Get('membership/:membershipNumber')
  @ApiOperation({ summary: 'List renewal history for a membership number' })
  listForMembership(@Param('membershipNumber') membershipNumber: string) {
    return this.renewalsService.listForMembership(membershipNumber);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get renewal request details by ID' })
  getById(
    @Param('id') id: string,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    return this.renewalsService.getById(id, user.sub, isAdmin);
  }
}
