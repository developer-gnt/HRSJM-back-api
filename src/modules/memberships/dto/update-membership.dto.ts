import {
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class UpdateMembershipDto {
  @IsOptional()
  @IsUUID()
  category_id?: string;

  @IsOptional()
  @IsObject()
  application_data?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  admin_notes?: string;
}
