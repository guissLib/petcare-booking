import { DataSource } from 'typeorm';
import { bookingDatabaseOptions } from './typeorm.config';

export const AppDataSource = new DataSource(bookingDatabaseOptions());
