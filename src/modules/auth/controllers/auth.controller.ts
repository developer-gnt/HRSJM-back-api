import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { JwtAuthGuard, AuthenticatedRequest } from '../../../common/guards/jwt-auth.guard';
import { AuthService } from '../services/auth.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { LogoutDto, RefreshTokenDto } from '../dto/token.dto';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  UpdateProfileDto,
} from '../dto/password.dto';
import { CheckDuplicatesDto } from '../dto/check-duplicates.dto';

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

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('check-duplicates')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check if mobile number or email already exists in database' })
  checkDuplicates(@Body() dto: CheckDuplicatesDto) {
    return this.authService.checkDuplicates(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user account (initial role: Member)' })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    const { ip, userAgent } = this.requestContext(req);
    return this.authService.register(dto, ip, userAgent);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with mobile number or email' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    const { ip, userAgent } = this.requestContext(req);
    return this.authService.login(dto.identifier, dto.password, ip, userAgent);
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
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

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset (delivery channel TBC)' })
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    const { ip, userAgent } = this.requestContext(req);
    return this.authService.forgotPassword(dto.identifier, ip, userAgent);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Get('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Serve the dedicated responsive Reset Password webpage' })
  getResetPasswordPage(@Req() req: Request, @Res() res: Response) {
    const token = (req.query.token as string) || '';
    const html = this.authService.getResetPasswordPageHtml(token);
    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
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

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password for currently authenticated user' })
  changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    const { ip, userAgent } = this.requestContext(req);
    return this.authService.changePassword(req.user!.sub, dto, ip, userAgent);
  }
}
