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
import { BlogsService } from '../services/blogs.service';
import { CreateBlogDto } from '../dto/create-blog.dto';
import { UpdateBlogDto } from '../dto/update-blog.dto';
import { ListBlogsDto } from '../dto/list-blogs.dto';

@ApiTags('blogs')
@Controller('blogs')
export class BlogsController {
  constructor(private readonly blogsService: BlogsService) {}

  @Get()
  @ApiOperation({ summary: 'List all blogs with filters and summary stats' })
  findAll(@Query() query: ListBlogsDto) {
    return this.blogsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single blog item by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.blogsService.findOne(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new blog item' })
  create(
    @Body() dto: CreateBlogDto,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.blogsService.create(dto, user?.sub);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update an existing blog item' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBlogDto,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.blogsService.update(id, dto, user?.sub);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete a blog item' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.blogsService.remove(id, user?.sub);
  }

  @Post(':id/views')
  @ApiOperation({ summary: 'Increment blog item view count' })
  incrementViews(@Param('id', ParseUUIDPipe) id: string) {
    return this.blogsService.incrementViews(id);
  }
}
