import { BadGatewayException, Injectable } from '@nestjs/common';
import type {
  PaymentCardInput,
  PaymentServicePort,
  PaymentServiceResponse,
} from '../../application/ports/payment-service.port';

@Injectable()
export class PetcarePaymentClient implements PaymentServicePort {
  private readonly baseUrl = (
    process.env.PETCARE_BACKEND_URL ?? 'http://localhost:3005/api'
  ).replace(/\/$/, '');

  async createIntent(input: {
    bookingId: string;
    userId: string;
    amount: number;
    method: 'online' | 'at-location';
  }) {
    return this.request<PaymentServiceResponse>(
      '/internal/payments/intents',
      input,
    );
  }

  async charge(input: {
    bookingId: string;
    userId: string;
    providerId: string;
    paymentId: string;
    amount: number;
    card: PaymentCardInput;
  }) {
    const { card, ...bookingContext } = input;
    return this.request<PaymentServiceResponse>(
      `/internal/payments/${encodeURIComponent(input.paymentId)}/mock-charge`,
      {
        ...bookingContext,
        ...card,
      },
    );
  }

  async publishConfirmed(input: {
    bookingId: string;
    userId: string;
    providerId: string;
    paymentId: string;
    amount: number;
  }) {
    await this.request<PaymentServiceResponse>(
      `/internal/payments/${encodeURIComponent(input.paymentId)}/publish-confirmed`,
      input,
    );
  }

  async confirmAtLocation(input: {
    bookingId: string;
    userId: string;
    providerId: string;
    paymentId: string;
    amount: number;
  }) {
    await this.request<PaymentServiceResponse>(
      `/internal/payments/${encodeURIComponent(input.paymentId)}/confirm-at-location`,
      input,
    );
  }

  async cancelPending(paymentId: string) {
    await this.request<PaymentServiceResponse>(
      `/internal/payments/${encodeURIComponent(paymentId)}/cancel-pending`,
      { paymentId },
    );
  }

  private async request<T>(path: string, body: Record<string, unknown>) {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-petcare-service-secret': serviceSecret(),
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new BadGatewayException('No se pudo conectar con Payment');
    }
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new BadGatewayException(readError(result));
    }
    return result as T;
  }
}

function serviceSecret() {
  return (
    process.env.PETCARE_SERVICE_SECRET ??
    (process.env.NODE_ENV === 'production' ? '' : 'petcare-local-service')
  );
}

function readError(value: unknown) {
  if (
    value &&
    typeof value === 'object' &&
    'message' in value &&
    typeof value.message === 'string'
  ) {
    return value.message;
  }
  return 'Payment rechazó la solicitud';
}
