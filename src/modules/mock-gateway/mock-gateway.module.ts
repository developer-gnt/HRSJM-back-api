import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DonationEntity } from '../donations/entities/donation.entity';
import { MockGatewayController } from './mock-gateway.controller';
import { MockGatewayService } from './mock-gateway.service';

@Module({
  imports: [TypeOrmModule.forFeature([DonationEntity])],
  controllers: [MockGatewayController],
  providers: [MockGatewayService],
  exports: [MockGatewayService],
})
export class MockGatewayModule {}

