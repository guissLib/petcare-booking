import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Optional,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppService } from './app.service';
import { Public } from './presentation/http/auth/public.decorator';
import { readModelEnabled } from './infrastructure/persistence/booking-read-persistence.module';
import { BookingReadProjectorService } from './infrastructure/persistence/projectors/booking-read-projector.service';
import { BookingEventOutboxOrmEntity } from './infrastructure/persistence/entities/booking-event-outbox.orm-entity';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @Optional()
    @InjectDataSource()
    private readonly writeDataSource?: DataSource,
    @Optional() private readonly projector?: BookingReadProjectorService,
  ) {}

  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('internal/read-model/metrics')
  @Public()
  async getReadModelMetrics(
    @Headers('x-booking-internal-secret') secret: string | undefined,
  ) {
    const expected =
      process.env.BOOKING_INTERNAL_SECRET ??
      (process.env.NODE_ENV === 'production' ? '' : 'booking-local-internal');
    if (!expected || secret !== expected) {
      throw new ForbiddenException('Credenciales internas inválidas');
    }
    const pendingOutbox = this.writeDataSource
      ? await this.writeDataSource
          .getRepository(BookingEventOutboxOrmEntity)
          .count({ where: { status: 'pending' } })
          .catch(() => undefined)
      : undefined;
    return {
      enabled: readModelEnabled(),
      readsEnabled: ['true', '1', 'yes'].includes(
        (process.env.BOOKING_READ_MODEL_READS_ENABLED ?? '').toLowerCase(),
      ),
      pendingOutbox,
      projector: this.projector?.getMetrics() ?? {
        processedEvents: 0,
        projectionErrors: 0,
        lagMs: undefined,
      },
    };
  }
}
