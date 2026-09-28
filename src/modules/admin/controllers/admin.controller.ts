import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/guards/permissions.guard';
import { AdminService } from '../services/admin.service';
import { ListMembersQueryDto } from '../dto/list-members.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @RequirePermissions('user.read')
  @ApiOperation({ summary: 'Get overall admin dashboard metrics and KPI aggregates' })
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('members')
  @RequirePermissions('user.read')
  @ApiOperation({ summary: 'List members with latest membership state and filters' })
  listMembers(@Query() query: ListMembersQueryDto) {
    return this.adminService.listMembers(query);
  }

  @Get('members/:id/360')
  @RequirePermissions('user.read')
  @ApiOperation({ summary: 'Get comprehensive 360-degree view of a member' })
  getMember360(@Param('id') id: string) {
    return this.adminService.getMember360(id);
  }
}
