export class ProviderInvalidResponseException extends Error {
  readonly code = 'PROVIDER_INVALID_RESPONSE';

  constructor(provider: string, reason?: string) {
    super(
      `Invalid response from provider "${provider}"` +
        (reason ? `: ${reason}` : ''),
    );
    this.name = 'ProviderInvalidResponseException';
  }
}
