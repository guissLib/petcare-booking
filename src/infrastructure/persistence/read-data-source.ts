import { DataSource } from 'typeorm';
import { bookingReadDatabaseOptions } from './typeorm.config';

export const BookingReadDataSource = new DataSource(
  bookingReadDatabaseOptions(),
);
