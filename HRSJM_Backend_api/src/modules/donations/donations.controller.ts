import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthenticatedUser, CurrentUser } from "../../shared/decorators/current-user.decorator";
import { Public } from "../../shared/decorators/public.decorator";
import { Roles } from "../../shared/decorators/roles.decorator";
import { UserRole } from "../users/entities/user.entity";
import { DonationsService } from "./donations.service";
import {
  CreateDonationDto,
  CreateGuestDonationDto,
  ListDonationsQueryDto,
  UpdateDonationStatusDto,
} from "./dto/donation.dto";

@ApiTags("donations")
@Controller("donations")
export class DonationsController {
  constructor(private readonly donationsService: DonationsService) {}

  // Guest donations need no account; linked donations below need auth
  @Public()
  @Post("guest")
  @ApiOperation({ summary: "Record a guest donation (no account required)" })
  createGuest(@Body() dto: CreateGuestDonationDto) {
    return this.donationsService.createGuest(dto);
  }

  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: "Record a donation linked to my account" })
  create(@Body() dto: CreateDonationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.donationsService.createLinked(actor, dto);
  }

  @ApiBearerAuth()
  @Get("me")
  @ApiOperation({ summary: "List my donations" })
  listMine(@Query() query: ListDonationsQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.donationsService.listMine(actor, query);
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @Get()
  @ApiOperation({ summary: "List all donations with filters (admin only)" })
  listAll(@Query() query: ListDonationsQueryDto) {
    return this.donationsService.listAll(query);
  }

  @ApiBearerAuth()
  @Get(":id")
  @ApiOperation({ summary: "Get a donation (admin or linked donor)" })
  getById(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.donationsService.getById(actor, id);
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @Patch(":id/status")
  @ApiOperation({ summary: "Update donation status / receipt reference (admin only)" })
  updateStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateDonationStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.donationsService.updateStatus(actor, id, dto);
  }
}