import { RabbitMqMessageBus } from './rabbitmq-message-bus.service';

describe('RabbitMqMessageBus', () => {
  it('throws on generic publish while disconnected', async () => {
    const bus = new RabbitMqMessageBus();

    await expect(
      bus.publish({
        eventId: 'event_1',
        eventName: 'booking.requested',
        occurredAt: new Date().toISOString(),
        bookingId: 'booking_1',
      }),
    ).rejects.toThrow('RabbitMQ no disponible');
  });
});
