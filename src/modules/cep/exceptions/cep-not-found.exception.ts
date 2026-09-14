export class CepNotFoundException extends Error {
  readonly code = 'CEP_NOT_FOUND';

  constructor(cep?: string) {
    super(cep ? `CEP ${cep} não encontrado` : 'CEP não encontrado');
    this.name = 'CepNotFoundException';
  }
}
