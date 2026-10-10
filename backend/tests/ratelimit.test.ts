import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, resetDb } from './helpers.js';

beforeAll(async () => {
  await resetDb();
  process.env.ENABLE_RATE_LIMIT_IN_TESTS = '1';
});
afterAll(() => {
  delete process.env.ENABLE_RATE_LIMIT_IN_TESTS;
});

describe('rate limiting', () => {
  it('locks out repeated failed admin sign-ins', async () => {
    const c = await client();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await c.post('/api/auth/admin/login', { email: 'nobody@example.com', password: `wrong-${i}` });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});
