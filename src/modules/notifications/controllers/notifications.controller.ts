import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { NotificationsService } from '../services/notifications.service';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { ListNotificationsDto } from '../dto/list-notifications.dto';
import { ListMyNotificationsDto } from '../dto/list-my-notifications.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @RequirePermissions('notification.create')
  @ApiOperation({
    summary: 'Broadcast/schedule a notification to an audience or specific user (admin)',
  })
  create(
    @Body() dto: CreateNotificationDto,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.notificationsService.create(dto, user.sub);
  }

  @Get()
  @RequirePermissions('notification.read')
  @ApiOperation({ summary: 'List all notifications (admin)' })
  listAll(@Query() dto: ListNotificationsDto) {
    return this.notificationsService.listAll(dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user notification inbox with unread count' })
  listMine(
    @Query() dto: ListMyNotificationsDto,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.notificationsService.listMine(user.sub, dto);
  }

  @Patch('me/read-all')
  @ApiOperation({ summary: 'Mark all notifications in my inbox as read' })
  markAllRead(@AuthenticatedUser() user: { sub: string }) {
    return this.notificationsService.markAllRead(user.sub);
  }

  @Get(':id')
  @RequirePermissions('notification.read')
  @ApiOperation({ summary: 'Get notification details (admin)' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.getById(id);
  }

  @Get(':id/recipients')
  @RequirePermissions('notification.read')
  @ApiOperation({ summary: 'List notification recipients with delivery & read status (admin)' })
  listRecipients(@Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.listRecipients(id);
  }

  @Patch('recipients/:recipientId/read')
  @ApiOperation({ summary: 'Mark a single notification as read' })
  markRead(
    @Param('recipientId', ParseUUIDPipe) recipientId: string,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.notificationsService.markRead(recipientId, user.sub);
  }
}
