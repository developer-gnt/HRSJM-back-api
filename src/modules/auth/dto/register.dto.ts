import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Validate,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { MatchConstraint } from '../../../common/validators/match.constraint';
import { PUBLIC_REGISTER_ROLE_NAMES } from '../../../modules/roles/roles.constants';

export class RegisterDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  full_name: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '').slice(-10) : value,
  )
  @IsString()
  @MaxLength(20)
  mobile_number: string;

  @Transform(({ value }) =>
    !value || typeof value !== 'string' || value.trim() === ''
      ? undefined
      : value.trim().toLowerCase(),
  )
  @IsOptional()
  @ValidateIf((o) => typeof o.email === 'string' && o.email.length > 0)
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(6)
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

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  dob?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  date_of_birth?: string;
}
