import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedRequest,
  JwtAuthGuard,
} from '../../../common/guards/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { AssistanceService } from '../services/assistance.service';
import { CreateAssistanceRequestDto } from '../dto/create-assistance-request.dto';
import { ListAssistanceDto } from '../dto/list-assistance.dto';
import { UpdateAssistanceStatusDto } from '../dto/update-assistance-status.dto';

@ApiTags('assistance-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('assistance-requests')
export class AssistanceController {
  constructor(private readonly assistanceService: AssistanceService) {}

  @Post()
  @ApiOperation({ summary: 'Submit an assistance request (Donation Seeker/Member/Admin)' })
  create(
    @Body() dto: CreateAssistanceRequestDto,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    return this.assistanceService.create(dto, user.sub, isAdmin);
  }

  @Get('stats/summary')
  @ApiOperation({ summary: 'Get summary statistics for assistance requests' })
  getStats(
    @Query() dto: ListAssistanceDto,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    return this.assistanceService.getStats(user.sub, isAdmin, dto);
  }


  @Get()
  @ApiOperation({ summary: 'List assistance requests (own or all for admin)' })
  list(
    @Query() dto: ListAssistanceDto,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    return this.assistanceService.list(dto, user.sub, isAdmin);
  }


  @Get(':id')
  @ApiOperation({ summary: 'View single assistance request details' })
  getById(
    @Param('id') id: string,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    return this.assistanceService.getById(id, user.sub, isAdmin);
  }

  @Patch(':id/status')
  @RequirePermissions('assistance.review')
  @ApiOperation({ summary: 'Review and update assistance request status (admin)' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAssistanceStatusDto,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.assistanceService.updateStatus(id, dto, user.sub);
  }

  @Post(':id/documents')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Attach supporting document to assistance request' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        document_name: { type: 'string' },
        description: { type: 'string' },
      },
    },
  })
  attachDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { document_name?: string; description?: string },
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') ?? false;
    return this.assistanceService.attachDocument(
      id,
      file,
      body,
      user.sub,
      isAdmin,
    );
  }
}
