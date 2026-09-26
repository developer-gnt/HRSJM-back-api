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
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AuthenticatedUser, CurrentUser } from "../../shared/decorators/current-user.decorator";
import { Roles } from "../../shared/decorators/roles.decorator";
import { UserRole } from "../users/entities/user.entity";
import { AssistanceService } from "./assistance.service";
import { CreateAssistanceRequestDto } from "./dto/create-assistance-request.dto";
import { ListAssistanceQueryDto } from "./dto/list-assistance.query.dto";
import { UpdateAssistanceStatusDto } from "./dto/update-assistance-status.dto";

// Multer ceiling; the configured per-document limit is enforced in DocumentsService
const MULTER_MAX_BYTES = 10 * 1024 * 1024;

@ApiTags("assistance-requests")
@ApiBearerAuth()
@Controller("assistance-requests")
export class AssistanceController {
  constructor(private readonly assistanceService: AssistanceService) {}

  @Post()
  @ApiOperation({ summary: "Submit an assistance request" })
  create(@Body() dto: CreateAssistanceRequestDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.assistanceService.create(actor, dto);
  }

  @Get("me")
  @ApiOperation({ summary: "List my assistance requests" })
  listMine(@Query() query: ListAssistanceQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.assistanceService.listMine(actor, query);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "List all assistance requests (admin only)" })
  listAll(@Query() query: ListAssistanceQueryDto) {
    return this.assistanceService.listAll(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get assistance request (admin or owner)" })
  getById(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.assistanceService.getById(actor, id);
  }

  @Patch(":id/status")
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Review assistance request (admin only)" })
  updateStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssistanceStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.assistanceService.updateStatus(actor, id, dto);
  }

  @Post(":id/documents")
  @UseInterceptors(
    FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MULTER_MAX_BYTES } }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Attach a supporting document (owner or admin)" })
  attachDocument(
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { documentName?: string; description?: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.assistanceService.attachDocument(actor, id, file, body);
  }
}