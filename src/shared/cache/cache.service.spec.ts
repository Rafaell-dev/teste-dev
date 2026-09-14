import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from './cache.service';
import { LoggerService } from '../logger/logger.service';
import { REDIS_CLIENT } from '../redis/redis.module';

const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('CacheService', () => {
  let service: CacheService;
  let mockRedis: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    ping: jest.Mock;
  };

  beforeEach(async () => {
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      ping: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get(CacheService);
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('returns parsed value on cache hit', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ cep: '55200000' }));

      const result = await service.get('cep:55200000');

      expect(result).toEqual({ cep: '55200000' });
    });

    it('returns null on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.get('cep:55200000');

      expect(result).toBeNull();
    });

    it('returns null and logs warning on Redis error', async () => {
      mockRedis.get.mockRejectedValue(new Error('Connection refused'));

      const result = await service.get('cep:55200000');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'cache_get_failed',
        expect.objectContaining({ key: 'cep:55200000' }),
      );
    });
  });

  describe('set', () => {
    it('stores value with TTL', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await service.set('cep:55200000', { cep: '55200000' }, 3600);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'cep:55200000',
        JSON.stringify({ cep: '55200000' }),
        'EX',
        3600,
      );
    });

    it('logs warning on Redis SET error without throwing', async () => {
      mockRedis.set.mockRejectedValue(new Error('Out of memory'));

      await expect(
        service.set('cep:55200000', { cep: '55200000' }, 3600),
      ).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'cache_set_failed',
        expect.objectContaining({ key: 'cep:55200000' }),
      );
    });
  });

  describe('del', () => {
    it('removes key from Redis', async () => {
      mockRedis.del.mockResolvedValue(1);

      await service.del('cep:55200000');

      expect(mockRedis.del).toHaveBeenCalledWith('cep:55200000');
    });

    it('logs warning on Redis DEL error without throwing', async () => {
      mockRedis.del.mockRejectedValue(new Error('Connection lost'));

      await expect(service.del('cep:55200000')).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('isHealthy', () => {
    it('returns true when Redis responds to ping', async () => {
      mockRedis.ping.mockResolvedValue('PONG');
      expect(await service.isHealthy()).toBe(true);
    });

    it('returns false when Redis ping fails', async () => {
      mockRedis.ping.mockRejectedValue(new Error('ECONNREFUSED'));
      expect(await service.isHealthy()).toBe(false);
    });
  });
});
