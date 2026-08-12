import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { BusinessRuleError } from '../../../domain/business-rule.error';
import { ConcurrencyError } from '../../../domain/concurrency.error';

@Catch(BusinessRuleError, ConcurrencyError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: BusinessRuleError | ConcurrencyError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      error instanceof ConcurrencyError
        ? HttpStatus.CONFLICT
        : HttpStatus.BAD_REQUEST;
    response.status(status).json({
      statusCode: status,
      message: error.message,
      error:
        error instanceof ConcurrencyError
          ? 'Concurrency Error'
          : 'Business Rule Error',
    });
  }
}
