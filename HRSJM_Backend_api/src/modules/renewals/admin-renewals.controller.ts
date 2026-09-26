import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthenticatedUser, CurrentUser } from "../../shared/decorators/current-user.decorator";
import { Roles } from "../../shared/decorators/roles.decorator";
import { UserRole } from "../users/entities/user.entity";
import {
  ListRenewalsQueryDto,
  ReviewRenewalDto,
  UpdateRenewalPaymentDto,
} from "./dto/renewal.dto";
import { RenewalsService } from "./renewals.service";

// JwtAuthGuard + RolesGuard are registered globally in AppModule,
// so @Roles() alone is enough here.
@ApiTags("admin/renewals")
@ApiBearerAuth()
@Controller("admin/renewals")
export class AdminRenewalsController {
  constructor(private readonly renewalsService: RenewalsService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "List renewal requests with filters (admin only)" })
  list(@Query() query: ListRenewalsQueryDto) {
    return this.renewalsService.listAll(query);
  }

  @Get(":id")
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Get renewal request detail (admin only)" })
  getById(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.renewalsService.getById(actor, id);
  }

  @Patch(":id/payment")
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Record payment verification for a renewal (admin only)" })
  markPayment(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateRenewalPaymentDto,
  ) {
    return this.renewalsService.markPayment(id, dto);
  }

  @Patch(":id/approve")
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Approve a pending renewal (admin only)" })
  approve(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReviewRenewalDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.renewalsService.approve(actor, id, dto);
  }

  @Patch(":id/reject")
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Reject a pending renewal (admin only)" })
  reject(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReviewRenewalDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.renewalsService.reject(actor, id, dto);
  }

  @Patch(":id/activate")
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: "Apply an approved renewal - extends expiry and issues receipt (admin only)",
  })
  activate(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.renewalsService.activate(actor, id);
  }
}

@ApiTags("admin/memberships")
@ApiBearerAuth()
@Controller("admin/memberships")
export class MembershipRenewalHistoryController {
  constructor(private readonly renewalsService: RenewalsService) {}

  @Get(":membershipNumber/renewals")
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Renewal history for a membership (admin only)" })
  history(@Param("membershipNumber") membershipNumber: string, @Query() query: ListRenewalsQueryDto) {
    return this.renewalsService.listForMembership(membershipNumber, query);
  }
}