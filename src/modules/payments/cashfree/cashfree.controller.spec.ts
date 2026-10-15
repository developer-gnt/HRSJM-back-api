jest.mock('../../../common/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class MockJwtAuthGuard {
    canActivate() {
      return true;
    }
  },
}));

import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { CashfreeController } from './cashfree.controller';
import { CashfreeService } from './cashfree.service';
import { CashfreeOrdersService } from './cashfree-orders.service';

describe('CashfreeController Webhook Security', () => {
  let controller: CashfreeController;
  let mockCashfreeService: { assertWebhookSignature: jest.Mock };
  let mockCashfreeOrdersService: { processWebhook: jest.Mock };

  beforeEach(() => {
    mockCashfreeService = {
      assertWebhookSignature: jest.fn(),
    };
    mockCashfreeOrdersService = {
      processWebhook: jest.fn(),
    };

    controller = new CashfreeController(
      mockCashfreeService as unknown as CashfreeService,
      mockCashfreeOrdersService as unknown as CashfreeOrdersService,
    );
  });

  it('should call assertWebhookSignature and reject if service throws UnauthorizedException for missing signature', async () => {
    mockCashfreeService.assertWebhookSignature.mockImplementation(() => {
      throw new UnauthorizedException('Missing required x-webhook-signature header');
    });

    const mockReq = { body: { data: { order: { order_id: 'test_order' } } } } as any;

    await expect(controller.webhook(mockReq, '1710000000', undefined)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(mockCashfreeService.assertWebhookSignature).toHaveBeenCalled();
    expect(mockCashfreeOrdersService.processWebhook).not.toHaveBeenCalled();
  });

  it('should call assertWebhookSignature and reject if timestamp is missing', async () => {
    mockCashfreeService.assertWebhookSignature.mockImplementation(() => {
      throw new UnauthorizedException('Missing required x-webhook-timestamp header');
    });

    const mockReq = { body: { data: { order: { order_id: 'test_order' } } } } as any;

    await expect(controller.webhook(mockReq, undefined, 'signature_abc')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(mockCashfreeOrdersService.processWebhook).not.toHaveBeenCalled();
  });

  it('should reject when both signature and timestamp are missing', async () => {
    mockCashfreeService.assertWebhookSignature.mockImplementation(() => {
      throw new UnauthorizedException('Missing required x-webhook-timestamp header');
    });

    const mockReq = { body: { data: { order: { order_id: 'test_order' } } } } as any;

    await expect(controller.webhook(mockReq, undefined, undefined)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(mockCashfreeOrdersService.processWebhook).not.toHaveBeenCalled();
  });

  it('should process webhook when signature and timestamp are verified', async () => {
    mockCashfreeService.assertWebhookSignature.mockImplementation(() => {});
    mockCashfreeOrdersService.processWebhook.mockResolvedValue({ received: true, status: 'SUCCESS' });

    const mockReq = { body: { data: { order: { order_id: 'order_123' } } } } as any;
    const result = await controller.webhook(mockReq, '1710000000', 'valid_sig');

    expect(mockCashfreeService.assertWebhookSignature).toHaveBeenCalled();
    expect(mockCashfreeOrdersService.processWebhook).toHaveBeenCalledWith(mockReq.body);
    expect(result).toEqual({ received: true, status: 'SUCCESS' });
  });
});
