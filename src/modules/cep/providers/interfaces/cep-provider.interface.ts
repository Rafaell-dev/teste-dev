/**
 * Normalized result returned by every CEP provider adapter.
 * The rest of the application only depends on this contract,
 * not on ViaCEP or BrasilAPI specifics.
 */
export interface CepProviderResult {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

/**
 * Contract that all CEP provider adapters must implement.
 *
 * To add a third provider:
 *   1. Create a class that implements CepProvider.
 *   2. Register it in CepModule's providers and add it to the CEP_PROVIDERS array.
 *   3. No changes required in CepService or ProviderSelectorService.
 */
export interface CepProvider {
  /** Human-readable name used in logs and metrics (e.g. "viacep"). */
  readonly name: string;

  /**
   * Fetches a CEP from the external API.
   *
   * @throws CepNotFoundException   – CEP definitively does not exist.
   * @throws ProviderTimeoutException – Request exceeded configured timeout.
   * @throws ProviderInvalidResponseException – Response failed DTO validation.
   */
  getCep(cep: string): Promise<CepProviderResult>;
}

/** Injection token for the list of registered CepProvider instances. */
export const CEP_PROVIDERS = 'CEP_PROVIDERS';
