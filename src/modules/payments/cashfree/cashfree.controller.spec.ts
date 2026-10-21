jest.mock('../../../common/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class MockJwtAuthGuard {
    canActivate() {
      return true;
    }
  },
}));

jest.mock('../../../common/guards/optional-jwt-auth.guard', () => ({
  OptionalJwtAuthGuard: class MockOptionalJwtAuthGuard {
    canActivate() {
      return true;
    }
  },
}));

import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CashfreeController } from './cashfree.controller';
import { CashfreeService } from './cashfree.service';
import { CashfreeOrdersService } from './cashfree-orders.service';
import { ValidateUpiDto } from './dto/validate-upi.dto';

describe('CashfreeController Webhook Security', () => {
  let controller: CashfreeController;
  let mockCashfreeService: { assertWebhookSignature: jest.Mock; validateUpiFormat: jest.Mock };
  let mockCashfreeOrdersService: { processWebhook: jest.Mock };

  beforeEach(() => {
    mockCashfreeService = {
      assertWebhookSignature: jest.fn(),
      validateUpiFormat: jest.fn(),
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

  describe('validateUpi endpoint', () => {
    it('should delegate to cashfreeService.validateUpiFormat and return validation result', async () => {
      mockCashfreeService.validateUpiFormat.mockReturnValue({
        valid: true,
        formatValid: true,
        providerVerified: false,
        message: 'Format looks valid.',
        upiId: '99358777442@paytm',
      });

      const dto = { upiId: '99358777442@paytm' };
      const res = await controller.validateUpi(dto);

      expect(mockCashfreeService.validateUpiFormat).toHaveBeenCalledWith('99358777442@paytm');
      expect(res.providerVerified).toBe(false);
      expect(res.formatValid).toBe(true);
    });
  });

  describe('ValidateUpiDto class-validator pipeline', () => {
    it('should accept valid UPI format', async () => {
      const dto = plainToInstance(ValidateUpiDto, { upiId: '99358777442@paytm' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.upiId).toBe('99358777442@paytm');
    });

    it('should trim whitespace from upiId', async () => {
      const dto = plainToInstance(ValidateUpiDto, { upiId: '  user@okhdfcbank  ' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.upiId).toBe('user@okhdfcbank');
    });

    it('should reject empty or whitespace-only upiId', async () => {
      const dtoEmpty = plainToInstance(ValidateUpiDto, { upiId: '' });
      const errorsEmpty = await validate(dtoEmpty);
      expect(errorsEmpty.length).toBeGreaterThan(0);

      const dtoSpaces = plainToInstance(ValidateUpiDto, { upiId: '   ' });
      const errorsSpaces = await validate(dtoSpaces);
      expect(errorsSpaces.length).toBeGreaterThan(0);
    });

    it('should reject malformed upiId without @ or invalid characters', async () => {
      const dtoNoAt = plainToInstance(ValidateUpiDto, { upiId: 'justastring' });
      const errorsNoAt = await validate(dtoNoAt);
      expect(errorsNoAt.length).toBeGreaterThan(0);

      const dtoInvalid = plainToInstance(ValidateUpiDto, { upiId: 'user@' });
      const errorsInvalid = await validate(dtoInvalid);
      expect(errorsInvalid.length).toBeGreaterThan(0);
    });

    it('should reject upiId shorter than 5 chars or longer than 100 chars', async () => {
      const dtoShort = plainToInstance(ValidateUpiDto, { upiId: 'a@b' });
      const errorsShort = await validate(dtoShort);
      expect(errorsShort.length).toBeGreaterThan(0);

      const dtoLong = plainToInstance(ValidateUpiDto, { upiId: 'a'.repeat(95) + '@paytm' });
      const errorsLong = await validate(dtoLong);
      expect(errorsLong.length).toBeGreaterThan(0);
    });
  });
});
