import { Injectable, Logger } from '@nestjs/common';
import { requestContextStorage } from '../request-context/request-context';

@Injectable()
export class LoggerService {
  private readonly logger = new Logger(LoggerService.name);

  private enrich(extra?: Record<string, unknown>): Record<string, unknown> {
    const store = requestContextStorage.getStore();
    return {
      ...(store?.requestId ? { requestId: store.requestId } : {}),
      ...extra,
    };
  }

  log(event: string, context?: Record<string, unknown>): void {
    this.logger.log(JSON.stringify({ event, ...this.enrich(context) }));
  }

  error(event: string, context?: Record<string, unknown>): void {
    this.logger.error(JSON.stringify({ event, ...this.enrich(context) }));
  }

  warn(event: string, context?: Record<string, unknown>): void {
    this.logger.warn(JSON.stringify({ event, ...this.enrich(context) }));
  }

  debug(event: string, context?: Record<string, unknown>): void {
    this.logger.debug(JSON.stringify({ event, ...this.enrich(context) }));
  }
}
