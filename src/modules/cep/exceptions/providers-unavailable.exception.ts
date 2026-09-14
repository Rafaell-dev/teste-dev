export class ProvidersUnavailableException extends Error {
  readonly code = 'PROVIDERS_UNAVAILABLE';

  constructor(message?: string) {
    super(message ?? 'All CEP providers are currently unavailable');
    this.name = 'ProvidersUnavailableException';
  }
}
