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
import { EventsService } from '../services/events.service';
import { CreateEventDto } from '../dto/create-event.dto';
import { UpdateEventDto } from '../dto/update-event.dto';
import { ListEventsDto } from '../dto/list-events.dto';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'List all events with filters and summary stats' })
  findAll(@Query() query: ListEventsDto) {
    return this.eventsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single event by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.findOne(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new event' })
  create(
    @Body() dto: CreateEventDto,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.eventsService.create(dto, user?.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing event' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.eventsService.update(id, dto, user?.sub);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an event' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthenticatedUser() user: { sub: string },
  ) {
    return this.eventsService.remove(id, user?.sub);
  }
}
