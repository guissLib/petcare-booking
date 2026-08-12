import { Command } from '@nestjs/cqrs';
import type {
  BookingActor,
  CreateBookingInput,
  PaymentCardInput,
} from '../bookings.application.service';
import type {
  BookingPaymentResponse,
  BookingResponse,
} from '../contracts/booking-response';
import type { SagaMessage } from '../contracts/saga-message.contract';
import type { Booking, BookingStatus } from '../../domain/booking.entity';

export class CreateBookingCommand extends Command<BookingResponse> {
  constructor(
    public readonly userId: string,
    public readonly input: CreateBookingInput,
  ) {
    super();
  }
}

export class PayBookingCommand extends Command<BookingPaymentResponse> {
  constructor(
    public readonly bookingId: string,
    public readonly card: PaymentCardInput,
    public readonly actor: BookingActor,
  ) {
    super();
  }
}

export class UpdateBookingStatusCommand extends Command<BookingResponse> {
  constructor(
    public readonly bookingId: string,
    public readonly status: BookingStatus,
    public readonly actor: BookingActor,
    public readonly reason?: string,
  ) {
    super();
  }
}

export class ScheduleBookingReminderCommand extends Command<{
  bookingId: string;
  scheduled: boolean;
  message: string;
}> {
  constructor(
    public readonly bookingId: string,
    public readonly actor: BookingActor,
  ) {
    super();
  }
}

export class ConfirmBookingCommand extends Command<BookingResponse> {
  constructor(public readonly message: SagaMessage) {
    super();
  }
}

export class CancelBookingCommand extends Command<BookingResponse> {
  constructor(
    public readonly bookingId: string,
    public readonly reason?: string,
    public readonly causationId?: string,
  ) {
    super();
  }
}

export class ExpirePendingBookingsCommand extends Command<Booking[]> {
  constructor(public readonly now?: Date) {
    super();
  }
}
