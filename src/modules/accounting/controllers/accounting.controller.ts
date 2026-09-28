import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { AccountingEntriesService } from '../services/accounting-entries.service';
import { LedgerService } from '../services/ledger.service';
import { ListEntriesDto } from '../dto/list-entries.dto';
import { GlobalLedgerQueryDto } from '../dto/global-ledger-query.dto';

@ApiTags('accounting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('accounting')
export class AccountingController {
  constructor(
    private readonly entriesService: AccountingEntriesService,
    private readonly ledgerService: LedgerService,
  ) {}

  @Get('entries')
  @RequirePermissions('accounting_entry.read')
  @ApiOperation({ summary: 'List accounting entries with filters (admin)' })
  listEntries(@Query() dto: ListEntriesDto) {
    return this.entriesService.list(dto);
  }

  @Get('entries/:id')
  @RequirePermissions('accounting_entry.read')
  @ApiOperation({ summary: 'View an accounting entry with its lines (admin)' })
  getEntry(@Param('id', ParseUUIDPipe) id: string) {
    return this.entriesService.getById(id);
  }

  @Post('entries/:id/reverse')
  @RequirePermissions('accounting_entry.reverse')
  @ApiOperation({
    summary: 'Reverse a posted entry with a mirrored correction entry (admin)',
  })
  reverseEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthenticatedUser() user?: { sub: string },
  ) {
    return this.entriesService.reverse(id, user?.sub);
  }

  @Get('ledger')
  @RequirePermissions('ledger.read')
  @ApiOperation({
    summary: 'Global ledger across accounts with running balances (admin)',
  })
  globalLedger(@Query() dto: GlobalLedgerQueryDto) {
    return this.ledgerService.globalLedger(dto);
  }
}
