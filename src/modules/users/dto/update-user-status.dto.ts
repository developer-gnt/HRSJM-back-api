import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { CommonStatus } from '../../../common/enums/common-status.enum';

export class UpdateUserStatusDto {
  @ApiProperty({ enum: CommonStatus, example: CommonStatus.ACTIVE })
  @IsEnum(CommonStatus)
  status: CommonStatus;
}
