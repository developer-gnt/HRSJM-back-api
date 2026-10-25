import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../../../common/guards/optional-jwt-auth.guard';
import { CashfreeService } from './cashfree.service';
import { CashfreeOrdersService } from './cashfree-orders.service';
import { CreateCashfreeOrderDto } from './dto/create-cashfree-order.dto';
import { ValidateUpiDto } from './dto/validate-upi.dto';

@ApiTags('cashfree-payments')
@Controller('payments/cashfree')
export class CashfreeController {
  constructor(
    private readonly gateway: CashfreeService,
    private readonly orders: CashfreeOrdersService,
  ) {}

  @Post('validate-upi')
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Validate UPI VPA syntax format before initiating payment' })
  async validateUpi(@Body() dto: ValidateUpiDto) {
    return this.gateway.validateUpiFormat(dto.upiId);
  }

  @Post('orders')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create Cashfree checkout order from an internal payment record' })
  async createOrder(
    @Body() dto: CreateCashfreeOrderDto,
    @Headers('x-idempotency-key') key: string | undefined,
    @AuthenticatedUser() user?: { sub: string },
  ) {
    if (key && (key.length < 8 || key.length > 128)) {
      throw new BadRequestException('Invalid x-idempotency-key length (8-128 chars)');
    }
    return this.orders.createOrder(dto, user?.sub, key);
  }

  @Get('orders/:orderId/verify')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify payment attempts with Cashfree' })
  async verifyOrder(
    @Param('orderId') orderId: string,
    @AuthenticatedUser() user?: { sub: string },
  ) {
    return this.orders.verifyOrder(orderId, user?.sub);
  }

  @Get('callback')
  @Header('Content-Type', 'text/html')
  @ApiOperation({ summary: 'Cashfree browser return/callback route' })
  async handleCallback(@Req() req: Request) {
    const orderId = String(req.query.order_id || req.query.orderId || '');
    const cleanOrderId = orderId.replace(/[^a-zA-Z0-9_-]/g, '');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Payment Handled - HRSJM</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; color: #0f172a; }
    .card { background: white; border-radius: 16px; padding: 32px 24px; box-shadow: 0 4px 16px rgba(15,40,96,0.08); max-width: 420px; width: 90%; text-align: center; border: 1px solid #e2e8f0; }
    .emblem { width: 56px; height: 56px; border-radius: 28px; background: #EFF6FF; display: flex; align-items: center; justify-content: center; font-size: 28px; margin: 0 auto 16px; }
    h2 { margin: 0 0 8px; font-size: 20px; color: #0f2860; font-weight: 700; }
    p { margin: 0 0 16px; color: #64748b; font-size: 14px; line-height: 1.5; }
    .order-tag { display: inline-block; background: #F1F5F9; color: #334155; font-size: 12px; font-family: monospace; padding: 4px 10px; border-radius: 6px; margin-bottom: 20px; }
    .note { font-size: 12px; color: #94A3B8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="emblem">🛡️</div>
    <h2>Payment Session Complete</h2>
    <p>Your payment session has finished with Cashfree. Please return to the HRSJM application to view the confirmed transaction status.</p>
    ${cleanOrderId ? `<div class="order-tag">Order: ${cleanOrderId}</div>` : ''}
    <div class="note">You can safely close this browser window.</div>
  </div>
</body>
</html>`;
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Cashfree signed webhook endpoint' })
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-webhook-timestamp') timestamp?: string,
    @Headers('x-webhook-signature') signature?: string,
  ) {
    const rawBody = req.rawBody ?? (req.body ? Buffer.from(JSON.stringify(req.body)) : Buffer.alloc(0));

    // Mandatory signature verification — no bypass allowed
    this.gateway.assertWebhookSignature(rawBody, timestamp, signature);

    return this.orders.processWebhook((req.body as Record<string, unknown>) ?? {});
  }
}

