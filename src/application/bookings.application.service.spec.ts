import { BookingsApplicationService } from './bookings.application.service';
import type { Booking } from '../domain/booking.entity';

describe('BookingsApplicationService', () => {
  it('creates an online booking pending and confirms it from the Saga command', async () => {
    let stored: Booking | undefined;
    const saveMock = jest.fn((booking: Booking) => {
      stored = booking;
      return booking;
    });
    const repository = {
      findByIdempotencyKey: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(() => stored),
      save: saveMock,
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
          capacity: 10,
          acceptsHomeVisits: false,
          services: ['walking'],
          schedule: [{ dayOfWeek: 2, start: '08:00', end: '18:00' }],
        },
        promotions: [],
      }),
    };
    const payment = {
      createIntent: jest.fn().mockResolvedValue({
        id: 'payment_1',
        method: 'online',
        status: 'pending',
        amount: 30000,
        currency: 'COP',
        provider: 'mock',
        reference: 'PENDING-payment_1',
        createdAt: '2026-09-15T10:00:00.000Z',
      }),
      charge: jest.fn(),
      publishConfirmed: jest.fn(),
      confirmAtLocation: jest.fn(),
      cancelPending: jest.fn(),
    };
    const service = new BookingsApplicationService(
      repository as never,
      context,
      payment,
    );

    const created = await service.create('user_1', {
      petId: 'pet_1',
      providerId: 'provider_1',
      serviceType: 'walking',
      visitMode: 'at-location',
      scheduledAt: '2026-09-15T10:00:00.000Z',
      paymentMethod: 'online',
      idempotencyKey: 'checkout_1',
    });

    expect(created.status).toBe('pending');
    expect(created.payment.status).toBe('pending');
    payment.charge.mockResolvedValue({
      id: 'payment_1',
      method: 'online',
      status: 'paid',
      amount: 30000,
      currency: 'COP',
      provider: 'mock',
      reference: 'MOCK-PAID',
      createdAt: '2026-09-15T10:00:00.000Z',
    });
    const paid = await service.pay(
      created.id,
      {
        cardholderName: 'Ana Pérez',
        cardNumber: '4242424242424242',
        expiryMonth: 12,
        expiryYear: 2030,
        cvv: '123',
      },
      { id: 'user_1', role: 'pet-owner' },
    );

    expect(paid.booking.status).toBe('pending-confirmation');
    expect(payment.publishConfirmed).toHaveBeenCalledWith({
      bookingId: created.id,
      userId: 'user_1',
      providerId: 'provider_1',
      paymentId: 'payment_1',
      amount: 30000,
    });
    await service.confirmFromPaymentCommand({
      eventId: 'event_1',
      eventName: 'booking.confirm',
      occurredAt: '2026-09-15T10:01:00.000Z',
      sagaId: 'saga_1',
      bookingId: created.id,
      paymentId: 'payment_1',
      amount: 30000,
      currency: 'COP',
    });

    expect(stored?.status).toBe('confirmed');
    expect(saveMock).toHaveBeenCalledTimes(3);
    expect(saveMock.mock.invocationCallOrder[1]).toBeLessThan(
      payment.publishConfirmed.mock.invocationCallOrder[0],
    );
  });

  it('calculates the quote from trusted context instead of client amounts', async () => {
    const repository = {
      findForAvailability: jest.fn().mockResolvedValue([]),
    };
    const context = {
      get: jest.fn().mockResolvedValue({
        user: { id: 'user_1', city: 'La Paz' },
        pet: {
          id: 'pet_1',
          ownerId: 'user_1',
          vaccinationRecords: [
            {
              id: 'vax_1',
              administeredAt: '2026-01-01T00:00:00.000Z',
              expiresAt: '2027-01-01T00:00:00.000Z',
              documentMimeType: 'application/pdf',
            },
          ],
        },
        provider: {
          id: 'provider_1',
          city: 'La Paz',
          capacity: 10,
          acceptsHomeVisits: false,
          services: ['grooming'],
          schedule: [{ dayOfWeek: 2, start: '08:00', end: '18:00' }],
        },
        promotions: [
          {
            id: 'promo_1',
            name: 'Oferta local',
            description: 'Descuento',
            discountType: 'fixed',
            discountValue: 5000,
            scope: 'local',
            city: 'La Paz',
            providerId: 'provider_1',
            startsAt: '2026-01-01',
            endsAt: '2027-01-01',
            active: true,
          },
        ],
      }),
    };
    const service = new BookingsApplicationService(
      repository as never,
      context,
      {} as never,
    );

    const quote = await service.quote('user_1', {
      petId: 'pet_1',
      providerId: 'provider_1',
      serviceType: 'grooming',
      visitMode: 'at-location',
      scheduledAt: '2026-09-15T10:00:00.000Z',
    });

    expect(quote).toMatchObject({
      originalTotal: 50000,
      discountAmount: 5000,
      total: 45000,
      promotionId: 'promo_1',
      vaccinationRequired: true,
      vaccinationValid: true,
    });
  });
});
