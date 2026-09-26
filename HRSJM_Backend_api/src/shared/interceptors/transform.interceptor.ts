import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

export interface ApiEnvelope<T> {
  success: true;
  message: string;
  data: T;
}

@Injectable()
export class TransformInterceptor implements NestInterceptor<unknown, ApiEnvelope<unknown>> {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<ApiEnvelope<unknown>> {
    return next.handle().pipe(
      map((result: unknown) => {
        if (
          result !== null &&
          typeof result === "object" &&
          "data" in result &&
          "message" in result
        ) {
          const envelope = result as { message: string; data: unknown };
          return { success: true as const, message: envelope.message, data: envelope.data };
        }
        return { success: true as const, message: "OK", data: result ?? null };
      }),
    );
  }
}