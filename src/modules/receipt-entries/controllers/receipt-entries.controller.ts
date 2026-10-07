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
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/guards/permissions.guard';
import { CreateReceiptEntryDto } from '../dto/create-receipt-entry.dto';
import { ListReceiptEntriesDto } from '../dto/list-receipt-entries.dto';
import { UpdateReceiptEntryDto } from '../dto/update-receipt-entry.dto';
import { UpdateReceiptStatusDto } from '../dto/update-receipt-status.dto';
import { ReceiptEntriesService } from '../services/receipt-entries.service';

@ApiTags('receipt-entries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('receipt-entries')
export class ReceiptEntriesController {
  constructor(private readonly receiptService: ReceiptEntriesService) {}

  @Post()
  @RequirePermissions('receipt_entry.create')
  @ApiOperation({
    summary: 'Create receipt voucher and post double-entry journal (admin)',
  })
  create(
    @Body() dto: CreateReceiptEntryDto,
    @AuthenticatedUser() user?: { sub: string },
  ) {
    return this.receiptService.create(dto, user?.sub);
  }

  @Get()
  @RequirePermissions('receipt_entry.read')
  @ApiOperation({ summary: 'List receipt entries with filters (admin)' })
  list(@Query() dto: ListReceiptEntriesDto) {
    return this.receiptService.list(dto);
  }

  @Get('stats')
  @RequirePermissions('receipt_entry.read')
  @ApiOperation({ summary: 'Get KPI statistics for receipt entries (admin)' })
  getStats() {
    return this.receiptService.getStats();
  }

  @Get(':id')
  @RequirePermissions('receipt_entry.read')
  @ApiOperation({
    summary: 'View a receipt entry with accounts and journal lines (admin)',
  })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.receiptService.getById(id);
  }

  @Patch(':id')
  @RequirePermissions('receipt_entry.update')
  @ApiOperation({ summary: 'Update receipt entry metadata (admin)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReceiptEntryDto,
    @AuthenticatedUser() user?: { sub: string },
  ) {
    return this.receiptService.update(id, dto, user?.sub);
  }

  @Patch(':id/status')
  @RequirePermissions('receipt_entry.manage_status')
  @ApiOperation({
    summary:
      'Update receipt entry status (e.g. cancel/void and reverse journal) (admin)',
  })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReceiptStatusDto,
    @AuthenticatedUser() user?: { sub: string },
  ) {
    return this.receiptService.updateStatus(id, dto, user?.sub);
  }
}
