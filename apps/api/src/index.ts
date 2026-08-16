import 'dotenv/config';

import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';

import type { HealthResponse } from '@nexchat/shared';

import { connectMongo } from './lib/mongodb.js';
import authRoutes from './routes/auth.routes.js';
import conversationRoutes from './routes/conversation.routes.js';
import messageRoutes from './routes/message.routes.js';
import userRoutes from './routes/user.routes.js';
import { initializeSocket } from './socket.js';

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
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);

app.get('/health', (_req, res) => {
  const response: HealthResponse = {
    status: 'ok',
    service: 'nexchat-api',
  };

  res.json(response);
});

const httpServer = createServer(app);

initializeSocket(httpServer);

async function start(): Promise<void> {
  await connectMongo();

  httpServer.listen(port, () => {
    console.log(`NexChat API running on http://localhost:${port}`);
    console.log(`NexChat Socket.IO running on ws://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start NexChat API:', error);
  process.exit(1);
});
