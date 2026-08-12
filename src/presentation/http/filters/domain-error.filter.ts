import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { BusinessRuleError } from '../../../domain/business-rule.error';

@Catch(BusinessRuleError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: BusinessRuleError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: error.message,
      error: 'Business Rule Error',
    });
  }
}
