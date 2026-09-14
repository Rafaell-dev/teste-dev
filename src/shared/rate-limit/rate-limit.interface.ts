import { Request } from 'express';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

export const RATE_LIMIT_IDENTIFIER = 'RATE_LIMIT_IDENTIFIER';

export interface RateLimitIdentifier {
  getIdentifier(request: Request): string;
}
