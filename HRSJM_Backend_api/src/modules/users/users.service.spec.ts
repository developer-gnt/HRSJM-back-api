import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Repository } from "typeorm";
import { toSafeUser, UsersService } from "./users.service";
import { User, UserRole, UserStatus } from "./entities/user.entity";

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: "u-1",
    email: "aisha@example.com",
    fullName: "Aisha Rahman",
    passwordHash: "$2a$10$hash",
    role: UserRole.MEMBER,
    status: UserStatus.ACTIVE,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  }) as User;

describe("UsersService", () => {
  let service: UsersService;
  let repo: Record<string, jest.Mock>;

  beforeEach(() => {
    repo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...makeUser(), ...x })),
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    service = new UsersService(repo as unknown as Repository<User>);
  });

  describe("createUser", () => {
    it("creates a user with the given fields", async () => {
      const user = await service.createUser({
        fullName: "Aisha Rahman",
        email: "aisha@example.com",
        passwordHash: "$2a$10$hash",
        role: UserRole.DONOR,
      });
      expect(repo.create).toHaveBeenCalledWith({
        fullName: "Aisha Rahman",
        email: "aisha@example.com",
        passwordHash: "$2a$10$hash",
        role: UserRole.DONOR,
      });
      expect(user.role).toBe(UserRole.DONOR);
    });
  });

  describe("findEntityByEmail / findEntityById", () => {
    it("delegates to the repository", async () => {
      repo.find.mockResolvedValue(null);
      repo.findOne.mockResolvedValue(null);
      await service.findEntityByEmail("x@y.z");
      expect(repo.findOne).toHaveBeenCalledWith({ where: { email: "x@y.z" } });
      await service.findEntityById("u-1");
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: "u-1" } });
    });
  });

  describe("setStatus", () => {
    it("suspends and reactivates", async () => {
      const user = makeUser();
      repo.findOne.mockResolvedValue(user);
      repo.save.mockImplementation(async (u: User) => u);

      const suspended = await service.setStatus("u-1", UserStatus.SUSPENDED);
      expect(suspended.status).toBe(UserStatus.SUSPENDED);

      const active = await service.setStatus("u-1", UserStatus.ACTIVE);
      expect(active.status).toBe(UserStatus.ACTIVE);
    });

    it("throws NotFound for unknown user", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.setStatus("nope", UserStatus.ACTIVE)).rejects.toThrow(NotFoundException);
    });
  });

  describe("listUsers", () => {
    it("rejects invalid role filters", async () => {
      await expect(service.listUsers(1, 10, "WIZARD")).rejects.toThrow(BadRequestException);
    });

    it("builds a filtered, paginated query", async () => {
      const qb = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn(async () => [[makeUser()], 1]),
      };
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.listUsers(2, 5, UserRole.ADMIN, "Aisha");
      expect(qb.andWhere).toHaveBeenCalledTimes(2); // role + search
      expect(qb.skip).toHaveBeenCalledWith(5);
      expect(qb.take).toHaveBeenCalledWith(5);
      expect(result.data.meta).toEqual({ page: 2, limit: 5, total: 1, totalPages: 1 });
      expect(result.data.items[0]).not.toHaveProperty("passwordHash");
    });
  });

  describe("toSafeUser", () => {
    it("strips the password hash", () => {
      const safe = toSafeUser(makeUser());
      expect(safe).not.toHaveProperty("passwordHash");
      expect(safe).toMatchObject({ id: "u-1", email: "aisha@example.com", role: UserRole.MEMBER });
    });
  });
});
