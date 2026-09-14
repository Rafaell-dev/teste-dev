import { Module } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';
import { RateLimitGuard } from './rate-limit.guard';
import { RATE_LIMIT_IDENTIFIER } from './rate-limit.interface';
import { IpRateLimitIdentifier } from './rate-limit.identifier';
import { RedisModule } from '../redis/redis.module';
import { LoggerModule } from '../logger/logger.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [RedisModule, LoggerModule, MetricsModule],
  providers: [
    RateLimitService,
    RateLimitGuard,
    {
      provide: RATE_LIMIT_IDENTIFIER,
      useClass: IpRateLimitIdentifier,
    },
  ],
  exports: [RateLimitGuard, RateLimitService, RATE_LIMIT_IDENTIFIER],
})
export class RateLimitModule {}
