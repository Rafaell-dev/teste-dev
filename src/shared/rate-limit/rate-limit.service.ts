import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';
import { REDIS_CLIENT } from '../redis/redis.module';
import { LoggerService } from '../logger/logger.service';
import { RateLimitResult } from './rate-limit.interface';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';

@Injectable()
export class RateLimitService implements OnModuleInit {
  private luaScriptSha: string;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per millisecond
  private readonly ttlSeconds: number;
  private readonly prefix: string;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    @InjectMetric('cep_rate_limit_total')
    private readonly rateLimitCounter: Counter<string>,
  ) {
    this.capacity = this.configService.get<number>('rateLimit.capacity', 100);
    
    // tokens to add per second
    const refillTokens = this.configService.get<number>('rateLimit.refillRate', 100);
    const windowSeconds = this.configService.get<number>('rateLimit.windowSeconds', 60);
    
    // refillRate in tokens per millisecond
    this.refillRate = (refillTokens / windowSeconds) / 1000;
    
    this.ttlSeconds = this.configService.get<number>('rateLimit.ttlSeconds', 120);
    this.prefix = this.configService.get<string>('rateLimit.keyPrefix', 'ratelimit');
  }

  async onModuleInit() {
    try {
      const scriptPath = path.join(__dirname, 'scripts', 'token-bucket.lua');
      const script = fs.readFileSync(scriptPath, 'utf8');
      
      // Load script into Redis script cache to get its SHA1
      this.luaScriptSha = await this.redis.script('LOAD', script) as string;
      this.logger.log('rate_limit_script_loaded', { sha: this.luaScriptSha });
    } catch (error) {
      this.logger.error('rate_limit_script_load_failed', { 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async checkLimit(identifier: string): Promise<RateLimitResult> {
    try {
      const key = `${this.prefix}:${identifier}`;
      const nowMs = Date.now();

      // Execute lua script
      // result is an array [allowed (0|1), remaining, retryAfter]
      const result = await this.redis.evalsha(
        this.luaScriptSha,
        1, // number of keys
        key, // KEYS[1]
        this.capacity.toString(), // ARGV[1]
        this.refillRate.toString(), // ARGV[2]
        nowMs.toString(), // ARGV[3]
        this.ttlSeconds.toString() // ARGV[4]
      ) as [number, number, number];

      const allowed = result[0] === 1;
      const remaining = result[1];
      const retryAfter = result[2];

      if (allowed) {
        this.logger.log('rate_limit_allowed', { identifier, remaining });
        this.rateLimitCounter.inc({ result: 'allowed' });
      } else {
        this.logger.log('rate_limit_exceeded', { identifier, retryAfter });
        this.rateLimitCounter.inc({ result: 'exceeded' });
      }

      return {
        allowed,
        remaining,
        retryAfter: allowed ? undefined : retryAfter
      };
    } catch (error) {
      // If EVALSHA fails because script is flushed, we could reload it (EVAL)
      // For simplicity and resilience, if anything fails, we Fail-Open
      this.logger.error('rate_limit_redis_error', { 
        identifier, 
        error: error instanceof Error ? error.message : String(error) 
      });

      return {
        allowed: true, // Fail-open
        remaining: 1,
      };
    }
  }
}
