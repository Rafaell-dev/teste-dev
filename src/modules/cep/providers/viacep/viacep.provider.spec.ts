import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ViaCepProvider } from './viacep.provider';
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

const mockConfig = {
  get: jest.fn((key: string) => {
    if (key === 'viacep.baseUrl') return 'https://viacep.com.br';
    if (key === 'cep.providerTimeoutMs') return 3000;
    return undefined;
  }),
};

const mockHttpClient = { get: jest.fn() };

describe('ViaCepProvider', () => {
  let provider: ViaCepProvider;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ViaCepProvider,
        { provide: HttpClientService, useValue: mockHttpClient },
        { provide: ConfigService, useValue: mockConfig },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    provider = module.get(ViaCepProvider);
  });

  it('returns normalized CepProviderResult for a valid response', async () => {
    mockHttpClient.get.mockResolvedValue({
      status: 200,
      data: {
        cep: '55200-000',
        logradouro: 'Praça Mestre Dominguinhos',
        complemento: '',
        bairro: 'Centro',
        localidade: 'Garanhuns',
        uf: 'PE',
      },
    });

    const result = await provider.getCep('55200000');

    expect(result).toEqual({
      cep: '55200-000',
      street: 'Praça Mestre Dominguinhos',
      neighborhood: 'Centro',
      city: 'Garanhuns',
      state: 'PE',
    });
  });

  it('throws CepNotFoundException when response has erro: true', async () => {
    mockHttpClient.get.mockResolvedValue({
      status: 200,
      data: { erro: true },
    });

    await expect(provider.getCep('00000000')).rejects.toThrow(
      CepNotFoundException,
    );
  });

  it('throws CepNotFoundException when HTTP status is 400', async () => {
    mockHttpClient.get.mockResolvedValue({
      status: 400,
      data: {},
    });

    await expect(provider.getCep('00000000')).rejects.toThrow(
      CepNotFoundException,
    );
  });

  it('throws ProviderInvalidResponseException when response fails DTO validation', async () => {
    mockHttpClient.get.mockResolvedValue({
      status: 200,
      data: { unexpected: 'garbage', logradouro: 123 },
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

  it('throws ProviderInvalidResponseException on non-200 non-400 status', async () => {
    mockHttpClient.get.mockResolvedValue({ status: 503, data: {} });

    await expect(provider.getCep('55200000')).rejects.toThrow(
      ProviderInvalidResponseException,
    );
  });
});
