import { Global, Module } from '@nestjs/common';
import {
  makeCounterProvider,
  makeHistogramProvider,
  PrometheusModule,
} from '@willsoto/nestjs-prometheus';

@Global()
@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        enabled: true,
      },
    }),
  ],
  providers: [
    makeCounterProvider({
      name: 'cep_request_total',
      help: 'Total number of CEP requests',
      labelNames: ['status'], // hit, miss, error
    }),
    makeCounterProvider({
      name: 'cep_provider_request_total',
      help: 'Total number of requests to external providers',
      labelNames: ['provider', 'result'], // provider: viacep, brasilapi | result: success, not_found, error
    }),
    makeHistogramProvider({
      name: 'cep_provider_duration_seconds',
      help: 'Duration of external provider requests in seconds',
      labelNames: ['provider'],
      buckets: [0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 5],
    }),
    makeCounterProvider({
      name: 'cep_fallback_total',
      help: 'Total number of fallbacks between providers',
      labelNames: ['from', 'to'],
    }),
    makeCounterProvider({
      name: 'cep_rate_limit_total',
      help: 'Total number of rate limit evaluations',
      labelNames: ['result'], // allowed, exceeded
    }),
  ],
  exports: [
    'PROM_METRIC_CEP_REQUEST_TOTAL',
    'PROM_METRIC_CEP_PROVIDER_REQUEST_TOTAL',
    'PROM_METRIC_CEP_PROVIDER_DURATION_SECONDS',
    'PROM_METRIC_CEP_FALLBACK_TOTAL',
    'PROM_METRIC_CEP_RATE_LIMIT_TOTAL',
  ],
})
export class MetricsModule {}
