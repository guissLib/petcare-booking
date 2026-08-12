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
import type { MessageBus } from '../../application/ports/message-bus.port';

@Injectable()
export class RabbitMqMessageBus
  implements MessageBus, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RabbitMqMessageBus.name);
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private reconnectTimer?: NodeJS.Timeout;
  private readonly handlers = new Map<SagaMessageName, SagaMessageHandler>();
  private consumerStarted = false;

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
  }

  async publish(message: SagaMessage) {
    const channel = this.channel;
    if (!channel) {
      this.logger.warn(
        `RabbitMQ no disponible; se descarta ${message.eventName} ${message.eventId}`,
      );
      return;
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
        this.logger.warn('Conexión RabbitMQ cerrada; se reintentará');
      });
      connection.on('error', (error: Error) => {
        this.logger.error(`RabbitMQ error: ${error.message}`);
      });
      this.connection = connection;
      this.channel = channel;
      this.consumerStarted = false;
      await channel.assertExchange(this.exchange(), 'topic', { durable: true });
      await this.registerConsumer();
      this.logger.log('Booking-service conectado a RabbitMQ');
    } catch (error) {
      this.channel = undefined;
      this.connection = undefined;
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
