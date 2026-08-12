import { Booking } from './booking.entity';

describe('Booking aggregate', () => {
  it('keeps online bookings pending until the payment saga confirms them', () => {
    const booking = Booking.create({
      id: 'booking_1',
      userId: 'user_1',
      petId: 'pet_1',
      providerId: 'provider_1',
      serviceType: 'walking',
      visitMode: 'at-location',
      scheduledAt: '2026-09-15T10:00:00.000Z',
      total: 30000,
      originalTotal: 30000,
      discountAmount: 0,
      paymentMethod: 'online',
      paymentId: 'payment_1',
      createdAt: '2026-08-01T00:00:00.000Z',
    });

    expect(booking.status).toBe('pending');
    booking.markPaymentProcessing('mock_1');
    expect(booking.toPrimitives().status).toBe('pending-confirmation');

    booking.confirmFromPayment('payment_1', 30000);

    expect(booking.toPrimitives()).toMatchObject({
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentReference: 'mock_1',
    });
  });

  it('allows the Saga to compensate a booking before confirmation', () => {
    const booking = Booking.create({
      id: 'booking_2',
      userId: 'user_1',
      petId: 'pet_1',
      providerId: 'provider_1',
      serviceType: 'walking',
      visitMode: 'at-location',
      scheduledAt: '2026-09-15T10:00:00.000Z',
      total: 30000,
      originalTotal: 30000,
      discountAmount: 0,
      paymentMethod: 'online',
      paymentId: 'payment_2',
      createdAt: '2026-08-01T00:00:00.000Z',
    });

    booking.cancel('Payment compensado');

    expect(booking.toPrimitives()).toMatchObject({
      status: 'cancelled',
      rejectionReason: 'Payment compensado',
    });
  });
});
