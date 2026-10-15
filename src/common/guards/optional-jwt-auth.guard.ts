import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthenticatedRequest } from './jwt-auth.guard';

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers['authorization'];

    if (!header || !header.startsWith('Bearer ')) {
      return true;
    }

    const token = header.slice('Bearer '.length).trim();
    try {
      const payload = await this.jwtService.verifyAsync(token);
      request.user = { sub: payload.sub, roles: payload.roles };
    } catch {
      // Token expired or invalid: continue as unauthenticated
    }
    return true;
  }
}
