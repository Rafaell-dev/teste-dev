import { plainToClass } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  REDIS_HOST: string = 'localhost';

  @IsNumber()
  @Min(1)
  @Max(65535)
  REDIS_PORT: number = 6380;

  @IsNumber()
  @Min(1)
  CEP_CACHE_TTL: number = 86400;

  @IsNumber()
  @Min(500)
  CEP_PROVIDER_TIMEOUT_MS: number = 3000;

  @IsUrl({ require_tld: false })
  VIACEP_BASE_URL: string = 'https://viacep.com.br';

  @IsUrl({ require_tld: false })
  BRASIL_API_BASE_URL: string = 'https://brasilapi.com.br';
}

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToClass(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.toString()}`);
  }

  return validatedConfig;
}

export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  cep: {
    cacheTtl: parseInt(process.env.CEP_CACHE_TTL || '86400', 10),
    providerTimeoutMs: parseInt(
      process.env.CEP_PROVIDER_TIMEOUT_MS || '3000',
      10,
    ),
  },
  viacep: {
    baseUrl: process.env.VIACEP_BASE_URL || 'https://viacep.com.br',
  },
  brasilApi: {
    baseUrl: process.env.BRASIL_API_BASE_URL || 'https://brasilapi.com.br',
  },
});
