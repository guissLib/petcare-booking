import { BadGatewayException, Injectable } from '@nestjs/common';
import type {
  BookingContext,
  BookingContextPort,
} from '../../application/ports/booking-context.port';
import type {
  CreateBookingInput,
  QuoteInput,
} from '../../application/bookings.application.service';

@Injectable()
export class PetcareBackendContextClient implements BookingContextPort {
  private readonly baseUrl = (
    process.env.PETCARE_BACKEND_URL ?? 'http://localhost:3005/api'
  ).replace(/\/$/, '');

  async get(
    userId: string,
    input: QuoteInput | CreateBookingInput,
  ): Promise<BookingContext> {
    const response = await this.request('/internal/booking-context', {
      userId,
      petId: input.petId,
      providerId: input.providerId,
      serviceType: input.serviceType,
      visitMode: input.visitMode,
      scheduledAt: input.scheduledAt,
    });
    return response as BookingContext;
  }

  private async request(path: string, body: Record<string, unknown>) {
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
      throw new BadGatewayException(
        'No se pudo conectar con el contexto de PetCare',
      );
    }
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new BadGatewayException(readError(result));
    }
    return result;
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
  return 'El contexto de PetCare rechazó la solicitud';
}
