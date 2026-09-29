import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { DonationsService } from '../services/donations.service';
import { CreateDonationDto } from '../dto/create-donation.dto';
import { ListDonationsDto } from '../dto/list-donations.dto';
import { RefundDonationDto } from '../dto/refund-donation.dto';

@ApiTags('donations')
@Controller('donations')
export class DonationsController {
  constructor(private readonly donationsService: DonationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a donation intent / record' })
  create(
    @Body() dto: CreateDonationDto,
    @AuthenticatedUser() user?: { sub: string },
  ) {
    return this.donationsService.create(dto, user?.sub);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('donation.read')
  @ApiOperation({ summary: 'List/filter donations (admin)' })
  list(@Query() dto: ListDonationsDto) {
    return this.donationsService.list(dto);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get donation details by ID' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.donationsService.getById(id);
  }

  @Post(':id/refund')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('donation.refund')
  @ApiOperation({
    summary:
      'Refund a verified donation in full — posts a mirrored accounting reversal (admin)',
  })
  refund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundDonationDto,
    @AuthenticatedUser() user?: { sub: string },
  ) {
    return this.donationsService.refund(id, dto ?? {}, user?.sub ?? '');
  }
}

