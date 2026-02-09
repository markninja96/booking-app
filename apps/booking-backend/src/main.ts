/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { BadRequestException, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import { createClient } from 'redis';
import passport from 'passport';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const { SESSION_SECRET, JWT_SECRET, REDIS_URL } = process.env;
  const sessionSecret = SESSION_SECRET ?? JWT_SECRET;
  if (!sessionSecret) {
    throw new BadRequestException(
      'SESSION_SECRET or JWT_SECRET is required for session storage',
    );
  }
  if (!REDIS_URL) {
    throw new BadRequestException('REDIS_URL is required for session storage');
  }

  if (
    process.env.TRUST_PROXY === 'true' ||
    process.env.NODE_ENV === 'production'
  ) {
    app.set('trust proxy', 1);
  }

  const redisClient = createClient({ url: REDIS_URL });
  redisClient.on('error', (error) => {
    Logger.error('Redis session client error', error);
  });
  await redisClient.connect();

  const redisStore = new RedisStore({
    client: redisClient,
    prefix: 'booking-app:sess:',
    ttl: 60 * 60 * 24,
  });

  app.use(
    session({
      store: redisStore,
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
