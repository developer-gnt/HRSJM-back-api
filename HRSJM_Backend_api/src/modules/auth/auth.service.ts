import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { ApiConfigService } from "../../shared/helpers/api-config.service";
import { User, UserRole, UserStatus } from "../users/entities/user.entity";
import { toSafeUser, UsersService } from "../users/users.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { JwtPayload } from "./strategies/jwt.strategy";

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ApiConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findEntityByEmail(dto.email);
    if (existing) {
      throw new ConflictException("Email already registered");
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.createUser({
      fullName: dto.fullName.trim(),
      email: dto.email,
      passwordHash,
      role: dto.role ?? UserRole.MEMBER,
    });
    const accessToken = await this.signToken(user);
    return { message: "Registration successful", data: { user: toSafeUser(user), accessToken } };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findEntityByEmail(dto.email);
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password");
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException("Account is suspended");
    }
    const accessToken = await this.signToken(user);
    return { message: "Login successful", data: { user: toSafeUser(user), accessToken } };
  }

  async me(userId: string) {
    return {
      message: "Current user fetched",
      data: await this.usersService.getSafeUserById(userId),
    };
  }

  private signToken(user: User) {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return this.jwtService.signAsync(payload, {
      secret: this.configService.jwtSecret,
      expiresIn: this.configService.jwtExpiresIn,
    });
  }
}