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
import { BrasilApiResponseDto } from './dto/brasil-api-response.dto';

@Injectable()
export class BrasilApiProvider implements CepProvider {
  readonly name = 'brasilapi';

  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly httpClient: HttpClientService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.baseUrl =
      this.configService.get<string>('brasilApi.baseUrl') ??
      'https://brasilapi.com.br';
    this.timeoutMs =
      this.configService.get<number>('cep.providerTimeoutMs') ?? 3000;
  }

  async getCep(cep: string): Promise<CepProviderResult> {
    const url = `${this.baseUrl}/api/cep/v1/${cep}`;
    const startTime = Date.now();

    this.logger.log('cep_provider_request', { provider: this.name, cep });

    try {
      const response = await this.httpClient.get<unknown>(url, this.timeoutMs);
      const duration = Date.now() - startTime;

      // BrasilAPI returns HTTP 404 for non-existent CEPs
      if (response.status === 404) {
        this.logger.log('cep_provider_not_found', {
          provider: this.name,
          cep,
          duration,
          reason: 'http_404',
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

      let dto: BrasilApiResponseDto;
      try {
        dto = await validateDto(BrasilApiResponseDto, response.data);
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
        street: dto.street ?? '',
        neighborhood: dto.neighborhood ?? '',
        city: dto.city,
        state: dto.state,
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
