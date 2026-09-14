import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BrasilApiProvider } from './brasil-api.provider';
import {
  HttpClientService,
  HttpTimeoutError,
} from '../../../../shared/http/http-client.service';
import { LoggerService } from '../../../../shared/logger/logger.service';
import { CepNotFoundException } from '../../exceptions/cep-not-found.exception';
import { ProviderTimeoutException } from '../../exceptions/provider-timeout.exception';
import { ProviderInvalidResponseException } from '../../exceptions/provider-invalid-response.exception';

const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockHttpClient = { get: jest.fn() };

describe('BrasilApiProvider', () => {
  let provider: BrasilApiProvider;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrasilApiProvider,
        { provide: HttpClientService, useValue: mockHttpClient },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'brasilApi.baseUrl')
                return 'https://brasilapi.com.br';
              if (key === 'cep.providerTimeoutMs') return 3000;
              return undefined;
            }),
          },
        },
        { provide: LoggerService, useValue: mockLogger },
        {
          provide: 'PROM_METRIC_CEP_PROVIDER_REQUEST_TOTAL',
          useValue: { inc: jest.fn() },
        },
        {
          provide: 'PROM_METRIC_CEP_PROVIDER_DURATION_SECONDS',
          useValue: { observe: jest.fn() },
        },
      ],
    }).compile();

    provider = module.get(BrasilApiProvider);
  });

  it('returns normalized CepProviderResult for a valid response', async () => {
    mockHttpClient.get.mockResolvedValue({
      status: 200,
      data: {
        cep: '55200000',
        state: 'PE',
        city: 'Garanhuns',
        neighborhood: 'Centro',
        street: 'Praça Mestre Dominguinhos',
        service: 'viacep',
      },
    });

    const result = await provider.getCep('55200000');

    expect(result).toEqual({
      cep: '55200000',
      street: 'Praça Mestre Dominguinhos',
      neighborhood: 'Centro',
      city: 'Garanhuns',
      state: 'PE',
    });
  });

  it('throws CepNotFoundException when HTTP status is 404', async () => {
    mockHttpClient.get.mockResolvedValue({
      status: 404,
      data: { message: 'CEP not found', type: 'cep_not_found' },
    });

    await expect(provider.getCep('00000000')).rejects.toThrow(
      CepNotFoundException,
    );
  });

  it('throws ProviderInvalidResponseException when required fields are missing', async () => {
    mockHttpClient.get.mockResolvedValue({
      status: 200,
      data: { cep: '55200000' }, // missing state, city
    });

    await expect(provider.getCep('55200000')).rejects.toThrow(
      ProviderInvalidResponseException,
    );
  });

  it('throws ProviderTimeoutException when HTTP client times out', async () => {
    mockHttpClient.get.mockRejectedValue(new HttpTimeoutError('url', 3000));

    await expect(provider.getCep('55200000')).rejects.toThrow(
      ProviderTimeoutException,
    );
  });

  it('throws ProviderInvalidResponseException on non-200 non-404 status', async () => {
    mockHttpClient.get.mockResolvedValue({ status: 500, data: {} });

    await expect(provider.getCep('55200000')).rejects.toThrow(
      ProviderInvalidResponseException,
    );
  });

  it('handles optional fields gracefully (empty neighborhood and street)', async () => {
    mockHttpClient.get.mockResolvedValue({
      status: 200,
      data: {
        cep: '55200000',
        state: 'PE',
        city: 'Garanhuns',
        // neighborhood and street absent
      },
    });

    const result = await provider.getCep('55200000');

    expect(result.street).toBe('');
    expect(result.neighborhood).toBe('');
  });
});
