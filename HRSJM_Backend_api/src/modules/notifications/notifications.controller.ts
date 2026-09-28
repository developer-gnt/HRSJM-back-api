import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthenticatedUser, CurrentUser } from "../../shared/decorators/current-user.decorator";
import { Roles } from "../../shared/decorators/roles.decorator";
import { UserRole } from "../users/entities/user.entity";
import { NotificationsService } from "./notifications.service";
import {
  CreateNotificationDto,
  ListMyNotificationsQueryDto,
  ListNotificationsQueryDto,
} from "./dto/notification.dto";

@ApiTags("notifications")
@ApiBearerAuth()
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: "Send a notification now, or schedule it (admin only)",
  })
  create(@Body() dto: CreateNotificationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.notificationsService.create(actor, dto);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "List all notifications (admin only)" })
  listAll(@Query() query: ListNotificationsQueryDto) {
    return this.notificationsService.listAll(query);
  }

  @Get("me")
  @ApiOperation({ summary: "My notification feed" })
  listMine(@Query() query: ListMyNotificationsQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.notificationsService.listMine(actor, query);
  }

  @Patch("me/read-all")
  @ApiOperation({ summary: "Mark all my notifications as read" })
  markAllRead(@CurrentUser() actor: AuthenticatedUser) {
    return this.notificationsService.markAllRead(actor);
  }

  @Get(":id/recipients")
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "List recipients with read state (admin only)" })
  listRecipients(@Param("id", ParseUUIDPipe) id: string) {
    return this.notificationsService.listRecipients(id);
  }

  @Patch("recipients/:recipientId/read")
  @ApiOperation({ summary: "Mark one notification in my feed as read" })
  markRead(
    @Param("recipientId", ParseUUIDPipe) recipientId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.notificationsService.markRead(actor, recipientId);
  }
}