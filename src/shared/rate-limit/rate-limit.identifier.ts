import { Request } from 'express';
import { RateLimitIdentifier } from './rate-limit.interface';
import { Injectable } from '@nestjs/common';

@Injectable()
export class IpRateLimitIdentifier implements RateLimitIdentifier {
  getIdentifier(request: Request): string {
    // Extract IP from various headers or fallback to socket IP
    const xForwardedFor = request.headers['x-forwarded-for'];
    let ip = '';

    if (typeof xForwardedFor === 'string') {
      ip = xForwardedFor.split(',')[0].trim();
    } else if (Array.isArray(xForwardedFor)) {
      ip = xForwardedFor[0].trim();
    } else {
      ip = request.socket?.remoteAddress || 'unknown';
    }

    return `ip:${ip}`;
  }
}
