import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HttpClientService,
  HttpTimeoutError,
} from '../../../../shared/http/http-client.service';
import { LoggerService } from '../../../../shared/logger/logger.service';
import { validateDto } from '../../../../shared/utils/validate-dto';
import { CepNotFoundException } from '../../exceptions/cep-not-found.exception';
import { ProviderInvalidResponseException } from '../../exceptions/provider-invalid-response.exception';
import { ProviderTimeoutException } from '../../exceptions/provider-timeout.exception';
import {
  CepProvider,
  CepProviderResult,
} from '../interfaces/cep-provider.interface';
import { ViaCepResponseDto } from './dto/viacep-response.dto';

@Injectable()
export class ViaCepProvider implements CepProvider {
  readonly name = 'viacep';

  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly httpClient: HttpClientService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.baseUrl =
      this.configService.get<string>('viacep.baseUrl') ??
      'https://viacep.com.br';
    this.timeoutMs =
      this.configService.get<number>('cep.providerTimeoutMs') ?? 3000;
  }

  async getCep(cep: string): Promise<CepProviderResult> {
    const url = `${this.baseUrl}/ws/${cep}/json/`;
    const startTime = Date.now();

    this.logger.log('cep_provider_request', { provider: this.name, cep });

    try {
      const response = await this.httpClient.get<unknown>(url, this.timeoutMs);
      const duration = Date.now() - startTime;

      // ViaCEP returns HTTP 400 when the CEP format is invalid at the API level
      if (response.status === 400) {
        this.logger.log('cep_provider_not_found', {
          provider: this.name,
          cep,
          duration,
          reason: 'http_400',
        });
        throw new CepNotFoundException(cep);
      }

      if (response.status !== 200) {
        this.logger.error('cep_provider_error', {
          provider: this.name,
          cep,
          duration,
          status: response.status,
        });
        throw new ProviderInvalidResponseException(
          this.name,
          `Unexpected HTTP status ${response.status}`,
        );
      }

      // ViaCEP returns {"erro": true} with HTTP 200 for valid-format but non-existent CEPs
      const rawData = response.data as Record<string, unknown>;
      if (rawData?.erro === true) {
        this.logger.log('cep_provider_not_found', {
          provider: this.name,
          cep,
          duration,
          reason: 'erro_flag',
        });
        throw new CepNotFoundException(cep);
      }

      let dto: ViaCepResponseDto;
      try {
        dto = await validateDto(ViaCepResponseDto, rawData);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        this.logger.error('cep_provider_invalid_response', {
          provider: this.name,
          cep,
          duration,
          reason,
        });
        throw new ProviderInvalidResponseException(this.name, reason);
      }

      this.logger.log('cep_provider_success', {
        provider: this.name,
        cep,
        duration,
      });

      return {
        cep: dto.cep,
        street: dto.logradouro,
        neighborhood: dto.bairro,
        city: dto.localidade,
        state: dto.uf,
      };
    } catch (error) {
      if (error instanceof HttpTimeoutError) {
        const duration = Date.now() - startTime;
        this.logger.warn('cep_provider_timeout', {
          provider: this.name,
          cep,
          duration,
          timeoutMs: this.timeoutMs,
        });
        throw new ProviderTimeoutException(
          `${this.name} timed out after ${this.timeoutMs}ms`,
        );
      }

      throw error;
    }
  }
}
