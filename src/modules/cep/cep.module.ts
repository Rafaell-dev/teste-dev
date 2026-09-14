import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '../../shared/cache/cache.module';
import { RateLimitModule } from '../../shared/rate-limit/rate-limit.module';
import { MetricsModule } from '../../shared/metrics/metrics.module';
import { HttpClientService } from '../../shared/http/http-client.service';
import { CepController } from './controllers/cep.controller';
import { CepService } from './services/cep.service';
import { ProviderSelectorService } from './services/provider-selector.service';
import { ViaCepProvider } from './providers/viacep/viacep.provider';
import { BrasilApiProvider } from './providers/brasil-api/brasil-api.provider';
import { CEP_PROVIDERS } from './providers/interfaces/cep-provider.interface';
import { CepProcessor } from './queues/cep.processor';
import { CEP_QUEUE_NAME } from './queues/cep.queue';

/**
 * How to add a third provider:
 *   1. Create ThirdProvider implements CepProvider (in providers/third/).
 *   2. Add ThirdProvider to the providers array below.
 *   3. Add ThirdProvider to the useFactory inject array and the returned list.
 *   4. Done — CepService and ProviderSelectorService need no changes.
 */
@Module({
  imports: [
    CacheModule,
    RateLimitModule,
    MetricsModule,
    BullModule.registerQueue({ name: CEP_QUEUE_NAME }),
  ],
  controllers: [CepController],
  providers: [
    HttpClientService,
    CepService,
    ProviderSelectorService,
    CepProcessor,
    ViaCepProvider,
    BrasilApiProvider,
    {
      provide: CEP_PROVIDERS,
      inject: [ViaCepProvider, BrasilApiProvider],
      useFactory: (viaCep: ViaCepProvider, brasilApi: BrasilApiProvider) => [
        viaCep,
        brasilApi,
      ],
    },
  ],
})
export class CepModule {}
