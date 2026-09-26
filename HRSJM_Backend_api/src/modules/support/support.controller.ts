import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthenticatedUser, CurrentUser } from "../../shared/decorators/current-user.decorator";
import { Roles } from "../../shared/decorators/roles.decorator";
import { UserRole } from "../users/entities/user.entity";
import { SupportService } from "./support.service";
import {
  CreateTicketDto,
  CreateTicketMessageDto,
  ListTicketsQueryDto,
  UpdateTicketStatusDto,
} from "./dto/ticket.dto";

// Multer ceiling; the configured per-document limit is enforced in DocumentsService
const MULTER_MAX_BYTES = 10 * 1024 * 1024;

@ApiTags("support-tickets")
@ApiBearerAuth()
@Controller("support-tickets")
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post()
  @ApiOperation({ summary: "Submit a support ticket" })
  create(@Body() dto: CreateTicketDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.supportService.create(actor, dto);
  }

  @Get("me")
  @ApiOperation({ summary: "List my support tickets" })
  listMine(@Query() query: ListTicketsQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.supportService.listMine(actor, query);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "List all support tickets (admin only)" })
  listAll(@Query() query: ListTicketsQueryDto) {
    return this.supportService.listAll(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get support ticket (admin or owner)" })
  getById(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.supportService.getById(actor, id);
  }

  @Patch(":id/status")
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Change ticket status, optionally with a closing note (admin only)" })
  updateStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.supportService.updateStatus(actor, id, dto);
  }

  @Post(":id/messages")
  @ApiOperation({ summary: "Post a message on the ticket thread (owner or admin)" })
  addMessage(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateTicketMessageDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.supportService.addMessage(actor, id, dto);
  }

  @Get(":id/messages")
  @ApiOperation({ summary: "List ticket thread messages (owner or admin)" })
  listMessages(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.supportService.listMessages(actor, id);
  }

  @Post(":id/attachments")
  @UseInterceptors(
    FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MULTER_MAX_BYTES } }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Attach a file to the ticket (owner or admin)" })
  attachDocument(
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { documentName?: string; description?: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.supportService.attachDocument(actor, id, file, body);
  }
}