import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard, AuthenticatedRequest } from '../../../common/guards/jwt-auth.guard';
import { AuthService } from '../services/auth.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { LogoutDto, RefreshTokenDto } from '../dto/token.dto';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  UpdateProfileDto,
} from '../dto/password.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private requestContext(req: Request): { ip: string | null; userAgent: string | null } {
    return {
      ip: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string) ?? null,
    };
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user account (initial role: Member)' })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    const { ip, userAgent } = this.requestContext(req);
    return this.authService.register(dto, ip, userAgent);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with mobile number or email' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    const { ip, userAgent } = this.requestContext(req);
    return this.authService.login(dto.identifier, dto.password, ip, userAgent);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair (rotates the refresh token)' })
  refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const { ip, userAgent } = this.requestContext(req);
    return this.authService.refresh(dto.refresh_token, ip, userAgent);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a refresh token (idempotent)' })
  logout(@Body() dto: LogoutDto, @Req() req: Request) {
    const { ip, userAgent } = this.requestContext(req);
    return this.authService.logout(dto.refresh_token, ip, userAgent);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset (delivery channel TBC)' })
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    const { ip, userAgent } = this.requestContext(req);
    return this.authService.forgotPassword(dto.identifier, ip, userAgent);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset the password with a valid reset token' })
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    const { ip, userAgent } = this.requestContext(req);
    return this.authService.resetPassword(dto, ip, userAgent);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  me(@Req() req: AuthenticatedRequest) {
    return this.authService.getOwnProfile(req.user!.sub);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update own profile (full_name and/or email)' })
  updateMe(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateOwnProfile(req.user!.sub, dto);
  }
}
