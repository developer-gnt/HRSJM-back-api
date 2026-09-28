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
import { CreateExpenseEntryDto } from '../dto/create-expense-entry.dto';
import { ListExpenseEntriesDto } from '../dto/list-expense-entries.dto';
import { UpdateExpenseEntryDto } from '../dto/update-expense-entry.dto';
import { UpdateExpenseStatusDto } from '../dto/update-expense-status.dto';
import { ExpenseEntriesService } from '../services/expense-entries.service';

@ApiTags('expense-entries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('expense-entries')
export class ExpenseEntriesController {
  constructor(private readonly expenseService: ExpenseEntriesService) {}

  @Post()
  @RequirePermissions('expense.create')
  @ApiOperation({
    summary: 'Create expense voucher and post double-entry journal (admin)',
  })
  create(
    @Body() dto: CreateExpenseEntryDto,
    @AuthenticatedUser() user?: { sub: string },
  ) {
    return this.expenseService.create(dto, user?.sub);
  }

  @Get()
  @RequirePermissions('expense.read')
  @ApiOperation({ summary: 'List expense entries with filters (admin)' })
  list(@Query() dto: ListExpenseEntriesDto) {
    return this.expenseService.list(dto);
  }

  @Get(':id')
  @RequirePermissions('expense.read')
  @ApiOperation({
    summary: 'View an expense entry with accounts and journal lines (admin)',
  })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.expenseService.getById(id);
  }

  @Patch(':id')
  @RequirePermissions('expense.update')
  @ApiOperation({ summary: 'Update expense entry metadata (admin)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseEntryDto,
    @AuthenticatedUser() user?: { sub: string },
  ) {
    return this.expenseService.update(id, dto, user?.sub);
  }

  @Patch(':id/status')
  @RequirePermissions('expense.manage_status')
  @ApiOperation({
    summary:
      'Update expense entry status (e.g. cancel/void and reverse journal) (admin)',
  })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseStatusDto,
    @AuthenticatedUser() user?: { sub: string },
  ) {
    return this.expenseService.updateStatus(id, dto, user?.sub);
  }
}
