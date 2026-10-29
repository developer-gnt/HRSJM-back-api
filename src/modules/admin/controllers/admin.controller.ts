import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
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
  getDashboard(
    @Query('month') month?: string,
    @Query('growthMonths') growthMonths?: number,
  ) {
    return this.adminService.getDashboard(month, growthMonths ? Number(growthMonths) : undefined);
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

  @Get('settings')
  @ApiOperation({ summary: 'Get all system settings' })
  getSettings() {
    return this.adminService.getSettings();
  }

  @Get('settings/:key')
  @ApiOperation({ summary: 'Get a specific system setting' })
  getSetting(@Param('key') key: string) {
    return this.adminService.getSetting(key);
  }

  @Put('settings/:key')
  @ApiOperation({ summary: 'Update a specific system setting' })
  updateSetting(@Param('key') key: string, @Body() body: any) {
    return this.adminService.updateSetting(key, body);
  }

  @Post('settings/:key')
  @ApiOperation({ summary: 'Update a specific system setting (POST)' })
  saveSetting(@Param('key') key: string, @Body() body: any) {
    return this.adminService.updateSetting(key, body);
  }
}
