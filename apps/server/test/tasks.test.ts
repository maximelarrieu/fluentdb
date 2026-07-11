import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ScheduledTask, TaskSnapshot } from '@fluentdb/shared';
import { Scheduler } from '../src/services/scheduler.js';
import {
  closeTestApp,
  createAndConnect,
  makeTestApp,
  type TestApp,
} from './helpers.js';

describe('scheduled tasks over sqlite', () => {
  let t: TestApp;
  let connId: string;

  beforeAll(async () => {
    t = await makeTestApp();
    connId = await createAndConnect(t);
  });
  afterAll(async () => {
    await closeTestApp(t);
  });

  async function create(body: Record<string, unknown>) {
    return t.app.inject({ method: 'POST', url: '/api/tasks', payload: body });
  }

  it('creates a read-only task, runs it and stores a snapshot', async () => {
    const res = await create({
      name: 'Nombre d’albums',
      connectionId: connId,
      sql: 'SELECT COUNT(*) AS n FROM albums',
      schedule: { kind: 'interval', everyMinutes: 60 },
    });
    expect(res.statusCode).toBe(201);
    const task = res.json() as ScheduledTask;
    expect(task.enabled).toBe(true);
    expect(task.nextRunAt).toBeTruthy();

    const run = await t.app.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/run`,
    });
    expect(run.statusCode).toBe(200);
    const snap = run.json() as TaskSnapshot;
    expect(snap.status).toBe('ok');
    expect(snap.columns.map((c) => c.name)).toContain('n');
    expect(snap.rows.length).toBe(1);

    const list = await t.app.inject({ method: 'GET', url: '/api/tasks' });
    const tasks = list.json() as ScheduledTask[];
    const stored = tasks.find((x) => x.id === task.id)!;
    expect(stored.lastStatus).toBe('ok');
    expect(stored.lastSnapshotId).toBe(snap.id);

    const snaps = await t.app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/snapshots`,
    });
    expect((snaps.json() as TaskSnapshot[]).length).toBeGreaterThan(0);
  });

  it('rejects a write query at creation (read-only guardrail)', async () => {
    const res = await create({
      name: 'suppression',
      connectionId: connId,
      sql: 'DELETE FROM albums',
      schedule: { kind: 'daily', hour: 9, minute: 0 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('daily schedule does not run before its time', async () => {
    // A daily task created now schedules its first run at the next 09:00,
    // never immediately.
    const res = await create({
      name: 'quotidien',
      connectionId: connId,
      sql: 'SELECT 1 AS x',
      schedule: { kind: 'daily', hour: 9, minute: 0 },
    });
    const task = res.json() as ScheduledTask;
    expect(new Date(task.nextRunAt!).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('Scheduler.computeNextRun', () => {
  const s = new Scheduler({} as never, {} as never);

  it('adds the interval for interval schedules', () => {
    const from = new Date('2026-01-01T08:00:00.000Z');
    const next = s.computeNextRun({ kind: 'interval', everyMinutes: 30 }, from);
    expect(new Date(next).getTime() - from.getTime()).toBe(30 * 60_000);
  });

  it('rolls a daily schedule to the next occurrence', () => {
    // Local 09:00; pick a "from" clearly before and after to check both sides.
    const before = new Date();
    before.setHours(8, 0, 0, 0);
    const nextFromBefore = new Date(
      s.computeNextRun({ kind: 'daily', hour: 9, minute: 0 }, before),
    );
    expect(nextFromBefore.getHours()).toBe(9);
    expect(nextFromBefore.getDate()).toBe(before.getDate()); // same day

    const after = new Date();
    after.setHours(10, 0, 0, 0);
    const nextFromAfter = new Date(
      s.computeNextRun({ kind: 'daily', hour: 9, minute: 0 }, after),
    );
    expect(nextFromAfter.getTime()).toBeGreaterThan(after.getTime()); // tomorrow
  });
});
