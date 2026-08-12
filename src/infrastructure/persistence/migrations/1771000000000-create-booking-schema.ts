import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateBookingSchema1771000000000 implements MigrationInterface {
  name = 'CreateBookingSchema1771000000000';

  async up(queryRunner: QueryRunner) {
    await queryRunner.createTable(
      new Table({
        name: 'bookings',
        columns: [
          { name: 'id', type: 'varchar', length: '64', isPrimary: true },
          { name: 'user_id', type: 'varchar', length: '64' },
          { name: 'pet_id', type: 'varchar', length: '64' },
          { name: 'provider_id', type: 'varchar', length: '64' },
          { name: 'service_type', type: 'varchar', length: '32' },
          { name: 'visit_mode', type: 'varchar', length: '32' },
          { name: 'scheduled_at', type: 'datetime', precision: 3 },
          { name: 'address', type: 'varchar', length: '500', isNullable: true },
          {
            name: 'latitude',
            type: 'decimal',
            precision: 10,
            scale: 7,
            isNullable: true,
          },
          {
            name: 'longitude',
            type: 'decimal',
            precision: 10,
            scale: 7,
            isNullable: true,
          },
          {
            name: 'address_reference',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          { name: 'notes', type: 'varchar', length: '1000', isNullable: true },
          { name: 'status', type: 'varchar', length: '32' },
          { name: 'original_total', type: 'int', unsigned: true },
          { name: 'total', type: 'int', unsigned: true },
          {
            name: 'discount_amount',
            type: 'int',
            unsigned: true,
            default: 0,
          },
          { name: 'currency', type: 'varchar', length: '3', default: "'COP'" },
          { name: 'payment_method', type: 'varchar', length: '20' },
          {
            name: 'payment_id',
            type: 'varchar',
            length: '64',
            isUnique: true,
          },
          { name: 'payment_status', type: 'varchar', length: '20' },
          {
            name: 'payment_reference',
            type: 'varchar',
            length: '120',
            isNullable: true,
          },
          {
            name: 'payment_expires_at',
            type: 'datetime',
            precision: 3,
            isNullable: true,
          },
          {
            name: 'idempotency_key',
            type: 'varchar',
            length: '120',
            isNullable: true,
          },
          {
            name: 'promotion_id',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          {
            name: 'rejection_reason',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'datetime',
            precision: 3,
            default: 'CURRENT_TIMESTAMP(3)',
          },
          {
            name: 'updated_at',
            type: 'datetime',
            precision: 3,
            default: 'CURRENT_TIMESTAMP(3)',
            onUpdate: 'CURRENT_TIMESTAMP(3)',
          },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'bookings',
      new TableIndex({
        name: 'IDX_booking_user_created_at',
        columnNames: ['user_id', 'created_at'],
      }),
    );
    await queryRunner.createIndex(
      'bookings',
      new TableIndex({
        name: 'IDX_booking_provider_scheduled_at',
        columnNames: ['provider_id', 'scheduled_at'],
      }),
    );
    await queryRunner.createIndex(
      'bookings',
      new TableIndex({
        name: 'IDX_booking_status',
        columnNames: ['status'],
      }),
    );
    await queryRunner.createIndex(
      'bookings',
      new TableIndex({
        name: 'UQ_booking_user_idempotency',
        columnNames: ['user_id', 'idempotency_key'],
        isUnique: true,
      }),
    );
    await queryRunner.query(`
      ALTER TABLE bookings
      ADD CONSTRAINT CHK_booking_status
      CHECK (status IN ('pending', 'pending-confirmation', 'confirmed', 'rejected', 'in-progress', 'completed', 'cancelled'))
    `);
    await queryRunner.query(`
      ALTER TABLE bookings
      ADD CONSTRAINT CHK_booking_payment_status
      CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded'))
    `);
    await queryRunner.query(`
      ALTER TABLE bookings
      ADD CONSTRAINT CHK_booking_amounts
      CHECK (original_total > 0 AND total > 0 AND discount_amount >= 0 AND original_total - discount_amount = total)
    `);
    await queryRunner.query(`
      ALTER TABLE bookings
      ADD CONSTRAINT CHK_booking_home_visit_location
      CHECK (
        visit_mode <> 'home-visit'
        OR (
          address IS NOT NULL AND address_reference IS NOT NULL
          AND latitude BETWEEN -23 AND -9
          AND longitude BETWEEN -70 AND -57
        )
      )
    `);
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.dropTable('bookings', true);
  }
}
