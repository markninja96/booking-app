import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../app/app.module';

const describeAuth = process.env.DATABASE_URL ? describe : describe.skip;

describeAuth('auth stage 3A', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
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
    expect(meResponse.body.roles).toEqual([]);
    expect(meResponse.body.activeRole).toBeNull();
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
      })
      .expect(400);

    expect(response.body.fieldErrors?.password).toEqual(
      expect.arrayContaining(['Password is too common']),
    );
  });
});
