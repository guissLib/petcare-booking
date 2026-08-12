# Booking Service

Microservicio responsable del agregado `Booking` y de su base de datos MySQL
independiente. Expone una API interna bajo `/api`; el único punto público para
el frontend es `api-gateway`.

## Puesta en marcha

1. Copiar `.env.example` a `.env`.
2. Crear la base indicada en `BOOKING_MYSQL_DATABASE`.
3. Configurar el mismo `API_GATEWAY_SECRET` usado por `api-gateway` y
   `petcare-backend`.
4. Ejecutar `npm run migration:run`.
5. Iniciar con `npm run start:dev`.

El servicio se ejecuta por defecto en `http://localhost:3011/api`. Su
documentación interna está en `http://localhost:3011/api-docs`; para el
frontend se usa `http://localhost:3000/api`.

## Responsabilidades

- Cotizar y crear reservas.
- Consultar reservas, estados, recordatorios y checkout mock.
- Persistir Booking en su base MySQL privada.
- Consumir comandos `booking.confirm` y `booking.cancel`.
- Validar contexto mediante `PETCARE_BACKEND_URL`.
- Solicitar y procesar Payment mediante contratos internos protegidos por
  `PETCARE_SERVICE_SECRET`.

El navegador nunca recibe secretos de servicio. El gateway valida el JWT del
cliente y envía claims internos protegidos con `API_GATEWAY_SECRET`; Booking no
acepta JWT directo desde clientes.

## Endpoints

- `POST /users/:userId/bookings/quote`
- `POST /users/:userId/bookings`
- `GET /bookings` y `GET /bookings/:bookingId`
- `POST /bookings/:bookingId/payments/mock`
- `PATCH /bookings/:bookingId/status`
- `POST /bookings/:bookingId/reminder`

Las confirmaciones de pago son asíncronas: después de persistir el estado local,
Payment publica `payment.confirmed`, el orquestador envía `booking.confirm` y
este servicio confirma la reserva de forma idempotente.

## Pruebas

```bash
npm run lint
npm test
npm run build
```
