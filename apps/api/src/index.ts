import 'dotenv/config';

import cors from 'cors';
import express from 'express';

import type { HealthResponse } from '@nexchat/shared';

import { connectMongo } from './lib/mongodb.js';
import authRoutes from './routes/auth.routes.js';

const app = express();

const port = Number(process.env.PORT) || 3000;
const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:5173';

app.use(
  cors({
    origin: webOrigin,
  }),
);

app.use(express.json());

app.use('/api/auth', authRoutes);

app.get('/health', (_req, res) => {
  const response: HealthResponse = {
    status: 'ok',
    service: 'nexchat-api',
  };

  res.json(response);
});

async function start(): Promise<void> {
  await connectMongo();

  app.listen(port, () => {
    console.log(`NexChat API running on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start NexChat API:', error);
  process.exit(1);
});
