import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";

const CODE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: "BAD_REQUEST",
  [HttpStatus.UNAUTHORIZED]: "UNAUTHORIZED",
  [HttpStatus.FORBIDDEN]: "FORBIDDEN",
  [HttpStatus.NOT_FOUND]: "NOT_FOUND",
  [HttpStatus.CONFLICT]: "CONFLICT",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "UNPROCESSABLE_ENTITY",
  [HttpStatus.INTERNAL_SERVER_ERROR]: "INTERNAL_SERVER_ERROR",
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("HTTP");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL_SERVER_ERROR";
    let message = "Internal server error";
    let details: unknown = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = CODE_BY_STATUS[status] ?? `HTTP_${status}`;
      const res = exception.getResponse();
      if (typeof res === "string") {
        message = res;
      } else if (res && typeof res === "object") {
        const body = res as Record<string, unknown>;
        if (Array.isArray(body.message)) {
          details = body.message;
          message = body.message.join("; ");
        } else if (typeof body.message === "string") {
          message = body.message;
        }
        if (typeof body.code === "string") {
          code = body.code;
        }
      }
      if (status === HttpStatus.BAD_REQUEST && details) {
        code = "VALIDATION_ERROR";
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    this.logger.warn(`${request.method} ${request.url} -> ${status} (${code})`);
    response.status(status).json({ success: false, message, error: { code, details } });
  }
}