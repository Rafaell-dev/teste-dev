export class CepInvalidException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CepInvalidException';
  }
}
