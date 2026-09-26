import { IsEnum } from 'class-validator';
import { CommonStatus } from '../../../common/enums/common-status.enum';

export class UpdateMembershipCategoryStatusDto {
  @IsEnum(CommonStatus)
  status: CommonStatus;
}
