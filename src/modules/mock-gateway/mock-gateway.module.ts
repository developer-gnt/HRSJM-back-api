import { Module } from '@nestjs/common';
import { MockGatewayController } from './mock-gateway.controller';
import { MockGatewayService } from './mock-gateway.service';

@Module({
  controllers: [MockGatewayController],
  providers: [MockGatewayService],
  exports: [MockGatewayService],
})
export class MockGatewayModule {}
