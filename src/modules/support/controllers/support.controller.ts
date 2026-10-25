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
import { SupportService } from '../services/support.service';
import { CreateTicketDto } from '../dto/create-ticket.dto';
import { CreateTicketMessageDto } from '../dto/create-ticket-message.dto';
import { ListTicketsDto } from '../dto/list-tickets.dto';
import { UpdateTicketStatusDto } from '../dto/update-ticket-status.dto';
import { CreatePublicComplaintDto } from '../dto/create-public-complaint.dto';

@ApiTags('support-tickets')
@Controller('support-tickets')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('public')
  @ApiOperation({ summary: 'Submit a citizen complaint / support ticket without authentication' })
  createPublicComplaint(@Body() dto: CreatePublicComplaintDto) {
    return this.supportService.createPublicComplaint(dto);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new support ticket (authenticated user)' })
  create(
    @Body() dto: CreateTicketDto,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.supportService.create(dto, user.sub);
  }

  private checkIsAdmin(req: AuthenticatedRequest): boolean {
    const roles = req.user?.roles || [];
    return roles.some((r) =>
      ['ADMIN', 'SUPER_ADMIN', 'SUPERADMIN', 'SUPPORT_AGENT'].includes(
        String(r).toUpperCase(),
      ),
    );
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List support tickets (own or all for admin)' })
  list(
    @Query() dto: ListTicketsDto,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = this.checkIsAdmin(req);
    return this.supportService.list(dto, user.sub, isAdmin);
  }

  @Get('stats/summary')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get support ticket statistics summary' })
  getStats(
    @Query() dto: ListTicketsDto,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = this.checkIsAdmin(req);
    return this.supportService.getStats(dto, user.sub, isAdmin);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'View single support ticket' })
  getById(
    @Param('id') id: string,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = this.checkIsAdmin(req);
    return this.supportService.getById(id, user.sub, isAdmin);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('support.manage')
  @ApiOperation({ summary: 'Update support ticket status (admin)' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTicketStatusDto,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.supportService.updateStatus(id, dto, user.sub);
  }

  @Post(':id/messages')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add a reply message to support ticket' })
  addMessage(
    @Param('id') id: string,
    @Body() dto: CreateTicketMessageDto,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = this.checkIsAdmin(req);
    return this.supportService.addMessage(id, dto, user.sub, isAdmin);
  }

  @Get(':id/messages')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List conversation messages for support ticket' })
  listMessages(
    @Param('id') id: string,
    @AuthenticatedUser() user: { sub: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = this.checkIsAdmin(req);
    return this.supportService.listMessages(id, user.sub, isAdmin);
  }

  @Post(':id/attachments')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload an attachment to a support ticket' })
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
    return this.supportService.attachDocument(
      id,
      file,
      body,
      user.sub,
      isAdmin,
    );
  }
}
