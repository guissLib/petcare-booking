import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  CancelBookingCommand,
  ConfirmBookingCommand,
  CreateBookingCommand,
  ExpirePendingBookingsCommand,
  PayBookingCommand,
  ScheduleBookingReminderCommand,
  UpdateBookingStatusCommand,
} from './booking.commands';
import { BookingsApplicationService } from '../bookings.application.service';

@CommandHandler(CreateBookingCommand)
export class CreateBookingHandler implements ICommandHandler<CreateBookingCommand> {
  constructor(private readonly bookings: BookingsApplicationService) {}

  execute(command: CreateBookingCommand) {
    return this.bookings.create(command.userId, command.input);
  }
}

@CommandHandler(PayBookingCommand)
export class PayBookingHandler implements ICommandHandler<PayBookingCommand> {
  constructor(private readonly bookings: BookingsApplicationService) {}

  execute(command: PayBookingCommand) {
    return this.bookings.pay(command.bookingId, command.card, command.actor);
  }
}

@CommandHandler(UpdateBookingStatusCommand)
export class UpdateBookingStatusHandler implements ICommandHandler<UpdateBookingStatusCommand> {
  constructor(private readonly bookings: BookingsApplicationService) {}

  execute(command: UpdateBookingStatusCommand) {
    return this.bookings.updateStatus(
      command.bookingId,
      command.status,
      command.actor,
      command.reason,
    );
  }
}

@CommandHandler(ScheduleBookingReminderCommand)
export class ScheduleBookingReminderHandler implements ICommandHandler<ScheduleBookingReminderCommand> {
  constructor(private readonly bookings: BookingsApplicationService) {}

  execute(command: ScheduleBookingReminderCommand) {
    return this.bookings.reminder(command.bookingId, command.actor);
  }
}

@CommandHandler(ConfirmBookingCommand)
export class ConfirmBookingHandler implements ICommandHandler<ConfirmBookingCommand> {
  constructor(private readonly bookings: BookingsApplicationService) {}

  execute(command: ConfirmBookingCommand) {
    return this.bookings.confirmFromPaymentCommand(command.message);
  }
}

@CommandHandler(CancelBookingCommand)
export class CancelBookingHandler implements ICommandHandler<CancelBookingCommand> {
  constructor(private readonly bookings: BookingsApplicationService) {}

  execute(command: CancelBookingCommand) {
    return this.bookings.cancelFromSaga(
      command.bookingId,
      command.reason,
      command.causationId,
    );
  }
}

@CommandHandler(ExpirePendingBookingsCommand)
export class ExpirePendingBookingsHandler implements ICommandHandler<ExpirePendingBookingsCommand> {
  constructor(private readonly bookings: BookingsApplicationService) {}

  execute(command: ExpirePendingBookingsCommand) {
    return this.bookings.expirePendingPayments(command.now);
  }
}

export const bookingCommandHandlers = [
  CreateBookingHandler,
  PayBookingHandler,
  UpdateBookingStatusHandler,
  ScheduleBookingReminderHandler,
  ConfirmBookingHandler,
  CancelBookingHandler,
  ExpirePendingBookingsHandler,
];
