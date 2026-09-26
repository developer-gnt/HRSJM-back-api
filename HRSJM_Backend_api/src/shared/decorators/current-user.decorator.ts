import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { UserRole } from "../../modules/users/entities/user.entity";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser =>
    context.switchToHttp().getRequest().user,
);