import { IsEnum, IsOptional, IsString } from 'class-validator';
import { MembershipStatus } from '../../../common/enums/membership-status.enum';

export class UpdateMembershipStatusDto {
  @IsEnum(MembershipStatus)
  status: MembershipStatus;

  @IsOptional()
  @IsString()
  rejection_reason?: string;

  @IsOptional()
  @IsString()
  admin_notes?: string;
}
