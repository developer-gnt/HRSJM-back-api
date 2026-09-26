import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { buildPaginationMeta } from "../../shared/dto/pagination.dto";
import { User, UserRole, UserStatus } from "./entities/user.entity";

export interface SafeUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async createUser(input: {
    fullName: string;
    email: string;
    passwordHash: string;
    role: UserRole;
  }): Promise<User> {
    const user = this.usersRepository.create({
      fullName: input.fullName,
      email: input.email,
      passwordHash: input.passwordHash,
      role: input.role,
    });
    await this.usersRepository.save(user);
    return user;
  }

  async findEntityByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findEntityById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async findActiveUsers(): Promise<User[]> {
    return this.usersRepository.find({ where: { status: UserStatus.ACTIVE } });
  }

  async findActiveUsersByRole(role: UserRole): Promise<User[]> {
    return this.usersRepository.find({ where: { role, status: UserStatus.ACTIVE } });
  }

  async listUsers(page: number, limit: number, role?: string, search?: string) {
    const qb = this.usersRepository.createQueryBuilder("user");

    if (role) {
      if (!Object.values(UserRole).includes(role as UserRole)) {
        throw new BadRequestException(`Invalid role filter: ${role}`);
      }
      qb.andWhere("user.role = :role", { role });
    }
    if (search) {
      qb.andWhere(
        "(LOWER(user.full_name) LIKE :search OR LOWER(user.email) LIKE :search)",
        { search: `%${search.toLowerCase()}%` },
      );
    }

    qb.orderBy("user.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    const [users, total] = await qb.getManyAndCount();
    return {
      message: "Users fetched",
      data: {
        items: users.map(toSafeUser),
        meta: buildPaginationMeta(total, page, limit),
      },
    };
  }

  async getSafeUserById(id: string): Promise<SafeUser> {
    const user = await this.findEntityById(id);
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return toSafeUser(user);
  }

  async setStatus(id: string, status: UserStatus): Promise<SafeUser> {
    const user = await this.findEntityById(id);
    if (!user) {
      throw new NotFoundException("User not found");
    }
    user.status = status;
    await this.usersRepository.save(user);
    return toSafeUser(user);
  }
}