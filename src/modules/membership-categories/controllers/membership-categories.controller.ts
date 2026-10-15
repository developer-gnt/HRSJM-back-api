import {
  Body,
  Controller,
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
import { OptionalJwtAuthGuard } from '../../../common/guards/optional-jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { MembershipCategoriesService } from '../services/membership-categories.service';
import { CreateMembershipCategoryDto } from '../dto/create-membership-category.dto';
import { UpdateMembershipCategoryDto } from '../dto/update-membership-category.dto';
import { ListMembershipCategoriesDto } from '../dto/list-membership-categories.dto';
import { UpdateMembershipCategoryStatusDto } from '../dto/update-membership-category-status.dto';

@ApiTags('membership-categories')
@ApiBearerAuth()
@Controller('membership-categories')
export class MembershipCategoriesController {
  constructor(
    private readonly categoriesService: MembershipCategoriesService,
  ) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'List/search membership categories' })
  listCategories(@Query() dto: ListMembershipCategoriesDto) {
    return this.categoriesService.list(dto);
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('membership_category.create')
  @ApiOperation({ summary: 'Create a membership category (admin)' })
  createCategory(
    @Body() dto: CreateMembershipCategoryDto,
    @AuthenticatedUser() user?: { sub: string },
  ) {
    return this.categoriesService.create(dto, user?.sub);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'View a membership category' })
  getCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.getById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('membership_category.update')
  @ApiOperation({ summary: 'Update a membership category (admin)' })
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMembershipCategoryDto,
    @AuthenticatedUser() user?: { sub: string },
  ) {
    return this.categoriesService.update(id, dto, user?.sub);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('membership_category.manage_status')
  @ApiOperation({ summary: 'Activate/deactivate a membership category (admin)' })
  updateCategoryStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMembershipCategoryStatusDto,
    @AuthenticatedUser() user?: { sub: string },
  ) {
    return this.categoriesService.updateStatus(id, dto, user?.sub);
  }
}
