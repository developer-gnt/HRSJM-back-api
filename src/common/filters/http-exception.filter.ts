import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorBody {
  success: false;
  message: string;
  error: { code: string; details: unknown };
}

const STATUS_ERROR_CODES: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_SERVER_ERROR',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = STATUS_ERROR_CODES[500];
    let details: unknown = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_ERROR_CODES[status] ?? 'HTTP_ERROR';
      message = exception.message;
      details = null;

      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const errorBody = body as Record<string, unknown>;
        if (Array.isArray(errorBody.message)) {
          message = errorBody.message.join('; ');
          details = errorBody.message;
        } else {
          message = (errorBody.message as string) ?? message;
          details = errorBody.details ?? null;
          if (typeof errorBody.code === 'string') {
            code = errorBody.code;
          }
        }
      }

      const method = request?.method || 'REQ';
      const url = request?.url || '';
      if (status >= 400 && status < 500) {
        this.logger.warn(
          `[HTTP ${status}] ${method} ${url} - ${message} (details: ${JSON.stringify(details)})`,
        );
      }
    } else {
      const err = exception as any;
      if (err?.type === 'entity.too.large' || err?.status === 413) {
        status = HttpStatus.PAYLOAD_TOO_LARGE;
        code = 'PAYLOAD_TOO_LARGE';
        message = 'Payload too large. Please select a smaller file or reduce image resolution.';
      } else if (err?.status && typeof err.status === 'number') {
        status = err.status;
        code = STATUS_ERROR_CODES[status] ?? 'HTTP_ERROR';
        message = err.message || 'Server error';
      }
      this.logger.error(
        `[HTTP ${status}] ${request?.method || 'REQ'} ${request?.url || ''} - ${exception instanceof Error ? exception.stack : String(exception)}`,
      );
    }

    const errorResponse: ErrorBody = {
      success: false,
      message,
      error: { code, details },
    };
    response.status(status).json(errorResponse);
  }
}
