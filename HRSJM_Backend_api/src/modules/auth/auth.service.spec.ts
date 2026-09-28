import { ConflictException, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { ApiConfigService } from "../../shared/helpers/api-config.service";
import { AuthService } from "./auth.service";
import { UsersService } from "../users/users.service";
import { User, UserRole, UserStatus } from "../users/entities/user.entity";

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: "u-1",
    email: "aisha@example.com",
    fullName: "Aisha Rahman",
    passwordHash: bcrypt.hashSync("Str0ngP@ss", 4),
    role: UserRole.MEMBER,
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as User;

describe("AuthService", () => {
  let service: AuthService;
  let usersService: { findEntityByEmail: jest.Mock; createUser: jest.Mock; getSafeUserById: jest.Mock };
  let jwtService: { signAsync: jest.Mock };
  let configService: { jwtSecret: string; jwtExpiresIn: string };

  beforeEach(() => {
    usersService = {
      findEntityByEmail: jest.fn(),
      createUser: jest.fn(async (x) => ({ ...makeUser(), ...x, id: "u-new" })),
      getSafeUserById: jest.fn(),
    };
    jwtService = { signAsync: jest.fn(async () => "signed-token") };
    configService = { jwtSecret: "test-secret", jwtExpiresIn: "1h" };
    service = new AuthService(
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      configService as unknown as ApiConfigService,
    );
  });

  describe("register", () => {
    it("hashes the password, creates the user and returns a token", async () => {
      usersService.findEntityByEmail.mockResolvedValue(null);
      const result = await service.register({
        fullName: "Aisha Rahman",
        email: "aisha@example.com",
        password: "Str0ngP@ss",
        role: UserRole.MEMBER,
      });
      const created = usersService.createUser.mock.calls[0][0];
      expect(created.passwordHash).not.toBe("Str0ngP@ss");
      expect(bcrypt.compareSync("Str0ngP@ss", created.passwordHash)).toBe(true);
      expect(result.data.accessToken).toBe("signed-token");
      expect(result.data.user).not.toHaveProperty("passwordHash");
    });

    it("defaults role to MEMBER when none given", async () => {
      usersService.findEntityByEmail.mockResolvedValue(null);
      await service.register({ fullName: "X", email: "x@example.com", password: "Str0ngP@ss" });
      expect(usersService.createUser.mock.calls[0][0].role).toBe(UserRole.MEMBER);
    });

    it("rejects duplicate emails with 409", async () => {
      usersService.findEntityByEmail.mockResolvedValue(makeUser());
      await expect(
        service.register({ fullName: "A", email: "aisha@example.com", password: "Str0ngP@ss" }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("login", () => {
    const dto = { email: "aisha@example.com", password: "Str0ngP@ss" };

    it("returns a token for valid credentials", async () => {
      usersService.findEntityByEmail.mockResolvedValue(makeUser());
      const result = await service.login(dto);
      expect(result.data.accessToken).toBe("signed-token");
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        { sub: "u-1", email: "aisha@example.com", role: UserRole.MEMBER },
        { secret: "test-secret", expiresIn: "1h" },
      );
    });

    it("rejects unknown users with 401", async () => {
      usersService.findEntityByEmail.mockResolvedValue(null);
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it("rejects wrong passwords with 401", async () => {
      usersService.findEntityByEmail.mockResolvedValue(makeUser());
      await expect(service.login({ ...dto, password: "Wrong1!" })).rejects.toThrow(UnauthorizedException);
    });

    it("rejects suspended accounts with 403 (after password check)", async () => {
      usersService.findEntityByEmail.mockResolvedValue(makeUser({ status: UserStatus.SUSPENDED }));
      await expect(service.login(dto)).rejects.toThrow(ForbiddenException);
    });
  });

  describe("me", () => {
    it("returns the safe current user", async () => {
      usersService.getSafeUserById.mockResolvedValue({ id: "u-1", email: "aisha@example.com" });
      const result = await service.me("u-1");
      expect(usersService.getSafeUserById).toHaveBeenCalledWith("u-1");
      expect(result.data.email).toBe("aisha@example.com");
    });
  });
});
