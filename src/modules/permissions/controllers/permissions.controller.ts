import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/guards/permissions.guard';
import { PermissionsService } from '../services/permissions.service';
import { ListPermissionsDto } from '../dto/list-permissions.dto';

@ApiTags('permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @RequirePermissions('permission.read')
  @ApiOperation({ summary: 'List/search permissions (admin)' })
  listPermissions(@Query() dto: ListPermissionsDto) {
    return this.permissionsService.listPermissions(dto);
  }
}
