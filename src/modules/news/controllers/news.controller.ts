import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { NewsService } from '../services/news.service';
import { CreateNewsDto } from '../dto/create-news.dto';
import { UpdateNewsDto } from '../dto/update-news.dto';
import { ListNewsDto } from '../dto/list-news.dto';

@ApiTags('news')
@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  @ApiOperation({ summary: 'List all news with filters and summary stats' })
  findAll(@Query() query: ListNewsDto) {
    return this.newsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single news item by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.newsService.findOne(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new news item' })
  create(
    @Body() dto: CreateNewsDto,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.newsService.create(dto, user?.sub);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update an existing news item' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNewsDto,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.newsService.update(id, dto, user?.sub);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete a news item' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.newsService.remove(id, user?.sub);
  }

  @Post(':id/views')
  @ApiOperation({ summary: 'Increment news item view count' })
  incrementViews(@Param('id', ParseUUIDPipe) id: string) {
    return this.newsService.incrementViews(id);
  }
}
