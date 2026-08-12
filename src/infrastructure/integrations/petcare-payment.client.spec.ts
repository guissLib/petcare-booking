import { PetcarePaymentClient } from './petcare-payment.client';

describe('PetcarePaymentClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends checkout card fields at the root of the internal payload', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'payment_1',
          method: 'online',
          status: 'paid',
          amount: 45000,
          currency: 'COP',
          provider: 'mock',
          reference: 'MOCK-PAID',
          createdAt: '2026-08-10T00:00:00.000Z',
        }),
    } as Response);
    const client = new PetcarePaymentClient();

    await client.charge({
      bookingId: 'booking_1',
      userId: 'user_1',
      providerId: 'provider_1',
      paymentId: 'payment_1',
      amount: 45000,
      card: {
        cardholderName: 'Carla Patricia Arizaca Villegas',
        cardNumber: '1212121212121212',
        expiryMonth: 10,
        expiryYear: 2029,
        cvv: '123',
      },
    });

    const body = JSON.parse(
      fetchMock.mock.calls[0]?.[1]?.body as string,
    ) as Record<string, unknown>;
    expect(body).toMatchObject({
      bookingId: 'booking_1',
      paymentId: 'payment_1',
      cardholderName: 'Carla Patricia Arizaca Villegas',
      cardNumber: '1212121212121212',
      expiryMonth: 10,
      expiryYear: 2029,
      cvv: '123',
    });
    expect(body).not.toHaveProperty('card');
  });
});
