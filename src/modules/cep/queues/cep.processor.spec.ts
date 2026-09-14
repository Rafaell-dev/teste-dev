import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CepProcessor } from './cep.processor';
import { ProviderSelectorService } from '../services/provider-selector.service';
import { CacheService } from '../../../shared/cache/cache.service';
import { LoggerService } from '../../../shared/logger/logger.service';
import {
  CepProvider,
  CepProviderResult,
} from '../providers/interfaces/cep-provider.interface';
import { CepNotFoundException } from '../exceptions/cep-not-found.exception';
import { Job } from 'bullmq';

const mockCepResult: CepProviderResult = {
  cep: '55200000',
  street: 'Praça Mestre Dominguinhos',
  neighborhood: 'Centro',
  city: 'Garanhuns',
  state: 'PE',
};

const makeProvider = (
  name: string,
  result?: CepProviderResult,
  error?: Error,
): CepProvider => ({
  name,
  getCep: result
    ? jest.fn().mockResolvedValue(result)
    : jest.fn().mockRejectedValue(error ?? new Error('provider error')),
});

describe('CepProcessor', () => {
  let processor: CepProcessor;
  let cacheService: jest.Mocked<CacheService>;
  let providerSelector: jest.Mocked<ProviderSelectorService>;
  let loggerService: jest.Mocked<LoggerService>;

  beforeEach(async () => {
    cacheService = {
      get: jest.fn(),
      set: jest.fn(),
    } as unknown as jest.Mocked<CacheService>;

    providerSelector = {
      getOrderedProviders: jest.fn(),
    } as unknown as jest.Mocked<ProviderSelectorService>;

    loggerService = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CepProcessor,
        { provide: ProviderSelectorService, useValue: providerSelector },
        { provide: CacheService, useValue: cacheService },
        { provide: LoggerService, useValue: loggerService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(86400) },
        },
        {
          provide: 'PROM_METRIC_CEP_FALLBACK_TOTAL',
          useValue: { inc: jest.fn() },
        },
      ],
    }).compile();

    processor = module.get<CepProcessor>(CepProcessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const makeJob = (cep: string): Job =>
    ({ data: { cep }, id: '1', attemptsMade: 0, log: jest.fn() }) as any;

  it('returns cached result if available', async () => {
    cacheService.get.mockResolvedValue(mockCepResult);
    const result = await processor.process(makeJob('55200000'));
    expect(result).toEqual(mockCepResult);
    expect(providerSelector.getOrderedProviders).not.toHaveBeenCalled();
  });

  it('queries providers on cache miss and sets cache', async () => {
    cacheService.get.mockResolvedValue(null);
    const provider = makeProvider('viacep', mockCepResult);
    providerSelector.getOrderedProviders.mockReturnValue([provider]);

    const result = await processor.process(makeJob('55200000'));
    expect(result).toEqual(mockCepResult);
    expect(provider.getCep).toHaveBeenCalledWith('55200000');
    expect(cacheService.set).toHaveBeenCalledWith(
      'cep:55200000',
      mockCepResult,
      86400,
    );
  });

  it('falls back to second provider on failure', async () => {
    cacheService.get.mockResolvedValue(null);
    const provider1 = makeProvider('viacep', undefined, new Error('timeout'));
    const provider2 = makeProvider('brasilapi', mockCepResult);
    providerSelector.getOrderedProviders.mockReturnValue([
      provider1,
      provider2,
    ]);

    const result = await processor.process(makeJob('55200000'));
    expect(result).toEqual(mockCepResult);
    expect(provider1.getCep).toHaveBeenCalled();
    expect(provider2.getCep).toHaveBeenCalled();
  });

  it('throws NOT_FOUND when all providers return CepNotFoundException', async () => {
    cacheService.get.mockResolvedValue(null);
    const provider1 = makeProvider(
      'viacep',
      undefined,
      new CepNotFoundException('1'),
    );
    const provider2 = makeProvider(
      'brasilapi',
      undefined,
      new CepNotFoundException('1'),
    );
    providerSelector.getOrderedProviders.mockReturnValue([
      provider1,
      provider2,
    ]);

    await expect(processor.process(makeJob('55200000'))).rejects.toThrow(
      'NOT_FOUND:55200000',
    );
  });

  it('throws PROVIDERS_UNAVAILABLE when all providers fail technically', async () => {
    cacheService.get.mockResolvedValue(null);
    const provider1 = makeProvider('viacep', undefined, new Error('timeout'));
    const provider2 = makeProvider(
      'brasilapi',
      undefined,
      new Error('timeout'),
    );
    providerSelector.getOrderedProviders.mockReturnValue([
      provider1,
      provider2,
    ]);

    await expect(processor.process(makeJob('55200000'))).rejects.toThrow(
      'PROVIDERS_UNAVAILABLE',
    );
  });
});
