import "reflect-metadata";
import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { of } from "rxjs";
import { lastValueFrom } from "rxjs";
import { TransformInterceptor } from "../interceptors/transform.interceptor";
import { RolesGuard } from "../guards/roles.guard";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { buildPaginationMeta } from "../dto/pagination.dto";
import { Public, IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { Roles, ROLES_KEY } from "../decorators/roles.decorator";
import { UserRole } from "../../modules/users/entities/user.entity";

describe("shared primitives", () => {
  describe("TransformInterceptor", () => {
    const interceptor = new TransformInterceptor();
    const makeContext = () => ({ switchToHttp: () => ({}) } as unknown as ExecutionContext);

    it("wraps {message, data} results into the success envelope", async () => {
      const result = await lastValueFrom(
        interceptor.intercept(makeContext(), { handle: () => of({ message: "Hi", data: { a: 1 } }) } as never),
      );
      expect(result).toEqual({ success: true, message: "Hi", data: { a: 1 } });
    });

    it("wraps bare results with message OK", async () => {
      const result = await lastValueFrom(
        interceptor.intercept(makeContext(), { handle: () => of({ token: "x" }) } as never),
      );
      expect(result).toEqual({ success: true, message: "OK", data: { token: "x" } });
    });

    it("wraps null results", async () => {
      const result = await lastValueFrom(
        interceptor.intercept(makeContext(), { handle: () => of(null) } as never),
      );
      expect(result).toEqual({ success: true, message: "OK", data: null });
    });
  });

  describe("RolesGuard", () => {
    const makeContext = (user: unknown, handlerMeta: UserRole[] | undefined) => {
      const reflector = { getAllAndOverride: jest.fn().mockReturnValue(handlerMeta) } as unknown as Reflector;
      const context = {
        getHandler: () => undefined,
        getClass: () => undefined,
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
      } as unknown as ExecutionContext;
      return { guard: new RolesGuard(reflector), context };
    };

    it("allows when no roles are required", () => {
      const { guard, context } = makeContext(null, undefined);
      expect(guard.canActivate(context)).toBe(true);
    });

    it("allows a user whose role matches", () => {
      const { guard, context } = makeContext({ id: "u1", role: UserRole.ADMIN }, [UserRole.ADMIN]);
      expect(guard.canActivate(context)).toBe(true);
    });

    it("rejects a user whose role does not match", () => {
      const { guard, context } = makeContext({ id: "u2", role: UserRole.MEMBER }, [UserRole.ADMIN]);
      expect(guard.canActivate(context)).toBe(false);
    });

    it("rejects unauthenticated requests when roles are required", () => {
      const { guard, context } = makeContext(undefined, [UserRole.ADMIN]);
      expect(guard.canActivate(context)).toBe(false);
    });

    it("registers the expected metadata keys", () => {
      class Dummy {}
      expect(ROLES_KEY).toBe("roles");
      expect(IS_PUBLIC_KEY).toBe("isPublic");
      expect(() => Roles(UserRole.ADMIN)(Dummy)).not.toThrow();
      expect(() => Public()(Dummy)).not.toThrow();
      expect(Reflect.getMetadata("roles", Dummy)).toEqual([UserRole.ADMIN]);
      expect(Reflect.getMetadata("isPublic", Dummy)).toBe(true);
    });
  });

  describe("JwtAuthGuard", () => {
    it("short-circuits public routes", () => {
      const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) } as unknown as Reflector;
      const guard = new JwtAuthGuard(reflector);
      const context = {
        getHandler: () => undefined,
        getClass: () => undefined,
      } as unknown as ExecutionContext;
      expect(guard.canActivate(context)).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith("isPublic", [undefined, undefined]);
    });
  });

  describe("buildPaginationMeta", () => {
    it("computes page math", () => {
      expect(buildPaginationMeta(25, 2, 10)).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
    });

    it("never returns zero total pages", () => {
      expect(buildPaginationMeta(0, 1, 10).totalPages).toBe(1);
    });
  });
});
