import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreateGatewayOrderDto,
  ProcessGatewayChargeDto,
  VerifyGatewaySignatureDto,
} from './dto/mock-gateway.dto';
import { MockGatewayService } from './mock-gateway.service';

@ApiTags('mock-gateway')
@Controller('mock-gateway')
export class MockGatewayController {
  constructor(private readonly mockGatewayService: MockGatewayService) {}

  @Post('orders')
  @ApiOperation({ summary: 'Initiate a mock payment gateway order' })
  createOrder(@Body() dto: CreateGatewayOrderDto) {
    return this.mockGatewayService.createOrder(dto);
  }

  @Post('charge')
  @ApiOperation({ summary: 'Process charge / verify payment against mock gateway' })
  processCharge(@Body() dto: ProcessGatewayChargeDto) {
    return this.mockGatewayService.processCharge(dto);
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify mock gateway HMAC signature' })
  verifySignature(@Body() dto: VerifyGatewaySignatureDto) {
    return this.mockGatewayService.verifySignature(dto);
  }

  @Get('test-data')
  @ApiOperation({ summary: 'Get mock gateway sandbox test cards and UPI handles' })
  getTestData() {
    return this.mockGatewayService.getTestCredentials();
  }
}
