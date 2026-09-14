import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../../../shared/cache/cache.service';
import { LoggerService } from '../../../shared/logger/logger.service';
import { CEP_QUEUE_NAME } from './cep.queue';
import { ProviderSelectorService } from '../services/provider-selector.service';
import { CepProviderResult } from '../providers/interfaces/cep-provider.interface';
import { CepNotFoundException } from '../exceptions/cep-not-found.exception';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';

export interface CepJobData {
  cep: string;
}

@Processor(CEP_QUEUE_NAME)
export class CepProcessor extends WorkerHost {
  private readonly cacheTtl: number;

  constructor(
    private readonly providerSelector: ProviderSelectorService,
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    @InjectMetric('cep_fallback_total')
    private readonly fallbackCounter: Counter<string>,
  ) {
    super();
    this.cacheTtl = this.configService.get<number>('cep.cacheTtl') ?? 86400;
  }

  async process(job: Job<CepJobData>): Promise<CepProviderResult> {
    const { cep } = job.data;

    this.logger.log('cep_job_started', {
      cep,
      jobId: job.id,
      attempt: job.attemptsMade + 1,
    });

    const cacheKey = `cep:${cep}`;
    const cached = await this.cacheService.get<CepProviderResult>(cacheKey);

    if (cached !== null) {
      this.logger.log('cep_job_cache_hit', { cep, jobId: job.id });
      return cached;
    }

    this.logger.log('cep_job_cache_miss', { cep, jobId: job.id });

    const providers = this.providerSelector.getOrderedProviders();
    let notFoundCount = 0;
    let technicalErrorCount = 0;

    for (let i = 0; i < providers.length; i++) {
      const provider = providers[i];

      if (i > 0) {
        this.fallbackCounter.inc({
          from: providers[i - 1].name,
          to: provider.name,
        });
        this.logger.log('cep_job_provider_fallback', {
          from: providers[i - 1].name,
          to: provider.name,
          reason: technicalErrorCount > 0 ? 'technical_error' : 'not_found',
          cep,
          jobId: job.id,
        });
      }

      try {
        const result = await provider.getCep(cep);
        await this.cacheService.set(cacheKey, result, this.cacheTtl);

        this.logger.log('cep_job_success', {
          cep,
          jobId: job.id,
          provider: provider.name,
        });
        return result;
      } catch (error) {
        if (error instanceof CepNotFoundException) {
          notFoundCount++;
        } else {
          technicalErrorCount++;
          this.logger.warn('cep_job_provider_failed', {
            provider: provider.name,
            cep,
            jobId: job.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (notFoundCount === providers.length && technicalErrorCount === 0) {
      this.logger.log('cep_job_not_found', { cep, jobId: job.id });
      // Throws a specific message so the caller knows it's a 404, not a 503
      throw new Error(`NOT_FOUND:${cep}`);
    }

    this.logger.error('cep_job_all_providers_failed', {
      cep,
      jobId: job.id,
      notFoundCount,
      technicalErrorCount,
    });

    throw new Error('PROVIDERS_UNAVAILABLE');
  }
}
