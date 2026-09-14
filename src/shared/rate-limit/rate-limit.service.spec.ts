import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RateLimitService } from './rate-limit.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { LoggerService } from '../logger/logger.service';

describe('RateLimitService', () => {
  let service: RateLimitService;
  let redis: { evalsha: jest.Mock; script: jest.Mock };
  let logger: {
    log: jest.Mock;
    error: jest.Mock;
    warn: jest.Mock;
    debug: jest.Mock;
  };

  beforeEach(async () => {
    redis = { evalsha: jest.fn(), script: jest.fn() };
    logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitService,
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: LoggerService, useValue: logger },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key, defaultValue) => {
              if (key === 'rateLimit.capacity') return 100;
              if (key === 'rateLimit.refillRate') return 100;
              if (key === 'rateLimit.windowSeconds') return 60;
              if (key === 'rateLimit.keyPrefix') return 'ratelimit';
              if (key === 'rateLimit.ttlSeconds') return 120;
              return defaultValue;
            }),
          },
        },
        {
          provide: 'PROM_METRIC_CEP_RATE_LIMIT_TOTAL',
          useValue: { inc: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<RateLimitService>(RateLimitService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should load lua script on init', async () => {
    redis.script.mockResolvedValue('fake-sha1');
    await service.onModuleInit();
    expect(redis.script).toHaveBeenCalledWith('LOAD', expect.any(String));
    expect((service as any).luaScriptSha).toBe('fake-sha1');
  });

  describe('checkLimit', () => {
    beforeEach(async () => {
      redis.script.mockResolvedValue('fake-sha1');
      await service.onModuleInit();
    });

    it('should return allowed:true when tokens are available', async () => {
      // Lua script returns [allowed, remaining, retryAfter]
      redis.evalsha.mockResolvedValue([1, 99, 0]);

      const result = await service.checkLimit('ip:127.0.0.1');

      expect(result).toEqual({
        allowed: true,
        remaining: 99,
        retryAfter: undefined,
      });
      expect(redis.evalsha).toHaveBeenCalledWith(
        'fake-sha1',
        1,
        'ratelimit:ip:127.0.0.1',
        '100', // capacity
        expect.any(String), // refillRate in ms
        expect.any(String), // now
        '120', // ttl
      );
    });

    it('should return allowed:false with retryAfter when bucket is empty', async () => {
      redis.evalsha.mockResolvedValue([0, 0, 5]); // 5 seconds wait

      const result = await service.checkLimit('ip:127.0.0.1');

      expect(result).toEqual({
        allowed: false,
        remaining: 0,
        retryAfter: 5,
      });
    });

    it('should fail-open (allow) if redis fails', async () => {
      redis.evalsha.mockRejectedValue(new Error('Redis is down'));

      const result = await service.checkLimit('ip:127.0.0.1');

      expect(result).toEqual({
        allowed: true,
        remaining: 1,
      });
      expect(logger.error).toHaveBeenCalledWith(
        'rate_limit_redis_error',
        expect.any(Object),
      );
    });
  });
});
