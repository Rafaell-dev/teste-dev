import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { CepNotFoundException } from '../exceptions/cep-not-found.exception';
import { ProvidersUnavailableException } from '../exceptions/providers-unavailable.exception';

interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
}

/**
 * Translates domain exceptions to HTTP responses.
 *
 * Only maps known domain errors — any unrecognised exception falls through
 * to NestJS's built-in exception layer, preventing accidental 200 responses.
 */
@Catch(CepNotFoundException, ProvidersUnavailableException)
export class CepExceptionFilter implements ExceptionFilter {
  catch(
    exception: CepNotFoundException | ProvidersUnavailableException,
    host: ArgumentsHost,
  ): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let body: ErrorResponse;

    if (exception instanceof CepNotFoundException) {
      body = {
        statusCode: HttpStatus.NOT_FOUND,
        code: 'CEP_NOT_FOUND',
        message: 'CEP não encontrado',
      };
      response.status(HttpStatus.NOT_FOUND).json(body);
      return;
    }

    body = {
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      code: 'PROVIDERS_UNAVAILABLE',
      message: 'Serviço de consulta de CEP temporariamente indisponível',
    };
    response.status(HttpStatus.SERVICE_UNAVAILABLE).json(body);
  }
}
