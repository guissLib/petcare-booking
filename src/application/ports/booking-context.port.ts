import type {
  CreateBookingInput,
  QuoteInput,
} from '../bookings.application.service';

export const BOOKING_CONTEXT = Symbol('BOOKING_CONTEXT');
export const BOOKING_CONTEXT_CATALOG = Symbol('BOOKING_CONTEXT_CATALOG');

export interface BookingContextUser {
  id: string;
  city?: string;
}

export interface BookingContextPet {
  id: string;
  ownerId: string;
  name?: string;
  species?: 'dog' | 'cat' | 'bird' | 'other';
  breed?: string;
  weightKg?: number;
  vaccinationRecords: {
    id: string;
    vaccine: string;
    administeredAt: string;
    expiresAt?: string;
    documentMimeType?: string;
  }[];
}

export interface BookingContextProvider {
  id: string;
  name?: string;
  type?: 'employee' | 'contractor' | 'franchise';
  city: string;
  address?: string;
  latitude?: number;
  longitude?: number;
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

export interface BookingContextActor {
  id: string;
  role: 'pet-owner' | 'provider' | 'administrator';
  providerId?: string;
  city?: string;
}

export interface BookingContextCatalogPort {
  listPets(
    actor: BookingContextActor,
    ownerId?: string,
  ): Promise<BookingContextPet[]>;
  listProviders(actor: BookingContextActor): Promise<BookingContextProvider[]>;
  listPromotions(
    actor: BookingContextActor,
  ): Promise<BookingContextPromotion[]>;
}
