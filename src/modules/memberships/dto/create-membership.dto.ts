import {
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateMembershipDto {
  @IsUUID()
  category_id: string;

  @IsOptional()
  @IsUUID()
  user_id?: string; // If admin is applying on behalf of a user

  @IsOptional()
  @IsObject()
  application_data?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  admin_notes?: string;
}
