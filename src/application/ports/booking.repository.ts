import type { Booking, BookingStatus } from '../../domain/booking.entity';
import type { BookingEvent } from '../contracts/booking-event.contract';

export const BOOKING_REPOSITORY = Symbol('BOOKING_REPOSITORY');

export interface BookingPagination {
  page: number;
  pageSize: number;
}

export interface BookingRepositoryPort {
  save(booking: Booking, event?: BookingEvent): Promise<Booking>;
  findById(id: string): Promise<Booking | undefined>;
  findByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<Booking | undefined>;
  findAll(
    filters?: {
      userId?: string;
      providerId?: string;
      status?: BookingStatus;
    },
    pagination?: BookingPagination,
  ): Promise<Booking[]>;
  findForAvailability(providerId: string, date: string): Promise<Booking[]>;
  expirePending(now?: Date): Promise<Booking[]>;
}
