import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { ChannelModel, ConfirmChannel, ConsumeMessage } from 'amqplib';
import amqp from 'amqplib';
import type {
  SagaMessage,
  SagaMessageHandler,
  SagaMessageName,
} from '../../application/contracts/saga-message.contract';
import type { BookingEvent } from '../../application/contracts/booking-event.contract';
import type {
  BookingEventBus,
  BookingEventHandler,
} from '../../application/ports/booking-event-bus.port';
import type { MessageBus } from '../../application/ports/message-bus.port';

@Injectable()
export class RabbitMqMessageBus
  implements MessageBus, BookingEventBus, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RabbitMqMessageBus.name);
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private reconnectTimer?: NodeJS.Timeout;
  private readonly handlers = new Map<SagaMessageName, SagaMessageHandler>();
  private consumerStarted = false;
  private bookingEventHandler?: BookingEventHandler;
  private bookingEventConsumerStarted = false;
  private readonly bookingEventAttempts = new Map<string, number>();

  async onModuleInit() {
    await this.connect();
    this.reconnectTimer = setInterval(() => {
      if (!this.channel) {
        void this.connect();
      }
    }, 5000);
  }

  async onModuleDestroy() {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
    }
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
    this.channel = undefined;
    this.connection = undefined;
    this.bookingEventConsumerStarted = false;
  }

  async publish(message: SagaMessage) {
    const channel = this.channel;
    if (!channel) {
      throw new Error(
        `RabbitMQ no disponible para publicar ${message.eventName} ${message.eventId}`,
      );
    }
    const exchange = this.exchange();
    channel.publish(
      exchange,
      message.eventName,
      Buffer.from(JSON.stringify(message)),
      {
        contentType: 'application/json',
        persistent: true,
        messageId: message.eventId,
        type: message.eventName,
        timestamp: Date.now(),
      },
    );
    await channel.waitForConfirms();
    this.logger.log(
      `Mensaje publicado name=${message.eventName} id=${message.eventId} saga=${message.sagaId ?? '-'}`,
    );
  }

  async publishBookingEvent(event: BookingEvent) {
    const channel = this.channel;
    if (!channel) {
      throw new Error('RabbitMQ no disponible para publicar evento de Booking');
    }
    channel.publish(
      this.exchange(),
      bookingEventRoutingKey(event.eventType),
      Buffer.from(JSON.stringify(event)),
      {
        contentType: 'application/json',
        persistent: true,
        messageId: event.eventId,
        type: event.eventType,
        timestamp: Date.parse(event.occurredAt),
      },
    );
    await channel.waitForConfirms();
    this.logger.log(
      `Evento Booking publicado type=${event.eventType} id=${event.eventId}`,
    );
  }

  registerBookingEvent(handler: BookingEventHandler) {
    this.bookingEventHandler = handler;
    void this.registerBookingEventConsumer();
  }

  register(
    _queue: string,
    routingKey: SagaMessageName,
    handler: SagaMessageHandler,
  ) {
    this.handlers.set(routingKey, handler);
    void this.registerConsumer(routingKey);
  }

  private async connect() {
    const url = process.env.RABBITMQ_URL ?? process.env.CLOUDAMQP_URL;
    if (!url) {
      this.logger.warn(
        'RABBITMQ_URL no configurado; el booking-service no consumirá comandos Saga',
      );
      return;
    }
    try {
      const connection = await amqp.connect(url);
      const channel = await connection.createConfirmChannel();
      connection.on('close', () => {
        this.channel = undefined;
        this.connection = undefined;
        this.bookingEventConsumerStarted = false;
        this.logger.warn('Conexión RabbitMQ cerrada; se reintentará');
      });
      connection.on('error', (error: Error) => {
        this.logger.error(`RabbitMQ error: ${error.message}`);
      });
      this.connection = connection;
      this.channel = channel;
      this.consumerStarted = false;
      this.bookingEventConsumerStarted = false;
      await channel.assertExchange(this.exchange(), 'topic', { durable: true });
      await this.registerConsumer();
      await this.registerBookingEventConsumer();
      this.logger.log('Booking-service conectado a RabbitMQ');
    } catch (error) {
      this.channel = undefined;
      this.connection = undefined;
      this.bookingEventConsumerStarted = false;
      const message =
        error instanceof Error ? error.message : 'error desconocido';
      this.logger.warn(`No se pudo conectar a RabbitMQ: ${message}`);
    }
  }

  private async registerConsumer(messageName?: SagaMessageName) {
    const channel = this.channel;
    if (!channel) {
      return;
    }
    const queue =
      process.env.RABBITMQ_BOOKING_QUEUE ?? 'booking-service.commands';
    if (this.consumerStarted) {
      if (messageName) {
        await channel.bindQueue(queue, this.exchange(), messageName);
      }
      return;
    }
    const deadLetterExchange =
      process.env.RABBITMQ_DEAD_LETTER_EXCHANGE ?? `${this.exchange()}.dead`;
    const deadLetterQueue =
      process.env.RABBITMQ_BOOKING_DLQ ?? 'booking-service.commands.dlq';
    await channel.assertExchange(deadLetterExchange, 'topic', {
      durable: true,
    });
    await channel.assertQueue(deadLetterQueue, { durable: true });
    await channel.bindQueue(deadLetterQueue, deadLetterExchange, '#');
    await channel.assertQueue(queue, {
      durable: true,
      deadLetterExchange,
    });
    for (const messageName of this.handlers.keys()) {
      await channel.bindQueue(queue, this.exchange(), messageName);
    }
    await channel.consume(queue, (raw) => {
      void this.handle(raw);
    });
    this.consumerStarted = true;
  }

  private async registerBookingEventConsumer() {
    const channel = this.channel;
    if (!channel || !this.bookingEventHandler) {
      return;
    }
    if (this.bookingEventConsumerStarted) {
      return;
    }
    const exchange = this.exchange();
    const queue =
      process.env.RABBITMQ_BOOKING_READ_QUEUE ?? 'booking-service.read-model';
    const deadLetterExchange =
      process.env.RABBITMQ_DEAD_LETTER_EXCHANGE ?? `${exchange}.dead`;
    const deadLetterQueue =
      process.env.RABBITMQ_BOOKING_READ_DLQ ?? 'booking-service.read-model.dlq';
    await channel.assertExchange(deadLetterExchange, 'topic', {
      durable: true,
    });
    await channel.assertQueue(deadLetterQueue, { durable: true });
    await channel.bindQueue(deadLetterQueue, deadLetterExchange, '#');
    await channel.assertQueue(queue, {
      durable: true,
      deadLetterExchange,
    });
    for (const routingKey of bookingProjectionRoutingKeys()) {
      await channel.bindQueue(queue, exchange, routingKey);
    }
    await channel.consume(queue, (raw) => {
      void this.handleBookingEvent(raw);
    });
    this.bookingEventConsumerStarted = true;
  }

  private async handle(raw: ConsumeMessage | null) {
    if (!raw) {
      return;
    }
    try {
      const parsed: unknown = JSON.parse(raw.content.toString());
      if (!isSagaMessage(parsed)) {
        throw new Error('Mensaje Saga inválido');
      }
      const handler = this.handlers.get(parsed.eventName);
      if (!handler) {
        throw new Error(`No hay handler para ${parsed.eventName}`);
      }
      await handler(parsed);
      this.channel?.ack(raw);
      this.logger.log(
        `Comando consumido name=${parsed.eventName} id=${parsed.eventId} saga=${parsed.sagaId ?? '-'}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'error desconocido';
      this.logger.error(`Error procesando comando Booking: ${message}`);
      this.channel?.nack(raw, false, false);
    }
  }

  private async handleBookingEvent(raw: ConsumeMessage | null) {
    if (!raw || !this.bookingEventHandler) {
      return;
    }
    let eventId: string | undefined;
    try {
      const parsed: unknown = JSON.parse(raw.content.toString());
      if (!isBookingEvent(parsed)) {
        throw new Error('Evento Booking inválido');
      }
      eventId = parsed.eventId;
      await this.bookingEventHandler(parsed);
      this.bookingEventAttempts.delete(eventId);
      this.channel?.ack(raw);
      this.logger.log(
        `Evento Booking consumido type=${parsed.eventType} id=${parsed.eventId}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'error desconocido';
      this.logger.error(`Error proyectando evento Booking: ${message}`);
      const attempts = eventId
        ? (this.bookingEventAttempts.get(eventId) ?? 0) + 1
        : projectionRetryLimit();
      if (eventId && attempts < projectionRetryLimit()) {
        this.bookingEventAttempts.set(eventId, attempts);
        setTimeout(
          () => this.channel?.nack(raw, false, true),
          projectionRetryDelay(attempts),
        );
        return;
      }
      if (eventId) {
        this.bookingEventAttempts.delete(eventId);
      }
      this.channel?.nack(raw, false, false);
    }
  }

  private exchange() {
    return (
      process.env.RABBITMQ_EXCHANGE ??
      process.env.AMQP_EXCHANGE ??
      'petcare.events'
    );
  }
}

function isSagaMessage(value: unknown): value is SagaMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<SagaMessage>;
  return (
    typeof candidate.eventId === 'string' &&
    typeof candidate.eventName === 'string' &&
    typeof candidate.occurredAt === 'string'
  );
}

function isBookingEvent(value: unknown): value is BookingEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<BookingEvent>;
  return (
    typeof candidate.eventId === 'string' &&
    typeof candidate.eventType === 'string' &&
    candidate.eventType.startsWith('booking.') &&
    typeof candidate.aggregateId === 'string' &&
    typeof candidate.aggregateVersion === 'number' &&
    candidate.data !== undefined
  );
}

function projectionRetryLimit() {
  const value = Number(process.env.BOOKING_PROJECTION_MAX_RETRIES ?? 5);
  return Number.isInteger(value) && value > 0 ? value : 5;
}

function projectionRetryDelay(attempt: number) {
  return Math.min(30_000, 500 * 2 ** Math.min(attempt - 1, 6));
}

function bookingProjectionRoutingKeys() {
  return [
    'booking.event.booking.created',
    'booking.event.booking.requested',
    'booking.event.booking.snapshot',
    'booking.event.booking.payment-processing',
    'booking.event.booking.payment-tokenized',
    'booking.event.booking.status-changed',
    'booking.event.booking.confirmed',
    'booking.event.booking.cancelled',
    'booking.event.booking.expired',
  ];
}

function bookingEventRoutingKey(eventType: string) {
  return `booking.event.${eventType}`;
}
