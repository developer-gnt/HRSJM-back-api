import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: { sub: string; roles?: string[] };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers['authorization'];

    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        message: 'Missing bearer token',
        code: 'UNAUTHORIZED',
        details: null,
      });
    }

    const token = header.slice('Bearer '.length).trim();
    try {
      const payload = await this.jwtService.verifyAsync(token);
      request.user = { sub: payload.sub, roles: payload.roles };
      return true;
    } catch (error) {
      const expired = error instanceof Error && error.name === 'TokenExpiredError';
      throw new UnauthorizedException({
        message: expired ? 'Token expired' : 'Invalid token',
        code: expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
        details: null,
      });
    }
  }
}
