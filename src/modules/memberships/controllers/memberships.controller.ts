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
import { AdminResetPasswordDto } from '../dto/admin-reset-password.dto';
import { OptionalJwtAuthGuard } from '../../../common/guards/optional-jwt-auth.guard';

@ApiTags('memberships')
@ApiBearerAuth()
@Controller()
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Post(['memberships', 'memberships/apply'])
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Apply for membership' })
  apply(
    @Body() dto: CreateMembershipDto,
    @AuthenticatedUser() user?: { sub: string; roles?: string[] },
    @Req() req?: AuthenticatedRequest,
  ) {
    const isAdmin = req?.user?.roles?.includes('ADMIN') ?? false;
    return this.membershipsService.apply(dto, user?.sub, isAdmin);
  }

  @Get('memberships')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('membership.read')
  @ApiOperation({ summary: 'List/filter memberships (admin)' })
  list(@Query() dto: ListMembershipsDto) {
    return this.membershipsService.list(dto);
  }

  @Get('memberships/stats')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('membership.read')
  @ApiOperation({ summary: 'Get membership summary KPI statistics (admin)' })
  getStats(
    @Query('search') search?: string,
    @Query('category_id') categoryId?: string,
  ) {
    return this.membershipsService.getStats(search, categoryId);
  }

  @Get(['users/me/membership', 'memberships/my'])
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current user membership profile' })
  getMyMembership(@AuthenticatedUser() user: { sub: string }) {
    return this.membershipsService.getMyMembership(user.sub);
  }

  @Get('memberships/:id')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('membership.manage_status')
  @ApiOperation({ summary: 'Approve, reject, or change membership status (admin)' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateMembershipStatusDto,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.membershipsService.updateStatus(id, dto, user.sub);
  }

  @Post('memberships/:id/reset-password')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('membership.manage_status')
  @ApiOperation({ summary: 'Admin reset password for a member (database connected)' })
  resetPassword(
    @Param('id') id: string,
    @Body() dto: AdminResetPasswordDto,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.membershipsService.adminResetPassword(id, dto, user.sub);
  }

  @Get('memberships/:id/documents')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
