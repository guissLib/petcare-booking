import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  createSagaMessage,
  type SagaMessage,
} from './contracts/saga-message.contract';
import { MESSAGE_BUS, type MessageBus } from './ports/message-bus.port';
import { BookingsApplicationService } from './bookings.application.service';

@Injectable()
export class BookingSagaConsumer implements OnModuleInit {
  private readonly logger = new Logger(BookingSagaConsumer.name);

  constructor(
    @Inject(MESSAGE_BUS) private readonly messages: MessageBus,
    private readonly bookings: BookingsApplicationService,
  ) {}

  onModuleInit() {
    const queue =
      process.env.RABBITMQ_BOOKING_QUEUE ?? 'booking-service.commands';
    this.messages.register(queue, 'booking.confirm', (message) =>
      this.confirm(message),
    );
    this.messages.register(queue, 'booking.cancel', (message) =>
      this.cancel(message),
    );
  }

  private async confirm(message: SagaMessage) {
    try {
      const booking = await this.bookings.confirmFromPaymentCommand(message);
      await this.messages.publish(
        createSagaMessage('booking.confirmed', message.sagaId, {
          bookingId: booking.id,
          paymentId: booking.paymentId,
          userId: booking.userId,
          providerId: booking.providerId,
          amount: booking.total,
          currency: 'COP',
        }),
      );
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(
        `No se pudo confirmar booking=${message.bookingId ?? 'unknown'}: ${reason}`,
      );
      await this.messages.publish(
        createSagaMessage('booking.confirmation.failed', message.sagaId, {
          bookingId: message.bookingId,
          paymentId: message.paymentId,
          reason,
        }),
      );
    }
  }

  private async cancel(message: SagaMessage) {
    try {
      const bookingId = message.bookingId;
      if (!bookingId) {
        throw new Error('Mensaje Saga sin bookingId');
      }
      const booking = await this.bookings.cancelFromSaga(
        bookingId,
        message.reason,
      );
      await this.messages.publish(
        createSagaMessage('booking.cancelled', message.sagaId, {
          bookingId: booking.id,
          paymentId: booking.paymentId,
        }),
      );
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(
        `No se pudo cancelar booking=${message.bookingId ?? 'unknown'}: ${reason}`,
      );
      await this.messages.publish(
        createSagaMessage('booking.cancellation.failed', message.sagaId, {
          bookingId: message.bookingId,
          reason,
        }),
      );
    }
  }
}
