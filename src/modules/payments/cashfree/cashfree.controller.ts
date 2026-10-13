import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CashfreeService } from './cashfree.service';
import { CashfreeOrdersService } from './cashfree-orders.service';
import { CreateCashfreeOrderDto } from './dto/create-cashfree-order.dto';

@ApiTags('cashfree-payments')
@Controller('payments/cashfree')
export class CashfreeController {
  constructor(
    private readonly gateway: CashfreeService,
    private readonly orders: CashfreeOrdersService,
  ) {}

  @Post('orders')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create Cashfree checkout order from an internal payment record' })
  async createOrder(
    @Body() dto: CreateCashfreeOrderDto,
    @Headers('x-idempotency-key') key: string | undefined,
    @AuthenticatedUser() user: { sub: string },
  ) {
    if (key && (key.length < 8 || key.length > 128)) {
      throw new BadRequestException('Invalid x-idempotency-key length (8-128 chars)');
    }
    return this.orders.createOrder(dto, user.sub, key);
  }

  @Get('orders/:orderId/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify payment attempts with Cashfree' })
  async verifyOrder(
    @Param('orderId') orderId: string,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.orders.verifyOrder(orderId, user.sub);
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Cashfree signed webhook endpoint' })
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-webhook-timestamp') timestamp?: string,
    @Headers('x-webhook-signature') signature?: string,
  ) {
    const rawBody = req.rawBody ?? (req.body ? Buffer.from(JSON.stringify(req.body)) : Buffer.alloc(0));

    if (timestamp && signature) {
      this.gateway.assertWebhookSignature(rawBody, timestamp, signature);
    }

    return this.orders.processWebhook((req.body as Record<string, unknown>) ?? {});
  }
}
