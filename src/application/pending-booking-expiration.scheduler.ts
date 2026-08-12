import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ExpirePendingBookingsCommand } from './commands/booking.commands';
import type { Booking } from '../domain/booking.entity';

@Injectable()
export class PendingBookingExpirationScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PendingBookingExpirationScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly commands: CommandBus) {}

  onModuleInit() {
    const interval = Number(process.env.BOOKING_EXPIRATION_POLL_MS ?? 60_000);
    this.timer = setInterval(
      () => {
        void this.expire();
      },
      Number.isFinite(interval) && interval > 0 ? interval : 60_000,
    );
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async expire() {
    try {
      const expired = await this.commands.execute<Booking[]>(
        new ExpirePendingBookingsCommand(new Date()),
      );
      if (expired.length > 0) {
        this.logger.log(
          `Reservas expiradas por falta de pago: ${expired.length}`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'error desconocido';
      this.logger.error(`No se pudieron expirar reservas: ${message}`);
    }
  }
}
