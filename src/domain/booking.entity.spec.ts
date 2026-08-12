import { Booking } from './booking.entity';

describe('Booking provisional lifecycle', () => {
  it('expires only abandoned online requests and protects payment transitions', () => {
    const booking = bookingWith({
      paymentMethod: 'online',
      paymentExpiresAt: '2026-08-12T10:00:00.000Z',
    });

    expect(booking.status).toBe('awaiting-payment-token');
    expect(booking.isPaymentExpired(new Date('2026-08-12T10:01:00.000Z'))).toBe(
      true,
    );
    expect(() => booking.changeStatus('payment-processing')).toThrow(
      'No se puede cambiar',
    );
    booking.tokenizePayment('mock_tok_once_1');
    expect(booking.isPaymentExpired(new Date('2026-08-12T10:01:00.000Z'))).toBe(
      false,
    );
  });

  it('keeps at-location bookings provisional until Payment confirms', () => {
    const booking = bookingWith({ paymentMethod: 'at-location' });

    expect(booking.status).toBe('provisional');
    expect(booking.toPrimitives().paymentStatus).toBe('pending');
    booking.confirmFromPayment('payment_1', 30000);
    expect(booking.status).toBe('confirmed');
    expect(booking.toPrimitives().paymentStatus).toBe('paid');
  });
});

function bookingWith(input: {
  paymentMethod: 'online' | 'at-location';
  paymentExpiresAt?: string;
}) {
  return Booking.create({
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
    paymentMethod: input.paymentMethod,
    paymentId: 'payment_1',
    paymentExpiresAt: input.paymentExpiresAt,
    createdAt: '2026-08-12T09:00:00.000Z',
  });
}
