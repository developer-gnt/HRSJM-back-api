import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/guards/permissions.guard';
import { PassbookExportService } from '../services/passbook-export.service';
import { PassbookExportQueryDto } from '../dto/passbook-export.dto';

@ApiTags('passbook')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller(['passbook', 'accounting/passbook'])
export class PassbookController {
  constructor(private readonly exportService: PassbookExportService) {}

  @Get('export')
  @RequirePermissions('ledger.read')
  @ApiOperation({
    summary:
      'Export official Passbook Statement in PDF, Excel (XLSX), or CSV formats with custom scope and date filtering',
  })
  async export(
    @Query() dto: PassbookExportQueryDto,
    @Res() res: Response,
  ) {
    const result = await this.exportService.exportPassbook(dto);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.setHeader('Content-Length', String(result.buffer.length));
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    return res.end(result.buffer);
  }
}

