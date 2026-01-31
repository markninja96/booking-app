import { Pool } from 'pg';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('database', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('connects and runs a simple query', async () => {
    const result = await pool.query('select 1 as ok');
    expect(result.rows[0]?.ok).toBe(1);
  });
});
