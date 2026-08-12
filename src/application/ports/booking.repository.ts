import type { Booking, BookingStatus } from '../../domain/booking.entity';

export const BOOKING_REPOSITORY = Symbol('BOOKING_REPOSITORY');

export interface BookingRepositoryPort {
  save(booking: Booking): Promise<Booking>;
  findById(id: string): Promise<Booking | undefined>;
  findByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<Booking | undefined>;
  findAll(filters?: {
    userId?: string;
    providerId?: string;
    status?: BookingStatus;
  }): Promise<Booking[]>;
  findForAvailability(providerId: string, date: string): Promise<Booking[]>;
  expirePending(now?: Date): Promise<Booking[]>;
}
