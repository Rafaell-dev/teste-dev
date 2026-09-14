import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext, HttpException } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';
import { RATE_LIMIT_IDENTIFIER } from './rate-limit.interface';

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let rateLimitService: { checkLimit: jest.Mock };
  let identifierService: { getIdentifier: jest.Mock };

  beforeEach(async () => {
    rateLimitService = { checkLimit: jest.fn() };
    identifierService = { getIdentifier: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitGuard,
        { provide: RateLimitService, useValue: rateLimitService },
        { provide: RATE_LIMIT_IDENTIFIER, useValue: identifierService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key, defaultValue) => {
              if (key === 'rateLimit.capacity') return 100;
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    guard = module.get<RateLimitGuard>(RateLimitGuard);
  });

  const createMockContext = (): ExecutionContext => {
    const setHeader = jest.fn();
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {},
          socket: { remoteAddress: '127.0.0.1' },
        }),
        getResponse: () => ({ setHeader }),
      }),
    } as any;
  };

  it('should return true and set headers if allowed', async () => {
    identifierService.getIdentifier.mockReturnValue('ip:127.0.0.1');
    rateLimitService.checkLimit.mockResolvedValue({
      allowed: true,
      remaining: 99,
    });

    const context = createMockContext();
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(context.switchToHttp().getResponse().setHeader).toHaveBeenCalledWith(
      'X-RateLimit-Limit',
      100,
    );
    expect(context.switchToHttp().getResponse().setHeader).toHaveBeenCalledWith(
      'X-RateLimit-Remaining',
      99,
    );
  });

  it('should throw HttpException 429 and set Retry-After if blocked', async () => {
    identifierService.getIdentifier.mockReturnValue('ip:127.0.0.1');
    rateLimitService.checkLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfter: 5,
    });

    const context = createMockContext();

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Too many requests',
    );

    expect(context.switchToHttp().getResponse().setHeader).toHaveBeenCalledWith(
      'X-RateLimit-Limit',
      100,
    );
    expect(context.switchToHttp().getResponse().setHeader).toHaveBeenCalledWith(
      'X-RateLimit-Remaining',
      0,
    );
    expect(context.switchToHttp().getResponse().setHeader).toHaveBeenCalledWith(
      'Retry-After',
      5,
    );
  });
});
