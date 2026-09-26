import { Controller, Get, Param } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../../shared/decorators/public.decorator";
import { MembershipsService } from "./memberships.service";

@ApiTags("membership-id")
@Controller("membership-id")
export class MembershipIdController {
  constructor(private readonly membershipsService: MembershipsService) {}

  // Declared first so the two-segment route wins over the single-segment param
  @Get(":membershipNumber/validate")
  @Public()
  @ApiOperation({ summary: "Validate a digital membership ID (public, for QR scans)" })
  validate(@Param("membershipNumber") membershipNumber: string) {
    return this.membershipsService.validate(membershipNumber);
  }

  @Get(":membershipNumber")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Look up a digital membership ID" })
  lookup(@Param("membershipNumber") membershipNumber: string) {
    return this.membershipsService.getDigitalId(membershipNumber);
  }
}