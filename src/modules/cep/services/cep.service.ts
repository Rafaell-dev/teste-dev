import { Injectable, OnModuleInit, OnModuleDestroy, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, QueueEvents } from 'bullmq';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';
import { CacheService } from '../../../shared/cache/cache.service';
import { LoggerService } from '../../../shared/logger/logger.service';
import { CepNotFoundException } from '../exceptions/cep-not-found.exception';
import { ProvidersUnavailableException } from '../exceptions/providers-unavailable.exception';
import { CepProviderResult } from '../providers/interfaces/cep-provider.interface';
import { CEP_QUEUE_NAME, CEP_RETRY_JOB } from '../queues/cep.queue';

@Injectable()
export class CepService implements OnModuleInit, OnModuleDestroy {
  private queueEvents: QueueEvents;

  constructor(
    private readonly cacheService: CacheService,
    @InjectQueue(CEP_QUEUE_NAME) private readonly cepQueue: Queue,
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    @InjectMetric('cep_request_total')
    private readonly cepRequestTotalCounter: Counter<string>,
  ) {}

  onModuleInit() {
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);

    this.queueEvents = new QueueEvents(CEP_QUEUE_NAME, {
      connection: { host, port },
    });
  }

  async onModuleDestroy() {
    if (this.queueEvents) {
      await this.queueEvents.close();
    }
  }

  /**
   * Enqueues a CEP resolution job and waits for the worker to process it,
   * checking the cache first to avoid unnecessary queuing.
   */
  async getCep(rawCep: string): Promise<CepProviderResult> {
    const cep = rawCep.replace(/\D/g, '');

    this.logger.log('cep_rpc_request', { cep });

    // --- Cache-Aside: check cache first before queuing ---
    const cacheKey = `cep:${cep}`;
    const cached = await this.cacheService.get<CepProviderResult>(cacheKey);

    if (cached !== null) {
      this.logger.log('cep_cache_hit', { cep });
      this.cepRequestTotalCounter.inc({ status: 'hit' });
      return cached;
    }

    this.logger.log('cep_cache_miss', { cep });
    this.cepRequestTotalCounter.inc({ status: 'miss' });

    const job = await this.cepQueue.add(
      CEP_RETRY_JOB,
      { cep },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 3600, count: 1000 },
      },
    );

    try {
      // Wait for the worker to finish the job
      const result = await job.waitUntilFinished(this.queueEvents);
      return result as CepProviderResult;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('INVALID_CEP:')) {
        const msg = errorMessage.split('INVALID_CEP:')[1];
        throw new BadRequestException(msg);
      }

      if (errorMessage.includes('NOT_FOUND:')) {
        throw new CepNotFoundException(cep);
      }

      this.logger.error('cep_rpc_failed', { cep, error: errorMessage });
      throw new ProvidersUnavailableException();
    }
  }
}
