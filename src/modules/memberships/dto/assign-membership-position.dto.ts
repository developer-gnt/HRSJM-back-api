import { IsNotEmpty, IsString } from 'class-validator';

export class AssignMembershipPositionDto {
  @IsNotEmpty()
  @IsString()
  membership_position: string;
}
