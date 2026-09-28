import { UnauthorizedException } from "@nestjs/common";
import { JwtStrategy } from "./jwt.strategy";
import { UsersService } from "../../users/users.service";
import { ApiConfigService } from "../../../shared/helpers/api-config.service";
import { User, UserRole, UserStatus } from "../../users/entities/user.entity";

describe("JwtStrategy", () => {
  const makeUser = (overrides: Partial<User> = {}): User =>
    ({
      id: "u-1",
      email: "a@example.com",
      fullName: "A",
      passwordHash: "x",
      role: UserRole.MEMBER,
      status: UserStatus.ACTIVE,
      ...overrides,
    }) as User;

  const build = (user: User | null) => {
    const usersService = { findEntityById: jest.fn(async () => user) };
    const configService = { jwtSecret: "s", jwtExpiresIn: "1h", jwtRefreshExpiresIn: "7d" };
    const strategy = new JwtStrategy(
      usersService as unknown as UsersService,
      configService as unknown as ApiConfigService,
    );
    return { strategy, usersService };
  };

  it("validates an active user from the payload", async () => {
    const { strategy } = build(makeUser());
    const result = await strategy.validate({ sub: "u-1", email: "a@example.com", role: UserRole.MEMBER });
    expect(result).toEqual({ id: "u-1", email: "a@example.com", role: UserRole.MEMBER });
  });

  it("rejects tokens for deleted users", async () => {
    const { strategy } = build(null);
    await expect(strategy.validate({ sub: "gone", email: "g@example.com", role: UserRole.MEMBER })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("rejects tokens for suspended users", async () => {
    const { strategy } = build(makeUser({ status: UserStatus.SUSPENDED }));
    await expect(strategy.validate({ sub: "u-1", email: "a@example.com", role: UserRole.MEMBER })).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
