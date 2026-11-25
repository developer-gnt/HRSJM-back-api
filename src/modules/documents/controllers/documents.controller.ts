import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import {
  AuthenticatedRequest,
  JwtAuthGuard,
} from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { DocumentsService } from '../services/documents.service';
import { UploadDocumentDto } from '../dto/upload-document.dto';
import { ListDocumentsDto } from '../dto/list-documents.dto';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a document (PDF, images, Word docs)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        document_name: { type: 'string' },
        document_type: { type: 'string' },
        related_entity_type: { type: 'string' },
        related_entity_id: { type: 'string', format: 'uuid' },
        description: { type: 'string' },
      },
    },
  })
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    return this.documentsService.upload(file, dto, user.sub, isAdmin);
  }

  @Get()
  @ApiOperation({ summary: 'List documents (scoped to user or all for admin)' })
  list(
    @Query() dto: ListDocumentsDto,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    return this.documentsService.list(dto, user.sub, isAdmin);
  }

  @Get(':id')
  @ApiOperation({ summary: 'View document metadata' })
  getById(
    @Param('id') id: string,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    return this.documentsService.getById(id, user.sub, isAdmin);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download document file (authorized owner/admin only)' })
  async download(
    @Param('id') id: string,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    const document = await this.documentsService.getById(id, user.sub, isAdmin);

    if (document.storage_path && document.storage_path.startsWith('data:')) {
      const matches = document.storage_path.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (matches) {
        const mimeType = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${document.original_file_name || document.file_name || 'document'}"`);
        return res.send(buffer);
      }
    }

    const cleanPath = document.storage_path.replace(/^\/+/, '');
    const basePath = path.resolve(process.cwd(), 'uploads');
    const absolutePath = path.resolve(process.cwd(), cleanPath);
    if (!absolutePath.startsWith(basePath)) {
      throw new BadRequestException('Invalid or dangerous document storage path');
    }
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({
        statusCode: 404,
        message: 'Document file not found on disk storage',
        code: 'FILE_NOT_FOUND',
      });
    }
    return res.download(absolutePath, document.original_file_name || document.file_name);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archive/soft-delete document' })
  archive(
    @Param('id') id: string,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    return this.documentsService.archive(id, user.sub, isAdmin);
  }
}