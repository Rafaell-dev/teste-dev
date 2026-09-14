import { Module } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';
import { RateLimitGuard } from './rate-limit.guard';
import { RATE_LIMIT_IDENTIFIER } from './rate-limit.interface';
import { IpRateLimitIdentifier } from './rate-limit.identifier';
import { RedisModule } from '../redis/redis.module';
import { LoggerModule } from '../logger/logger.module';

@Module({
  imports: [RedisModule, LoggerModule],
  providers: [
    RateLimitService,
    RateLimitGuard,
    {
      provide: RATE_LIMIT_IDENTIFIER,
      useClass: IpRateLimitIdentifier,
    },
  ],
  exports: [RateLimitGuard],
})
export class RateLimitModule {}
