import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Inject,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { RateLimitService } from './rate-limit.service';
import {
  RATE_LIMIT_IDENTIFIER,
  RateLimitIdentifier,
} from './rate-limit.interface';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly capacity: number;

  constructor(
    private readonly rateLimitService: RateLimitService,
    @Inject(RATE_LIMIT_IDENTIFIER)
    private readonly identifierService: RateLimitIdentifier,
    private readonly configService: ConfigService,
  ) {
    this.capacity = this.configService.get<number>('rateLimit.capacity', 100);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const identifier = this.identifierService.getIdentifier(request);
    const result = await this.rateLimitService.checkLimit(identifier);

    // Set informative headers
    response.setHeader('X-RateLimit-Limit', this.capacity);
    response.setHeader('X-RateLimit-Remaining', result.remaining);

    if (result.allowed) {
      return true;
    }

    // Blocked
    if (result.retryAfter !== undefined) {
      response.setHeader('Retry-After', result.retryAfter);
    }

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
