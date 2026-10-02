import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Validate,
} from 'class-validator';
import { MatchConstraint } from '../../../common/validators/match.constraint';
import { PUBLIC_REGISTER_ROLE_NAMES } from '../../../modules/roles/roles.constants';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  full_name: string;

  @IsString()
  @MaxLength(20)
  mobile_number: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Validate(MatchConstraint, ['password'])
  confirm_password: string;

  @IsOptional()
  @IsUUID()
  role_id?: string;

  /** Self-service registration role (name-based so clients need no role.id
   * lookup, which would require role.read). Allowlist excludes ADMIN. */
  @IsOptional()
  @IsIn(PUBLIC_REGISTER_ROLE_NAMES)
  role_name?: string;
}
