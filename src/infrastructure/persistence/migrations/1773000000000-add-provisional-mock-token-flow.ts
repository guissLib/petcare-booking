import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class AddProvisionalMockTokenFlow1773000000000 implements MigrationInterface {
  name = 'AddProvisionalMockTokenFlow1773000000000';

  async up(queryRunner: QueryRunner) {
    const bookings = await queryRunner.getTable('bookings');
    if (!bookings?.findColumnByName('mock_payment_token')) {
      await queryRunner.addColumn(
        'bookings',
        new TableColumn({
          name: 'mock_payment_token',
          type: 'varchar',
          length: '100',
          isNullable: true,
        }),
      );
    }
    const refreshed = await queryRunner.getTable('bookings');
    if (
      !refreshed?.indices.some(
        (index) => index.name === 'UQ_booking_mock_payment_token',
      )
    ) {
      await queryRunner.createIndex(
        'bookings',
        new TableIndex({
          name: 'UQ_booking_mock_payment_token',
          columnNames: ['mock_payment_token'],
          isUnique: true,
        }),
      );
    }

    await queryRunner.query(
      'ALTER TABLE bookings DROP CHECK CHK_booking_status',
    );
    await queryRunner.query(`
      ALTER TABLE bookings
      ADD CONSTRAINT CHK_booking_status
      CHECK (status IN (
        'provisional',
        'awaiting-payment-token',
        'payment-processing',
        'pending',
        'pending-confirmation',
        'confirmed',
        'rejected',
        'in-progress',
        'completed',
        'cancelled'
      ))
    `);
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.query(
      'ALTER TABLE bookings DROP CHECK CHK_booking_status',
    );
    await queryRunner.query(`
      ALTER TABLE bookings
      ADD CONSTRAINT CHK_booking_status
      CHECK (status IN ('pending', 'pending-confirmation', 'confirmed', 'rejected', 'in-progress', 'completed', 'cancelled'))
    `);
    const bookings = await queryRunner.getTable('bookings');
    const tokenIndex = bookings?.indices.find(
      (index) => index.name === 'UQ_booking_mock_payment_token',
    );
    if (tokenIndex) {
      await queryRunner.dropIndex('bookings', tokenIndex);
    }
    if (bookings?.findColumnByName('mock_payment_token')) {
      await queryRunner.dropColumn('bookings', 'mock_payment_token');
    }
  }
}
