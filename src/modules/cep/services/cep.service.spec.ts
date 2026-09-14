import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { CepService } from './cep.service';
import { LoggerService } from '../../../shared/logger/logger.service';
import { CacheService } from '../../../shared/cache/cache.service';
import { CepNotFoundException } from '../exceptions/cep-not-found.exception';
import { ProvidersUnavailableException } from '../exceptions/providers-unavailable.exception';
import { CEP_QUEUE_NAME } from '../queues/cep.queue';

describe('CepService', () => {
  let service: CepService;
  let cepQueue: { add: jest.Mock };
  let cacheService: { get: jest.Mock };

  beforeEach(async () => {
    cepQueue = { add: jest.fn() };
    cacheService = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CepService,
        { provide: CacheService, useValue: cacheService },
        { provide: getQueueToken(CEP_QUEUE_NAME), useValue: cepQueue },
        {
          provide: LoggerService,
          useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<CepService>(CepService);
    
    // Mock the queueEvents property which is normally created in onModuleInit
    (service as any).queueEvents = {};
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getCep', () => {
    const rawCep = '55200-000';
    const normalizedCep = '55200000';
    const mockResult = { cep: '55200000', street: 'Rua' };

    it('returns immediately from cache if available (does not enqueue)', async () => {
      cacheService.get.mockResolvedValue(mockResult);

      const result = await service.getCep(rawCep);

      expect(cacheService.get).toHaveBeenCalledWith(`cep:${normalizedCep}`);
      expect(cepQueue.add).not.toHaveBeenCalled();
      expect(result).toEqual(mockResult);
    });

    it('enqueues a job on cache miss, waits for completion, and returns the result', async () => {
      cacheService.get.mockResolvedValue(null);
      const mockJob = {
        waitUntilFinished: jest.fn().mockResolvedValue(mockResult),
      };
      cepQueue.add.mockResolvedValue(mockJob);

      const result = await service.getCep(rawCep);

      expect(cepQueue.add).toHaveBeenCalledWith(
        'retry-cep-lookup',
        { cep: normalizedCep },
        expect.any(Object),
      );
      expect(mockJob.waitUntilFinished).toHaveBeenCalled();
      expect(result).toEqual(mockResult);
    });

    it('throws CepNotFoundException when worker throws NOT_FOUND error', async () => {
      cacheService.get.mockResolvedValue(null);
      const mockJob = {
        waitUntilFinished: jest
          .fn()
          .mockRejectedValue(new Error('NOT_FOUND:55200000')),
      };
      cepQueue.add.mockResolvedValue(mockJob);

      await expect(service.getCep(rawCep)).rejects.toThrow(
        CepNotFoundException,
      );
    });

    it('throws ProvidersUnavailableException when worker throws other errors', async () => {
      cacheService.get.mockResolvedValue(null);
      const mockJob = {
        waitUntilFinished: jest.fn().mockRejectedValue(new Error('PROVIDERS_UNAVAILABLE')),
      };
      cepQueue.add.mockResolvedValue(mockJob);

      await expect(service.getCep(rawCep)).rejects.toThrow(ProvidersUnavailableException);
    });
  });
});
