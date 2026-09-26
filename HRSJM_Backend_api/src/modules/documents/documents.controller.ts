import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Response } from "express";
import * as path from "path";
import { AuthenticatedUser, CurrentUser } from "../../shared/decorators/current-user.decorator";
import { ListDocumentsQueryDto } from "./dto/list-documents.query.dto";
import { UploadDocumentDto } from "./dto/upload-document.dto";
import { STORAGE_DIR, DocumentsService } from "./documents.service";

// Hard multer ceiling; the configured per-document limit is enforced in the service
const MULTER_MAX_BYTES = 10 * 1024 * 1024;

@ApiTags("documents")
@ApiBearerAuth()
@Controller("documents")
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MULTER_MAX_BYTES } }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
        documentName: { type: "string" },
        documentType: { type: "string", enum: Object.values(["MEMBERSHIP_DOCUMENT", "ASSISTANCE_DOCUMENT", "CERTIFICATE", "APPOINTMENT_LETTER", "OTHER"]) },
        relatedEntityType: { type: "string" },
        relatedEntityId: { type: "string" },
        description: { type: "string" },
        ownerId: { type: "string" },
      },
      required: ["file", "documentName", "documentType"],
    },
  })
  @ApiOperation({ summary: "Upload a document (multipart form-data)" })
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.documentsService.upload(actor, file, dto);
  }

  @Get()
  @ApiOperation({ summary: "List documents (admin: all, others: own only)" })
  list(@Query() query: ListDocumentsQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.documentsService.list(actor, query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get document metadata (admin or owner)" })
  getById(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.documentsService.getById(actor, id);
  }

  @Get(":id/download")
  @ApiOperation({ summary: "Download document file (admin or owner)" })
  async download(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const document = await this.documentsService.getForActor(actor, id);
    res.download(path.join(process.cwd(), document.storagePath), document.originalFileName);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Archive a document (soft delete, admin or owner)" })
  archive(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.documentsService.archive(actor, id);
  }
}