import { Inject, Injectable } from '@nestjs/common';
import {
  CepProvider,
  CEP_PROVIDERS,
} from '../providers/interfaces/cep-provider.interface';

/**
 * Selects the ordered list of providers to try for a given request
 * using a simple round-robin strategy.
 *
 * Round-robin means:
 *   request 1 → [ViaCEP, BrasilAPI]
 *   request 2 → [BrasilAPI, ViaCEP]
 *   request 3 → [ViaCEP, BrasilAPI]
 *   ...
 *
 * CepService iterates the returned list, falling back to the next provider
 * on technical failures. The Strategy pattern here means CepService never
 * knows which provider is "first" — it just processes the list.
 *
 * Adding a third provider:
 *   1. Create ThirdProvider implements CepProvider.
 *   2. Add to CepModule providers and to the CEP_PROVIDERS factory.
 *   3. No changes needed here or in CepService.
 */
@Injectable()
export class ProviderSelectorService {
  private counter = 0;

  constructor(
    @Inject(CEP_PROVIDERS)
    private readonly providers: CepProvider[],
  ) {}

  /**
   * Returns all providers in rotated order starting from the next index.
   * Thread-safety note: this counter is per-process. In a clustered
   * deployment, each process maintains its own counter — still acceptable
   * for this use case.
   */
  getOrderedProviders(): CepProvider[] {
    if (this.providers.length === 0) return [];

    const startIndex = this.counter % this.providers.length;
    this.counter = (this.counter + 1) % Number.MAX_SAFE_INTEGER;

    return [
      ...this.providers.slice(startIndex),
      ...this.providers.slice(0, startIndex),
    ];
  }
}
