import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../app/app.module';

const describeBookings = process.env.DATABASE_URL ? describe : describe.skip;

const createWindow = (startOffsetMinutes: number, durationMinutes: number) => {
  const start = new Date(Date.now() + startOffsetMinutes * 60 * 1000);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
};

describeBookings('bookings stage 4/5', () => {
  jest.setTimeout(20000);
  let app: INestApplication;
  let jwtService: JwtService;
  let adminAccessToken: string;

  const registerUser = async (role: 'customer' | 'provider') => {
    const email = `${role}_${Date.now()}_${Math.random()}@example.com`;
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fname: 'Test',
        lname: 'User',
        email,
        password: 'StrongPass123!',
        role,
        businessName: role === 'provider' ? 'Test Studio' : undefined,
      })
      .expect(201);

    const payload = await jwtService.verifyAsync(response.body.accessToken);
    return {
      accessToken: response.body.accessToken as string,
      userId: payload.sub as string,
    };
  };

  const impersonate = async (subjectUserId: string) => {
    const response = await request(app.getHttpServer())
      .post('/admin/impersonation/start')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ subjectUserId })
      .expect(200);
    return response.body.accessToken as string;
  };

  beforeAll(async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = `admin_${Date.now()}@example.com`;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    jwtService = app.get(JwtService);

    const adminRegister = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fname: 'Admin',
        lname: 'User',
        email: process.env.BOOTSTRAP_ADMIN_EMAIL,
        password: 'StrongPass123!',
        role: 'customer',
      })
      .expect(201);

    adminAccessToken = adminRegister.body.accessToken;
    await jwtService.verifyAsync(adminAccessToken);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns validation errors with explicit messages', async () => {
    const { accessToken: customerToken } = await registerUser('customer');
    const response = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        providerUserId: 'not-a-uuid',
        startTime: '2026-01-01T10:00:00',
        endTime: '2026-01-01T09:00:00Z',
      })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
    });
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'body.providerUserId',
          message: 'providerUserId must be a valid UUID',
        }),
        expect.objectContaining({
          field: 'body.startTime',
          message: 'startTime must be a valid ISO 8601 timestamp with timezone',
        }),
      ]),
    );
  });

  it('rejects invalid cursor tokens', async () => {
    const { accessToken: customerToken } = await registerUser('customer');
    const response = await request(app.getHttpServer())
      .get('/bookings?cursor=not-base64')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(400);

    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'query.cursor',
          message: 'cursor must be a valid base64 token',
        }),
      ]),
    );
  });

  it('rejects invalid list status filters', async () => {
    const { accessToken: customerToken } = await registerUser('customer');
    const response = await request(app.getHttpServer())
      .get('/bookings?status=unknown')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(400);

    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'query.status',
          message:
            'status must be one of: pending, confirmed, cancelled, completed',
        }),
      ]),
    );
  });

  it('rejects self-booking', async () => {
    const { accessToken: customerToken, userId } =
      await registerUser('customer');
    const { startTime, endTime } = createWindow(10, 60);

    const response = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        providerUserId: userId,
        startTime,
        endTime,
      })
      .expect(400);

    expect(response.body).toEqual({
      code: 'BAD_REQUEST',
      message: 'Bad request',
    });
  });

  it('rejects booking creation when requester is not a customer', async () => {
    const { accessToken: providerToken, userId: providerUserId } =
      await registerUser('provider');
    const { startTime, endTime } = createWindow(10, 60);

    const response = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        providerUserId,
        startTime,
        endTime,
      })
      .expect(403);

    expect(response.body).toEqual({
      code: 'FORBIDDEN',
      message: 'Forbidden',
    });
  });

  it('returns 403 when reading a booking not owned by subject', async () => {
    const { userId: providerUserId } = await registerUser('provider');
    const { accessToken: customerToken } = await registerUser('customer');
    const { accessToken: otherCustomerToken } = await registerUser('customer');
    const { startTime, endTime } = createWindow(10, 60);

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        providerUserId,
        startTime,
        endTime,
      })
      .expect(201);

    const bookingId = createResponse.body.data.id as string;
    const response = await request(app.getHttpServer())
      .get(`/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${otherCustomerToken}`)
      .expect(403);

    expect(response.body).toEqual({
      code: 'FORBIDDEN',
      message: 'Forbidden',
    });
  });

  it('returns only subject-owned bookings in list', async () => {
    const { userId: providerUserId } = await registerUser('provider');
    const { accessToken: customerToken } = await registerUser('customer');
    const { accessToken: otherCustomerToken } = await registerUser('customer');
    const windowOne = createWindow(10, 60);
    const windowTwo = createWindow(20, 60);

    const bookingOne = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ providerUserId, ...windowOne })
      .expect(201);

    const bookingTwo = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${otherCustomerToken}`)
      .send({ providerUserId, ...windowTwo })
      .expect(201);

    const listResponse = await request(app.getHttpServer())
      .get('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    const ids = listResponse.body.data.map(
      (booking: { id: string }) => booking.id,
    );
    expect(ids).toContain(bookingOne.body.data.id);
    expect(ids).not.toContain(bookingTwo.body.data.id);
  });

  it('allows admin to read any booking and list all when not impersonating', async () => {
    const { userId: providerUserId } = await registerUser('provider');
    const { accessToken: customerToken } = await registerUser('customer');
    const { startTime, endTime } = createWindow(10, 60);

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ providerUserId, startTime, endTime })
      .expect(201);

    const bookingId = createResponse.body.data.id as string;
    await request(app.getHttpServer())
      .get(`/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    const listResponse = await request(app.getHttpServer())
      .get('/bookings')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    expect(listResponse.body.data.length).toBeGreaterThan(0);
  });

  it('scopes admin impersonation to the subject for get/list', async () => {
    const { userId: providerUserId } = await registerUser('provider');
    const { accessToken: customerToken, userId: customerUserId } =
      await registerUser('customer');
    const { accessToken: otherCustomerToken } = await registerUser('customer');
    const windowOne = createWindow(10, 60);
    const windowTwo = createWindow(20, 60);

    const bookingOne = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ providerUserId, ...windowOne })
      .expect(201);

    const bookingTwo = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${otherCustomerToken}`)
      .send({ providerUserId, ...windowTwo })
      .expect(201);

    const impersonationToken = await impersonate(customerUserId);
    await request(app.getHttpServer())
      .get(`/bookings/${bookingOne.body.data.id}`)
      .set('Authorization', `Bearer ${impersonationToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/bookings/${bookingTwo.body.data.id}`)
      .set('Authorization', `Bearer ${impersonationToken}`)
      .expect(403);

    const listResponse = await request(app.getHttpServer())
      .get('/bookings')
      .set('Authorization', `Bearer ${impersonationToken}`)
      .expect(200);

    expect(listResponse.body.data).toHaveLength(1);
  });

  it('enforces idempotency key behavior', async () => {
    const { userId: providerUserId } = await registerUser('provider');
    const { accessToken: customerToken } = await registerUser('customer');
    const { startTime, endTime } = createWindow(10, 60);

    const first = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        providerUserId,
        startTime,
        endTime,
        idempotencyKey: 'key-1',
      })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        providerUserId,
        startTime,
        endTime,
        idempotencyKey: 'key-1',
      })
      .expect(200);

    expect(second.body.data.id).toBe(first.body.data.id);

    const conflict = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        providerUserId,
        startTime,
        endTime: createWindow(15, 60).endTime,
        idempotencyKey: 'key-1',
      })
      .expect(409);

    expect(conflict.body).toEqual({
      code: 'CONFLICT',
      message: 'Idempotency key conflict',
    });
  });

  it('paginates bookings with stable ordering and cursor', async () => {
    const { userId: providerUserId } = await registerUser('provider');
    const { accessToken: customerToken } = await registerUser('customer');

    const windowOne = createWindow(10, 60);
    const windowTwo = createWindow(20, 60);
    const windowThree = createWindow(30, 60);

    await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ providerUserId, ...windowOne })
      .expect(201);

    await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ providerUserId, ...windowTwo })
      .expect(201);

    await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ providerUserId, ...windowThree })
      .expect(201);

    const pageOne = await request(app.getHttpServer())
      .get('/bookings?limit=2')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(pageOne.body.hasMore).toBe(true);
    expect(pageOne.body.data).toHaveLength(2);
    expect(pageOne.body.nextCursor).toBeTruthy();

    const pageTwo = await request(app.getHttpServer())
      .get(
        `/bookings?limit=2&cursor=${encodeURIComponent(
          pageOne.body.nextCursor,
        )}`,
      )
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(pageTwo.body.data).toHaveLength(1);
    expect(pageTwo.body.hasMore).toBe(false);
  });

  it('allows booking owner to cancel and blocks non-owner', async () => {
    const { userId: providerUserId } = await registerUser('provider');
    const { accessToken: customerToken } = await registerUser('customer');
    const { accessToken: otherCustomerToken } = await registerUser('customer');
    const { startTime, endTime } = createWindow(10, 60);

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ providerUserId, startTime, endTime })
      .expect(201);

    const bookingId = createResponse.body.data.id as string;
    const cancelResponse = await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'cancelled' })
      .expect(200);

    expect(cancelResponse.body.data.status).toBe('cancelled');

    await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${otherCustomerToken}`)
      .send({ status: 'cancelled' })
      .expect(403);
  });

  it('allows provider to confirm and complete bookings', async () => {
    const { accessToken: providerToken, userId: providerUserId } =
      await registerUser('provider');
    const { accessToken: customerToken } = await registerUser('customer');
    const { startTime, endTime } = createWindow(10, 60);

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ providerUserId, startTime, endTime })
      .expect(201);

    const bookingId = createResponse.body.data.id as string;
    const confirmResponse = await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'confirmed' })
      .expect(200);

    expect(confirmResponse.body.data.status).toBe('confirmed');

    const completeResponse = await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'completed' })
      .expect(200);

    expect(completeResponse.body.data.status).toBe('completed');
  });

  it('blocks customers from confirming or completing bookings', async () => {
    const { userId: providerUserId } = await registerUser('provider');
    const { accessToken: customerToken } = await registerUser('customer');
    const { startTime, endTime } = createWindow(10, 60);

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ providerUserId, startTime, endTime })
      .expect(201);

    const bookingId = createResponse.body.data.id as string;
    await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'confirmed' })
      .expect(403);
  });

  it('returns 400 for invalid status transitions', async () => {
    const { accessToken: providerToken, userId: providerUserId } =
      await registerUser('provider');
    const { accessToken: customerToken } = await registerUser('customer');
    const { startTime, endTime } = createWindow(10, 60);

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ providerUserId, startTime, endTime })
      .expect(201);

    const bookingId = createResponse.body.data.id as string;
    const invalidComplete = await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'completed' })
      .expect(400);

    expect(invalidComplete.body).toEqual({
      code: 'BAD_REQUEST',
      message: 'status transition not allowed',
    });

    const cancelled = await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'cancelled' })
      .expect(200);

    expect(cancelled.body.data.status).toBe('cancelled');

    const invalidConfirm = await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'confirmed' })
      .expect(400);

    expect(invalidConfirm.body).toEqual({
      code: 'BAD_REQUEST',
      message: 'status transition not allowed',
    });
  });

  it('allows cancelling confirmed bookings and blocks cancelling completed bookings', async () => {
    const { accessToken: providerToken, userId: providerUserId } =
      await registerUser('provider');
    const { accessToken: customerToken } = await registerUser('customer');
    const { startTime, endTime } = createWindow(10, 60);

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ providerUserId, startTime, endTime })
      .expect(201);

    const bookingId = createResponse.body.data.id as string;
    await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'confirmed' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'cancelled' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'confirmed' })
      .expect(400);
  });

  it('blocks cancelling completed bookings', async () => {
    const { accessToken: providerToken, userId: providerUserId } =
      await registerUser('provider');
    const { accessToken: customerToken } = await registerUser('customer');
    const { startTime, endTime } = createWindow(10, 60);

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ providerUserId, startTime, endTime })
      .expect(201);

    const bookingId = createResponse.body.data.id as string;
    await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'confirmed' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'completed' })
      .expect(200);

    const response = await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'cancelled' })
      .expect(400);

    expect(response.body).toEqual({
      code: 'BAD_REQUEST',
      message: 'status transition not allowed',
    });
  });

  it('handles admin override cancelled -> pending only when impersonating', async () => {
    const { userId: providerUserId } = await registerUser('provider');
    const { accessToken: customerToken, userId: customerUserId } =
      await registerUser('customer');
    const { startTime, endTime } = createWindow(10, 60);

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ providerUserId, startTime, endTime })
      .expect(201);

    const bookingId = createResponse.body.data.id as string;
    await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'cancelled' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ status: 'pending' })
      .expect(403);

    const impersonationToken = await impersonate(customerUserId);
    await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${impersonationToken}`)
      .send({ status: 'pending' })
      .expect(200);

    const nonAdminResponse = await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'pending' })
      .expect(400);

    expect(nonAdminResponse.body).toEqual({
      code: 'BAD_REQUEST',
      message: 'status transition not allowed',
    });
  });

  it('returns 400 for same-status updates with transition message', async () => {
    const { userId: providerUserId } = await registerUser('provider');
    const { accessToken: customerToken } = await registerUser('customer');
    const { startTime, endTime } = createWindow(10, 60);

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ providerUserId, startTime, endTime })
      .expect(201);

    const bookingId = createResponse.body.data.id as string;
    const response = await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'pending' })
      .expect(400);

    expect(response.body).toEqual({
      code: 'BAD_REQUEST',
      message: 'status transition not allowed',
    });
  });

  it('returns updated status in PATCH response payload', async () => {
    const { accessToken: providerToken, userId: providerUserId } =
      await registerUser('provider');
    const { accessToken: customerToken } = await registerUser('customer');
    const { startTime, endTime } = createWindow(10, 60);

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ providerUserId, startTime, endTime })
      .expect(201);

    const bookingId = createResponse.body.data.id as string;
    const response = await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'confirmed' })
      .expect(200);

    expect(response.body.data.status).toBe('confirmed');
  });

  it('returns 403 for admin impersonation on non-admin endpoints with token subject mismatch', async () => {
    const { userId: providerUserId } = await registerUser('provider');
    const { accessToken: customerToken, userId: customerUserId } =
      await registerUser('customer');
    const { accessToken: otherCustomerToken } = await registerUser('customer');
    const { startTime, endTime } = createWindow(10, 60);

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ providerUserId, startTime, endTime })
      .expect(201);

    const bookingId = createResponse.body.data.id as string;
    const impersonationToken = await impersonate(customerUserId);

    await request(app.getHttpServer())
      .get(`/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${impersonationToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${otherCustomerToken}`)
      .send({ status: 'cancelled' })
      .expect(403);
  });

  it('exposes consistent response envelope and codes', async () => {
    const { userId: providerUserId } = await registerUser('provider');
    const { accessToken: customerToken } = await registerUser('customer');
    const { startTime, endTime } = createWindow(10, 60);

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ providerUserId, startTime, endTime })
      .expect(201);

    expect(createResponse.body.data).toMatchObject({
      providerUserId,
      customerUserId: expect.any(String),
      status: 'pending',
    });

    const bookingId = createResponse.body.data.id as string;
    const getResponse = await request(app.getHttpServer())
      .get(`/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(getResponse.body).toHaveProperty('data');
  });
});
