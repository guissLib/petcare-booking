import type { DataSource } from 'typeorm';
import {
  parseBookingContextEvent,
  type BookingContextEvent,
} from '../../../application/contracts/booking-context-event.contract';
import { BookingContextInboxOrmEntity } from '../entities/booking-context-inbox.orm-entity';
import { projectBookingContextEvent } from './booking-context.repository';

describe('booking context projection', () => {
  it('validates the complete envelope and routing key', () => {
    expect(parseBookingContextEvent(event(), 'context.pet.upserted')).toEqual(
      event(),
    );
    expect(() =>
      parseBookingContextEvent(event(), 'context.user.upserted'),
    ).toThrow('Invalid booking context event envelope');
  });

  it('projects a newer snapshot and records its inbox entry', async () => {
    const harness = projectionHarness(2);
    await expect(
      projectBookingContextEvent(harness.dataSource, event(3)),
    ).resolves.toBe('projected');
    expect(harness.insertInbox).toHaveBeenCalledTimes(1);
    expect(harness.saveSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        contextType: 'pet',
        aggregateId: 'pet-1',
        aggregateVersion: 3,
        ownerId: 'user-1',
      }),
    );
  });

  it('rejects older aggregate versions without replacing the snapshot', async () => {
    const harness = projectionHarness(4);
    await expect(
      projectBookingContextEvent(harness.dataSource, event(3)),
    ).resolves.toBe('stale');
    expect(harness.insertInbox).toHaveBeenCalledTimes(1);
    expect(harness.saveSnapshot).not.toHaveBeenCalled();
  });

  it('is idempotent by source service and event id', async () => {
    const harness = projectionHarness(undefined, true);
    await expect(
      projectBookingContextEvent(harness.dataSource, event()),
    ).resolves.toBe('duplicate');
    expect(harness.insertInbox).not.toHaveBeenCalled();
    expect(harness.saveSnapshot).not.toHaveBeenCalled();
  });
});

function event(version = 3): BookingContextEvent {
  return {
    eventId: 'event-1',
    eventType: 'context.pet.upserted',
    schemaVersion: 1,
    sourceService: 'petcare-backend',
    aggregateType: 'pet',
    aggregateId: 'pet-1',
    aggregateVersion: version,
    occurredAt: '2026-08-12T12:00:00.000Z',
    data: {
      id: 'pet-1',
      ownerId: 'user-1',
      vaccinationRecords: [],
    },
  };
}

function projectionHarness(existingVersion?: number, duplicate = false) {
  const insertInbox = jest.fn();
  const saveSnapshot = jest.fn();
  const inboxRepository = {
    findOneBy: jest.fn().mockResolvedValue(duplicate ? {} : null),
    insert: insertInbox,
  };
  const snapshotRepository = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        existingVersion === undefined
          ? null
          : { aggregateVersion: existingVersion },
      ),
    save: saveSnapshot,
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === BookingContextInboxOrmEntity
        ? inboxRepository
        : snapshotRepository,
    ),
  };
  const dataSource = {
    transaction: jest.fn((work: (value: typeof manager) => Promise<unknown>) =>
      work(manager),
    ),
  } as unknown as DataSource;
  return { dataSource, insertInbox, saveSnapshot };
}
