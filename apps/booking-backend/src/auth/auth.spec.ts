import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../app/app.module';
import { DRIZZLE_DB } from '../db/drizzle';
import type { DbClient } from '../db/drizzle';
import { customerProfiles, providerProfiles } from '../db/schema';

const describeAuth = process.env.DATABASE_URL ? describe : describe.skip;
const adminEmail = `admin_${Date.now()}@example.com`;

describeAuth('auth stage 3C', () => {
  jest.setTimeout(20000);
  let app: INestApplication;
  let db: DbClient;
  let adminAccessToken: string;
  let adminUserId: string;

  beforeAll(async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = adminEmail;
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.GOOGLE_CALLBACK_URL =
      'http://localhost:3000/api/auth/google/callback';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    db = app.get(DRIZZLE_DB);

    const adminRegister = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fname: 'Admin',
        lname: 'User',
        email: adminEmail,
        password: 'StrongPass123!',
        role: 'customer',
      })
      .expect(201);

    adminAccessToken = adminRegister.body.accessToken;
    const jwtService = app.get(JwtService);
    const adminPayload = await jwtService.verifyAsync(adminAccessToken);
    adminUserId = adminPayload.sub;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 401 for /me without token', async () => {
    await request(app.getHttpServer()).get('/me').expect(401);
  });

  it('register/login roundtrip works and /me returns userId', async () => {
    const email = `user_${Date.now()}@example.com`;
    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fname: 'Test',
        lname: 'User',
        email,
        password: 'StrongPass123!',
        role: 'customer',
      })
      .expect(201);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email,
        password: 'StrongPass123!',
      })
      .expect(200);

    const jwtService = app.get(JwtService);
    const payload = await jwtService.verifyAsync(
      registerResponse.body.accessToken,
    );

    const meResponse = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .expect(200);

    expect(meResponse.body.userId).toBe(payload.sub);
    expect(meResponse.body.roles).toEqual(['customer']);
    expect(meResponse.body.activeRole).toBe('customer');
    expect(meResponse.body.actorUserId).toBeNull();
    expect(meResponse.body.subjectUserId).toBeNull();
  });

  it('rejects weak passwords with clear errors', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fname: 'Weak',
        lname: 'Password',
        email: `weak_${Date.now()}@example.com`,
        password: 'weakpassword123',
        role: 'customer',
      })
      .expect(400);

    expect(response.body.fieldErrors?.password).toEqual(
      expect.arrayContaining([
        'Password must include an uppercase letter',
        'Password must include a symbol',
      ]),
    );
  });

  it('rejects common passwords from the denylist', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fname: 'Common',
        lname: 'Password',
        email: `common_${Date.now()}@example.com`,
        password: 'Password123!',
        role: 'customer',
      })
      .expect(400);

    expect(response.body.fieldErrors?.password).toEqual(
      expect.arrayContaining(['Password is too common']),
    );
  });

  it('provider registration requires businessName', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fname: 'Pro',
        lname: 'User',
        email: `provider_${Date.now()}@example.com`,
        password: 'StrongPass123!',
        role: 'provider',
      })
      .expect(400);

    expect(response.body.fieldErrors?.businessName).toEqual(
      expect.arrayContaining(['Business name is required']),
    );
  });

  it('registration creates correct profile row', async () => {
    const customerEmail = `customer_${Date.now()}@example.com`;
    const customerRegister = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fname: 'Customer',
        lname: 'User',
        email: customerEmail,
        password: 'StrongPass123!',
        role: 'customer',
      })
      .expect(201);

    const jwtService = app.get(JwtService);
    const customerPayload = await jwtService.verifyAsync(
      customerRegister.body.accessToken,
    );

    const [customerProfile] = await db
      .select({ userId: customerProfiles.userId })
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, customerPayload.sub))
      .limit(1);

    expect(customerProfile).toBeDefined();

    const providerEmail = `provider_${Date.now()}@example.com`;
    const providerRegister = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fname: 'Provider',
        lname: 'User',
        email: providerEmail,
        password: 'StrongPass123!',
        role: 'provider',
        businessName: 'Provider Co',
      })
      .expect(201);

    const providerPayload = await jwtService.verifyAsync(
      providerRegister.body.accessToken,
    );

    const [providerProfile] = await db
      .select({ userId: providerProfiles.userId })
      .from(providerProfiles)
      .where(eq(providerProfiles.userId, providerPayload.sub))
      .limit(1);

    expect(providerProfile).toBeDefined();

    const [providerCustomerProfile] = await db
      .select({ userId: customerProfiles.userId })
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, providerPayload.sub))
      .limit(1);

    expect(providerCustomerProfile).toBeDefined();
  });

  it('active-role switch rejects role not owned', async () => {
    const email = `switch_${Date.now()}@example.com`;
    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fname: 'Switch',
        lname: 'User',
        email,
        password: 'StrongPass123!',
        role: 'customer',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/active-role')
      .set('Authorization', `Bearer ${registerResponse.body.accessToken}`)
      .send({ activeRole: 'provider' })
      .expect(400);
  });

  it('admin ping denies non-admin and allows admin', async () => {
    const nonAdminEmail = `non_admin_${Date.now()}@example.com`;
    const nonAdminRegister = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fname: 'Non',
        lname: 'Admin',
        email: nonAdminEmail,
        password: 'StrongPass123!',
        role: 'customer',
      })
      .expect(201);

    await request(app.getHttpServer())
      .get('/admin/ping')
      .set('Authorization', `Bearer ${nonAdminRegister.body.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/admin/ping')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
  });

  it('non-admin cannot grant roles', async () => {
    const email = `grant_blocked_${Date.now()}@example.com`;
    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fname: 'Grant',
        lname: 'Blocked',
        email,
        password: 'StrongPass123!',
        role: 'customer',
      })
      .expect(201);

    const jwtService = app.get(JwtService);
    const payload = await jwtService.verifyAsync(
      registerResponse.body.accessToken,
    );

    await request(app.getHttpServer())
      .post(`/admin/users/${payload.sub}/roles/grant`)
      .set('Authorization', `Bearer ${registerResponse.body.accessToken}`)
      .send({ role: 'provider' })
      .expect(403);
  });

  it('granting provider role requires businessName when profile missing', async () => {
    const email = `grant_provider_${Date.now()}@example.com`;
    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fname: 'Grant',
        lname: 'Provider',
        email,
        password: 'StrongPass123!',
        role: 'customer',
      })
      .expect(201);

    const jwtService = app.get(JwtService);
    const payload = await jwtService.verifyAsync(
      registerResponse.body.accessToken,
    );

    const missingBusiness = await request(app.getHttpServer())
      .post(`/admin/users/${payload.sub}/roles/grant`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ role: 'provider' })
      .expect(400);

    expect(missingBusiness.body.message).toBe('Business name is required');

    const grantResponse = await request(app.getHttpServer())
      .post(`/admin/users/${payload.sub}/roles/grant`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ role: 'provider', businessName: 'Grant Co' })
      .expect(200);

    expect(grantResponse.body.roles).toEqual(
      expect.arrayContaining(['provider']),
    );
  });

  it('impersonation start requires admin', async () => {
    const email = `impersonate_blocked_${Date.now()}@example.com`;
    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fname: 'Impersonate',
        lname: 'Blocked',
        email,
        password: 'StrongPass123!',
        role: 'customer',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/admin/impersonation/start')
      .set('Authorization', `Bearer ${registerResponse.body.accessToken}`)
      .send({ subjectUserId: adminUserId })
      .expect(403);
  });

  it('impersonation reflects actor/subject and prevents privilege leakage', async () => {
    const email = `impersonate_subject_${Date.now()}@example.com`;
    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fname: 'Impersonate',
        lname: 'Subject',
        email,
        password: 'StrongPass123!',
        role: 'customer',
      })
      .expect(201);

    const jwtService = app.get(JwtService);
    const subjectPayload = await jwtService.verifyAsync(
      registerResponse.body.accessToken,
    );

    const impersonation = await request(app.getHttpServer())
      .post('/admin/impersonation/start')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ subjectUserId: subjectPayload.sub })
      .expect(200);

    const meResponse = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${impersonation.body.accessToken}`)
      .expect(200);

    expect(meResponse.body.actorUserId).toBe(adminUserId);
    expect(meResponse.body.subjectUserId).toBe(subjectPayload.sub);

    await request(app.getHttpServer())
      .get('/provider/ping')
      .set('Authorization', `Bearer ${impersonation.body.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/admin/ping')
      .set('Authorization', `Bearer ${impersonation.body.accessToken}`)
      .expect(200);
  });

  it('upgrade to provider grants role and profile', async () => {
    const email = `upgrade_${Date.now()}@example.com`;
    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fname: 'Upgrade',
        lname: 'User',
        email,
        password: 'StrongPass123!',
        role: 'customer',
      })
      .expect(201);

    const upgradeResponse = await request(app.getHttpServer())
      .post('/auth/upgrade/provider')
      .set('Authorization', `Bearer ${registerResponse.body.accessToken}`)
      .send({ businessName: 'Upgrade Co' })
      .expect(200);

    const jwtService = app.get(JwtService);
    const upgradedPayload = await jwtService.verifyAsync(
      upgradeResponse.body.accessToken,
    );

    expect(upgradedPayload.roles).toEqual(
      expect.arrayContaining(['customer', 'provider']),
    );

    const [providerProfile] = await db
      .select({ userId: providerProfiles.userId })
      .from(providerProfiles)
      .where(eq(providerProfiles.userId, upgradedPayload.sub))
      .limit(1);

    expect(providerProfile).toBeDefined();
  });
});
