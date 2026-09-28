import { IsBoolean } from 'class-validator';

export class UpdateAccountStatusDto {
  @IsBoolean()
  is_active: boolean;
}
