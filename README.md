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
- Mantener la base normalizada como modelo de escritura autoritativo.
- Publicar cambios mediante `booking_event_outbox` y RabbitMQ.
- Proyectar `booking_overview` a un segundo MySQL documental cuando el read
  model esté habilitado.
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

## CQRS incremental

El command side usa la base `BOOKING_MYSQL_*`, transacciones y versionado
optimista (`aggregate_version`). Los handlers de comandos nunca dependen del
read model: disponibilidad, cotización, pago, ownership y transiciones se
validan contra la base normalizada.

Para habilitar el read side de forma controlada:

```bash
BOOKING_READ_MODEL_ENABLED=true
BOOKING_READ_MODEL_READS_ENABLED=false
npm run migration:read:run
npm run read:backfill
BOOKING_READ_MODEL_READS_ENABLED=true
```

`BOOKING_READ_MYSQL_*` debe apuntar a una base/esquema separado y a un usuario
con permisos de proyección; `BOOKING_READ_QUERY_MYSQL_*` puede usar un usuario
solo lectura para las consultas HTTP. Mientras `BOOKING_READ_MODEL_READS_ENABLED` sea falso,
`GET /bookings` y `GET /bookings/:id` usan automáticamente la base de escritura.
Si una consulta proyectada no está disponible, también existe fallback temporal
al repositorio normalizado. Los comandos continúan usando siempre el write
model incluso después del cutover.

El documento JSON `booking_overview` contiene estados, importes, fechas, IDs y
resúmenes de pago. Nunca se proyectan número de tarjeta, CVV, hashes de
contraseña, BLOB de vacunación, claves de idempotencia ni la dirección privada
de una reserva.

El endpoint interno `GET /internal/read-model/metrics` devuelve eventos
procesados y lag de proyección; requiere `x-booking-internal-secret`.

## Pruebas

```bash
npm run lint
npm test
npm run build
```
