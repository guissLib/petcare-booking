import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { ChannelModel, ConfirmChannel, ConsumeMessage } from 'amqplib';
import amqp from 'amqplib';
import {
  BOOKING_CONTEXT_ROUTING_KEYS,
  parseBookingContextEvent,
} from '../../application/contracts/booking-context-event.contract';
import { BookingContextRepository } from '../persistence/repositories/booking-context.repository';

@Injectable()
export class BookingContextConsumerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(BookingContextConsumerService.name);
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(private readonly repository: BookingContextRepository) {}

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
  }

  private async connect() {
    const url = process.env.RABBITMQ_URL ?? process.env.CLOUDAMQP_URL;
    if (!url || this.channel) {
      return;
    }
    try {
      const connection = await amqp.connect(url);
      const channel = await connection.createConfirmChannel();
      connection.on('close', () => {
        this.connection = undefined;
        this.channel = undefined;
      });
      connection.on('error', (error: Error) => {
        this.logger.error(
          `RabbitMQ context connection error: ${error.message}`,
        );
      });
      this.connection = connection;
      this.channel = channel;
      await this.configure(channel);
      this.logger.log('Booking context RabbitMQ consumer connected');
    } catch (error) {
      this.connection = undefined;
      this.channel = undefined;
      this.logger.warn(
        `Booking context RabbitMQ unavailable: ${errorMessage(error)}`,
      );
    }
  }

  private async configure(channel: ConfirmChannel) {
    const exchange =
      process.env.RABBITMQ_EXCHANGE ??
      process.env.AMQP_EXCHANGE ??
      'petcare.events';
    const deadExchange =
      process.env.RABBITMQ_DEAD_LETTER_EXCHANGE ?? `${exchange}.dead`;
    const queue =
      process.env.RABBITMQ_BOOKING_CONTEXT_QUEUE ??
      'booking-service.context-projection';
    const deadQueue =
      process.env.RABBITMQ_BOOKING_CONTEXT_DLQ ??
      'booking-service.context-projection.dlq';
    await channel.assertExchange(exchange, 'topic', { durable: true });
    await channel.assertExchange(deadExchange, 'topic', { durable: true });
    await channel.assertQueue(deadQueue, { durable: true });
    await channel.bindQueue(deadQueue, deadExchange, '#');
    await channel.assertQueue(queue, {
      durable: true,
      deadLetterExchange: deadExchange,
    });
    for (const routingKey of BOOKING_CONTEXT_ROUTING_KEYS) {
      await channel.bindQueue(queue, exchange, routingKey);
    }
    await channel.prefetch(1);
    await channel.consume(queue, (message) => void this.handle(message));
  }

  private async handle(raw: ConsumeMessage | null) {
    if (!raw) {
      return;
    }
    try {
      const event = parseBookingContextEvent(
        JSON.parse(raw.content.toString()) as unknown,
        raw.fields.routingKey,
      );
      const result = await this.repository.project(event);
      this.channel?.ack(raw);
      this.logger.log(
        `Context event ${result} type=${event.eventType} id=${event.eventId}`,
      );
    } catch (error) {
      this.logger.error(`Context event rejected: ${errorMessage(error)}`);
      this.channel?.nack(raw, false, false);
    }
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
