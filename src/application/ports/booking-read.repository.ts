import type { BookingActor } from '../bookings.application.service';
import type { BookingResponse } from '../contracts/booking-response';
import type { BookingStatus } from '../../domain/booking.entity';
import type { BookingPagination } from './booking.repository';

export const BOOKING_READ_REPOSITORY = Symbol('BOOKING_READ_REPOSITORY');

export interface BookingReadResult<T> {
  enabled: boolean;
  value?: T;
}

export interface BookingReadRepositoryPort {
  list(
    actor: BookingActor,
    status?: BookingStatus,
    pagination?: BookingPagination,
  ): Promise<BookingReadResult<BookingResponse[]>>;
  get(
    id: string,
    actor: BookingActor,
  ): Promise<BookingReadResult<BookingResponse>>;
}
