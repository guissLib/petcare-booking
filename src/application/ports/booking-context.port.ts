import type {
  CreateBookingInput,
  QuoteInput,
} from '../bookings.application.service';

export const BOOKING_CONTEXT = Symbol('BOOKING_CONTEXT');

export interface BookingContextUser {
  id: string;
  city?: string;
}

export interface BookingContextPet {
  id: string;
  ownerId: string;
  vaccinationRecords: {
    id: string;
    vaccine: string;
    administeredAt: string;
    expiresAt?: string;
  }[];
}

export interface BookingContextProvider {
  id: string;
  city: string;
  capacity: number;
  acceptsHomeVisits: boolean;
  services: string[];
  schedule: { dayOfWeek: number; start: string; end: string }[];
}

export interface BookingContextPromotion {
  id: string;
  name: string;
  description: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  scope: 'national' | 'local';
  city?: string;
  providerId?: string;
  serviceTypes?: string[];
  startsAt: string;
  endsAt: string;
  active: boolean;
}

export interface BookingContext {
  user: BookingContextUser;
  pet: BookingContextPet;
  provider: BookingContextProvider;
  promotions: BookingContextPromotion[];
}

export interface BookingContextPort {
  get(
    userId: string,
    input: QuoteInput | CreateBookingInput,
  ): Promise<BookingContext>;
}
