import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { RightsService } from '../services/rights.service';
import { CreateRightDto } from '../dto/create-right.dto';
import { UpdateRightDto } from '../dto/update-right.dto';
import { ListRightsDto } from '../dto/list-rights.dto';

@ApiTags('rights')
@Controller('rights')
export class RightsController {
  constructor(private readonly rightsService: RightsService) {}

  @Get()
  @ApiOperation({ summary: 'List all rights articles with filters and summary stats' })
  findAll(@Query() query: ListRightsDto) {
    return this.rightsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single rights article by ID or slug' })
  findOne(@Param('id') id: string) {
    return this.rightsService.findOne(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new rights article' })
  create(
    @Body() dto: CreateRightDto,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.rightsService.create(dto, user?.sub);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update an existing rights article' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRightDto,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.rightsService.update(id, dto, user?.sub);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete a rights article' })
  remove(
    @Param('id') id: string,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.rightsService.remove(id, user?.sub);
  }

  @Post(':id/views')
  @ApiOperation({ summary: 'Increment rights article view count' })
  incrementViews(@Param('id') id: string) {
    return this.rightsService.incrementViews(id);
  }
}
