import { IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  refresh_token: string;
}

export class LogoutDto {
  @IsString()
  refresh_token: string;
}
