import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import configuration, { validate } from './config/configuration';
import { RedisModule } from './shared/redis/redis.module';
import { LoggerModule } from './shared/logger/logger.module';
import { RequestContextModule } from './shared/request-context/request-context.module';
import { MetricsModule } from './shared/metrics/metrics.module';
import { CepModule } from './modules/cep/cep.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    // Config must be first — other modules depend on ConfigService
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
      /**
       * .env is optional in production (environment variables may be
       * provided by the host without a file).
       */
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),

    // Global infrastructure
    RedisModule,
    LoggerModule,
    RequestContextModule,
    MetricsModule,

    /**
     * BullMQ uses the same Redis instance as the cache.
     * This keeps infrastructure simple — one Redis, two concerns.
     */
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          password: configService.get<string>('redis.password'),
        },
      }),
    }),

    // Feature modules
    CepModule,
    HealthModule,
  ],
})
export class AppModule {}
