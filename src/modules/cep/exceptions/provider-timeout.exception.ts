export class ProviderTimeoutException extends Error {
  readonly code = 'PROVIDER_TIMEOUT';

  constructor(message?: string) {
    super(message ?? 'Provider request timed out');
    this.name = 'ProviderTimeoutException';
  }
}
