export class ConcurrencyError extends Error {
  constructor(message = 'La reserva fue modificada por otra operación') {
    super(message);
    this.name = 'ConcurrencyError';
  }
}
