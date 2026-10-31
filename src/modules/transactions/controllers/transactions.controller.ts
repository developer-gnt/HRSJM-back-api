import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedRequest,
  JwtAuthGuard,
} from '../../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { TransactionsService } from '../services/transactions.service';
import { ListTransactionsDto } from '../dto/list-transactions.dto';

@ApiTags('transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get('my')
  @ApiOperation({ summary: 'List unified transaction history and payment totals for current user' })
  getMyTransactions(
    @AuthenticatedUser() user: { sub: string },
    @Query() dto: ListTransactionsDto,
  ) {
    return this.transactionsService.listUserTransactions(user.sub, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single transaction details' })
  getTransactionById(
    @Param('id') id: string,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    return this.transactionsService.getTransactionById(id, user.sub, isAdmin);
  }
}

