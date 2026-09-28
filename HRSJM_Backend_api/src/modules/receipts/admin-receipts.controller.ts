import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { ReceiptsService } from "./receipts.service";
import { CreateReceiptDto, ListReceiptsQueryDto } from "./dto/receipt.dto";

// Multer ceiling; the configured per-document limit is enforced in DocumentsService
const MULTER_MAX_BYTES = 10 * 1024 * 1024;

// Manual income receipts are a back-office operation (admin only).
// Entries are immutable once recorded - corrections happen in the senior
// accounting system, not here.
@ApiTags("admin-receipts")
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller("admin/receipts")
export class AdminReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Post()
  @ApiOperation({ summary: "Record a manual income receipt with auto entry number (admin only)" })
  create(@Body() dto: CreateReceiptDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.receiptsService.create(actor, dto);
  }

  @Get()
  @ApiOperation({ summary: "List income receipts with filters (admin only)" })
  list(@Query() query: ListReceiptsQueryDto) {
    return this.receiptsService.list(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get an income receipt (admin only)" })
  getById(@Param("id", ParseUUIDPipe) id: string) {
    return this.receiptsService.getById(id);
  }

  @Post(":id/attachment")
  @UseInterceptors(
    FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MULTER_MAX_BYTES } }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Attach a supporting file to a receipt (admin only)" })
  attachDocument(
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { documentName?: string; description?: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.receiptsService.attachDocument(actor, id, file, body);
  }
}