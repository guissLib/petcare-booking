import type { BookingEvent } from '../contracts/booking-event.contract';

export const BOOKING_EVENT_BUS = Symbol('BOOKING_EVENT_BUS');

export type BookingEventHandler = (event: BookingEvent) => Promise<void>;

export interface BookingEventBus {
  publishBookingEvent(event: BookingEvent): Promise<void>;
  registerBookingEvent(handler: BookingEventHandler): void;
}
