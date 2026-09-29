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
import { MembershipsService } from '../services/memberships.service';
import { CreateMembershipDto } from '../dto/create-membership.dto';
import { UpdateMembershipDto } from '../dto/update-membership.dto';
import { ListMembershipsDto } from '../dto/list-memberships.dto';
import { UpdateMembershipStatusDto } from '../dto/update-membership-status.dto';

@ApiTags('memberships')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Post(['memberships', 'memberships/apply'])
  @ApiOperation({ summary: 'Apply for membership' })
  apply(
    @Body() dto: CreateMembershipDto,
    @AuthenticatedUser() user: { sub: string; roles?: string[] },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    return this.membershipsService.apply(dto, user.sub, isAdmin);
  }

  @Get('memberships')
  @RequirePermissions('membership.read')
  @ApiOperation({ summary: 'List/filter memberships (admin)' })
  list(@Query() dto: ListMembershipsDto) {
    return this.membershipsService.list(dto);
  }

  @Get(['users/me/membership', 'memberships/my'])
  @ApiOperation({ summary: 'Get current user membership profile' })
  getMyMembership(@AuthenticatedUser() user: { sub: string }) {
    return this.membershipsService.getMyMembership(user.sub);
  }

  @Get('memberships/:id')
  @ApiOperation({ summary: 'View single membership details (owner or admin)' })
  getById(
    @Param('id') id: string,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    return this.membershipsService.getById(id, user.sub, isAdmin);
  }

  @Patch('memberships/:id')
  @ApiOperation({ summary: 'Update membership application (owner or admin)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMembershipDto,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    return this.membershipsService.update(id, dto, user.sub, isAdmin);
  }

  @Patch('memberships/:id/status')
  @RequirePermissions('membership.manage_status')
  @ApiOperation({ summary: 'Approve, reject, or change membership status (admin)' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateMembershipStatusDto,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.membershipsService.updateStatus(id, dto, user.sub);
  }

  @Get('memberships/:id/documents')
  @ApiOperation({ summary: 'List documents for membership' })
  getDocuments(
    @Param('id') id: string,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    return this.membershipsService.getDocuments(id, user.sub, isAdmin);
  }

  @Get('memberships/:id/payment-history')
  @ApiOperation({ summary: 'List payment history for membership' })
  getPaymentHistory(
    @Param('id') id: string,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    return this.membershipsService.getPaymentHistory(id, user.sub, isAdmin);
  }

  @Get('memberships/:id/renewal-history')
  @ApiOperation({ summary: 'List renewal history for membership' })
  getRenewalHistory(
    @Param('id') id: string,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    return this.membershipsService.getRenewalHistory(id, user.sub, isAdmin);
  }
}
