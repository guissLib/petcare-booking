import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { BookingsApplicationService } from '../bookings.application.service';
import {
  CheckAvailabilityQuery,
  GetBookingQuery,
  ListBookingsQuery,
  QuoteBookingQuery,
} from './booking.queries';
import {
  BOOKING_READ_REPOSITORY,
  type BookingReadRepositoryPort,
} from '../ports/booking-read.repository';
import { Inject } from '@nestjs/common';

@QueryHandler(QuoteBookingQuery)
export class QuoteBookingHandler implements IQueryHandler<QuoteBookingQuery> {
  constructor(private readonly bookings: BookingsApplicationService) {}

  execute(query: QuoteBookingQuery) {
    return this.bookings.quote(
      query.userId,
      query.input,
      query.enforceVaccination,
    );
  }
}

@QueryHandler(ListBookingsQuery)
export class ListBookingsHandler implements IQueryHandler<ListBookingsQuery> {
  constructor(
    private readonly bookings: BookingsApplicationService,
    @Inject(BOOKING_READ_REPOSITORY)
    private readonly readRepository: BookingReadRepositoryPort,
  ) {}

  async execute(query: ListBookingsQuery) {
    const projected = await this.readRepository.list(
      query.actor,
      query.status,
      query.pagination,
    );
    if (projected.enabled && projected.value && projected.value.length > 0) {
      return projected.value;
    }
    return this.bookings.list(query.actor, query.status, query.pagination);
  }
}

@QueryHandler(GetBookingQuery)
export class GetBookingHandler implements IQueryHandler<GetBookingQuery> {
  constructor(
    private readonly bookings: BookingsApplicationService,
    @Inject(BOOKING_READ_REPOSITORY)
    private readonly readRepository: BookingReadRepositoryPort,
  ) {}

  async execute(query: GetBookingQuery) {
    const projected = await this.readRepository.get(
      query.bookingId,
      query.actor,
    );
    if (projected.enabled && projected.value) {
      return projected.value;
    }
    return this.bookings.get(query.bookingId, query.actor);
  }
}

@QueryHandler(CheckAvailabilityQuery)
export class CheckAvailabilityHandler implements IQueryHandler<CheckAvailabilityQuery> {
  constructor(private readonly bookings: BookingsApplicationService) {}

  execute(query: CheckAvailabilityQuery) {
    return this.bookings.availability(
      query.providerId,
      query.date,
      query.capacity,
    );
  }
}

export const bookingQueryHandlers = [
  QuoteBookingHandler,
  ListBookingsHandler,
  GetBookingHandler,
  CheckAvailabilityHandler,
];
