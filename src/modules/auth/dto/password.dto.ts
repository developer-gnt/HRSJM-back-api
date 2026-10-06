import { IsEmail, IsOptional, IsString, MaxLength, MinLength, Validate } from 'class-validator';
import { MatchConstraint } from '../../../common/validators/match.constraint';

export class ForgotPasswordDto {
  @IsString()
  @MinLength(3)
  identifier: string;
}

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Validate(MatchConstraint, ['password'])
  confirm_password: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  full_name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  mobile_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  avatar?: string | null;
}

export { IsEmail, IsOptional, IsString, MaxLength, MinLength, Validate, MatchConstraint };
