import type { BookingsApplicationService } from '../bookings.application.service';
import type { BookingResponse } from '../contracts/booking-response';
import type { BookingReadRepositoryPort } from '../ports/booking-read.repository';
import { GetBookingQuery, ListBookingsQuery } from './booking.queries';
import {
  GetBookingHandler,
  ListBookingsHandler,
} from './booking.query.handlers';

describe('Booking query handlers', () => {
  it('falls back to the normalized repository when the projection is disabled', async () => {
    const expected: BookingResponse[] = [];
    const service = {
      list: () => Promise.resolve(expected),
    } as unknown as BookingsApplicationService;
    const readRepository: BookingReadRepositoryPort = {
      list: () => Promise.resolve({ enabled: false }),
      get: () => Promise.resolve({ enabled: false }),
    };
    const handler = new ListBookingsHandler(service, readRepository);

    const result = await handler.execute(
      new ListBookingsQuery({ id: 'user_1', role: 'pet-owner' }),
    );

    expect(result).toBe(expected);
  });

  it('falls back when a projected detail has not arrived yet', async () => {
    const expected = {} as BookingResponse;
    const service = {
      get: () => Promise.resolve(expected),
    } as unknown as BookingsApplicationService;
    const readRepository: BookingReadRepositoryPort = {
      list: () => Promise.resolve({ enabled: true, value: [] }),
      get: () => Promise.resolve({ enabled: true }),
    };
    const handler = new GetBookingHandler(service, readRepository);

    const result = await handler.execute(
      new GetBookingQuery('booking_1', { id: 'user_1', role: 'pet-owner' }),
    );

    expect(result).toBe(expected);
  });
});
