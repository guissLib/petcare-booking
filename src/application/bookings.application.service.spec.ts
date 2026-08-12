import type { BookingEvent } from './contracts/booking-event.contract';
import { BookingsApplicationService } from './bookings.application.service';
import type { Booking } from '../domain/booking.entity';

describe('BookingsApplicationService provisional flow', () => {
  it('creates local IDs and one durable booking.requested without synchronous integrations', async () => {
    const fixture = setup();

    const created = await fixture.service.create('user_1', onlineInput());

    expect(created.status).toBe('awaiting-payment-token');
    expect(created.paymentId).toMatch(/^payment_/);
    expect(created.id).toMatch(/^booking_/);
    expect(fixture.context.get).toHaveBeenCalledTimes(1);
    expect(fixture.events).toHaveLength(1);
    expect(fixture.events[0]).toMatchObject({
      eventType: 'booking.requested',
      integrationMessage: {
        eventName: 'booking.requested',
        bookingId: created.id,
        paymentId: created.paymentId,
        userId: 'user_1',
        providerId: 'provider_1',
        amount: 30000,
        currency: 'COP',
        paymentMethod: 'online',
      },
    });
  });

  it('creates at-location bookings as provisional and reserves capacity', async () => {
    const fixture = setup({ capacity: 1 });
    const first = await fixture.service.create('user_1', {
      ...onlineInput(),
      paymentMethod: 'at-location',
    });

    expect(first.status).toBe('provisional');
    fixture.repository.findForAvailability.mockResolvedValue([
      fixture.stored as Booking,
    ]);

    await expect(
      fixture.service.create('user_1', {
        ...onlineInput(),
        idempotencyKey: 'second',
      }),
    ).rejects.toThrow('No hay disponibilidad');
  });

  it('hides all pre-confirmation statuses from providers', async () => {
    const fixture = setup();
    await fixture.service.create('user_1', onlineInput());
    fixture.repository.findAll.mockResolvedValue([fixture.stored as Booking]);

    await expect(
      fixture.service.get(fixture.stored!.id, {
        id: 'provider-user',
        role: 'provider',
        providerId: 'provider_1',
      }),
    ).rejects.toThrow('aún no está disponible');
    await expect(
      fixture.service.list({
        id: 'provider-user',
        role: 'provider',
        providerId: 'provider_1',
      }),
    ).resolves.toEqual([]);
  });

  it('tokenizes once, emits no duplicate, and never serializes raw card data', async () => {
    const fixture = setup();
    const created = await fixture.service.create('user_1', onlineInput());
    const card = {
      cardholderName: 'Ana Pérez',
      cardNumber: '4242424242424242',
      expiryMonth: 12,
      expiryYear: 2030,
      cvv: '123',
    };

    const first = await fixture.service.pay(created.id, card, owner());
    const repeated = await fixture.service.pay(created.id, card, owner());

    expect(first.booking.status).toBe('payment-processing');
    expect(first.payment.mockPaymentToken).toMatch(/^mock_tok_/);
    expect(repeated.payment.mockPaymentToken).toBe(
      first.payment.mockPaymentToken,
    );
    expect(fixture.events).toHaveLength(2);
    expect(fixture.events[1].integrationMessage).toEqual(
      expect.objectContaining({
        eventName: 'payment.tokenized',
        bookingId: created.id,
        paymentId: created.paymentId,
        userId: 'user_1',
        providerId: 'provider_1',
        mockPaymentToken: first.payment.mockPaymentToken,
      }),
    );
    const serialized = JSON.stringify({
      booking: fixture.stored?.toPrimitives(),
      outbox: fixture.events,
      message: fixture.events[1].integrationMessage,
    });
    for (const secret of [
      card.cardholderName,
      card.cardNumber,
      card.cvv,
      'expiryMonth',
      'expiryYear',
    ]) {
      expect(serialized).not.toContain(String(secret));
    }
    expect(fixture.events[1].data).not.toHaveProperty('mockPaymentToken');
  });

  it('encodes a decline without retaining the declined card', async () => {
    const fixture = setup();
    const created = await fixture.service.create('user_1', onlineInput());

    const result = await fixture.service.pay(
      created.id,
      {
        cardholderName: 'Declined Test',
        cardNumber: '4000000000000002',
        expiryMonth: 12,
        expiryYear: 2030,
        cvv: '123',
      },
      owner(),
    );

    expect(result.payment.mockPaymentToken).toMatch(
      /^mock_tok_declined_[A-Za-z0-9_-]+$/,
    );
    expect(JSON.stringify(fixture.events)).not.toContain('4000000000000002');
  });

  it('marks payment paid before confirming while preserving command checks', async () => {
    const fixture = setup();
    const created = await fixture.service.create('user_1', onlineInput());
    await fixture.service.pay(
      created.id,
      {
        cardholderName: 'Ana Pérez',
        cardNumber: '4242424242424242',
        expiryMonth: 12,
        expiryYear: 2030,
        cvv: '123',
      },
      owner(),
    );

    await expect(
      fixture.service.confirmFromPaymentCommand({
        eventId: 'wrong',
        eventName: 'booking.confirm',
        occurredAt: new Date().toISOString(),
        bookingId: created.id,
        paymentId: created.paymentId,
        amount: 1,
      }),
    ).rejects.toThrow('no coincide');

    const confirmed = await fixture.service.confirmFromPaymentCommand({
      eventId: 'confirm_1',
      eventName: 'booking.confirm',
      occurredAt: new Date().toISOString(),
      bookingId: created.id,
      paymentId: created.paymentId,
      amount: 30000,
    });

    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.paymentStatus).toBe('paid');
    expect(fixture.events.at(-1)?.eventType).toBe('booking.confirmed');
  });
});

function setup(options: { capacity?: number } = {}) {
  const events: BookingEvent[] = [];
  const state: { stored?: Booking } = {};
  const repository = {
    findByIdempotencyKey: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn(() => Promise.resolve(state.stored)),
    save: jest.fn((booking: Booking, event?: BookingEvent) => {
      state.stored = booking;
      if (event) events.push(event);
      return Promise.resolve(booking);
    }),
    findAll: jest.fn().mockResolvedValue([]),
    findForAvailability: jest.fn().mockResolvedValue([]),
    expirePending: jest.fn().mockResolvedValue([]),
  };
  const context = {
    get: jest.fn().mockResolvedValue({
      user: { id: 'user_1', city: 'La Paz' },
      pet: { id: 'pet_1', ownerId: 'user_1', vaccinationRecords: [] },
      provider: {
        id: 'provider_1',
        city: 'La Paz',
        capacity: options.capacity ?? 10,
        acceptsHomeVisits: false,
        services: ['walking'],
        schedule: [{ dayOfWeek: 2, start: '08:00', end: '18:00' }],
      },
      promotions: [],
    }),
  };
  return {
    events,
    repository,
    context,
    service: new BookingsApplicationService(repository, context),
    get stored() {
      return state.stored;
    },
  };
}

function onlineInput() {
  return {
    petId: 'pet_1',
    providerId: 'provider_1',
    serviceType: 'walking' as const,
    visitMode: 'at-location' as const,
    scheduledAt: '2026-09-15T10:00:00.000Z',
    paymentMethod: 'online' as const,
    idempotencyKey: 'checkout_1',
  };
}

function owner() {
  return { id: 'user_1', role: 'pet-owner' as const };
}
