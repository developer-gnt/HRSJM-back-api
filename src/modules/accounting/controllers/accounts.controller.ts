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
import { AccountsService } from '../services/accounts.service';
import { LedgerService } from '../services/ledger.service';
import { CreateAccountDto } from '../dto/create-account.dto';
import { UpdateAccountDto } from '../dto/update-account.dto';
import { UpdateAccountStatusDto } from '../dto/update-account-status.dto';
import { ListAccountsDto } from '../dto/list-accounts.dto';
import { AccountLedgerQueryDto } from '../dto/account-ledger-query.dto';

@ApiTags('accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly ledgerService: LedgerService,
  ) {}

  @Get()
  @RequirePermissions('account.read')
  @ApiOperation({ summary: 'List/search chart of accounts (admin)' })
  listAccounts(@Query() dto: ListAccountsDto) {
    return this.accountsService.list(dto);
  }

  @Post()
  @RequirePermissions('account.create')
  @ApiOperation({ summary: 'Create an account in the chart of accounts (admin)' })
  createAccount(
    @Body() dto: CreateAccountDto,
    @AuthenticatedUser() user?: { sub: string },
  ) {
    return this.accountsService.create(dto, user?.sub);
  }

  @Get(':id')
  @RequirePermissions('account.read')
  @ApiOperation({ summary: 'View an account (admin)' })
  getAccount(@Param('id', ParseUUIDPipe) id: string) {
    return this.accountsService.getById(id);
  }

  @Patch(':id')
  @RequirePermissions('account.update')
  @ApiOperation({
    summary: 'Update an account (name, code, parent, description — admin)',
  })
  updateAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
    @AuthenticatedUser() user?: { sub: string },
  ) {
    return this.accountsService.update(id, dto, user?.sub);
  }

  @Patch(':id/status')
  @RequirePermissions('account.manage_status')
  @ApiOperation({ summary: 'Activate/deactivate an account (admin)' })
  updateAccountStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountStatusDto,
    @AuthenticatedUser() user?: { sub: string },
  ) {
    return this.accountsService.updateStatus(id, dto, user?.sub);
  }

  @Get(':id/ledger')
  @RequirePermissions('ledger.read')
  @ApiOperation({
    summary: 'Account ledger with running balance and optional date range (admin)',
  })
  accountLedger(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: AccountLedgerQueryDto,
  ) {
    return this.ledgerService.accountLedger(id, dto);
  }
}
