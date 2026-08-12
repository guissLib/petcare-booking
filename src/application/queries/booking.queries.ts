import { Query } from '@nestjs/cqrs';
import type { BookingActor, QuoteInput } from '../bookings.application.service';
import type {
  BookingAvailabilityResponse,
  BookingQuoteResponse,
  BookingResponse,
} from '../contracts/booking-response';
import type { BookingPagination } from '../ports/booking.repository';
import type { BookingStatus } from '../../domain/booking.entity';

export class QuoteBookingQuery extends Query<BookingQuoteResponse> {
  constructor(
    public readonly userId: string,
    public readonly input: QuoteInput,
    public readonly enforceVaccination = false,
  ) {
    super();
  }
}

export class ListBookingsQuery extends Query<BookingResponse[]> {
  constructor(
    public readonly actor: BookingActor,
    public readonly status?: BookingStatus,
    public readonly pagination?: BookingPagination,
  ) {
    super();
  }
}

export class GetBookingQuery extends Query<BookingResponse> {
  constructor(
    public readonly bookingId: string,
    public readonly actor: BookingActor,
  ) {
    super();
  }
}

export class CheckAvailabilityQuery extends Query<BookingAvailabilityResponse> {
  constructor(
    public readonly providerId: string,
    public readonly date: string,
    public readonly capacity: number,
  ) {
    super();
  }
}
