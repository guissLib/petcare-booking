import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  BOOKING_CONTEXT_CATALOG,
  type BookingContextCatalogPort,
} from '../../application/ports/booking-context.port';
import {
  actorFromRequest,
  type AuthenticatedRequest,
} from './auth/jwt-auth.guard';

@ApiTags('Booking context')
@ApiBearerAuth()
@Controller('booking-context')
export class BookingContextController {
  constructor(
    @Inject(BOOKING_CONTEXT_CATALOG)
    private readonly catalog: BookingContextCatalogPort,
  ) {}

  @Get('pets')
  @ApiOperation({ summary: 'Lista mascotas desde el contexto local' })
  @ApiQuery({ name: 'ownerId', required: false })
  pets(
    @Req() request: AuthenticatedRequest,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.catalog.listPets(actorFromRequest(request), ownerId);
  }

  @Get('providers')
  @ApiOperation({ summary: 'Lista proveedores desde el contexto local' })
  providers(@Req() request: AuthenticatedRequest) {
    return this.catalog.listProviders(actorFromRequest(request));
  }

  @Get('promotions')
  @ApiOperation({ summary: 'Lista promociones activas aplicables al actor' })
  promotions(@Req() request: AuthenticatedRequest) {
    return this.catalog.listPromotions(actorFromRequest(request));
  }
}
