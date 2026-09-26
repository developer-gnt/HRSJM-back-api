import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthenticatedUser, CurrentUser } from "../../shared/decorators/current-user.decorator";
import { CreateRenewalDto, ListRenewalsQueryDto } from "./dto/renewal.dto";
import { RenewalsService } from "./renewals.service";

@ApiTags("renewals")
@ApiBearerAuth()
@Controller("renewals")
export class RenewalsController {
  constructor(private readonly renewalsService: RenewalsService) {}

  @Post()
  @ApiOperation({ summary: "Submit a membership renewal request" })
  submit(@Body() dto: CreateRenewalDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.renewalsService.submit(actor, dto);
  }

  @Get("me")
  @ApiOperation({ summary: "List my renewal requests" })
  listMine(@Query() query: ListRenewalsQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.renewalsService.listMine(actor, query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get renewal request (owner or admin)" })
  getById(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.renewalsService.getById(actor, id);
  }
}