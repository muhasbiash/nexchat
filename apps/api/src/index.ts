import express from 'express';
import type { HealthResponse } from '@nexchat/shared';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

app.get('/health', (_req, res) => {
  const response: HealthResponse = {
    status: 'ok',
    service: 'nexchat-api',
  };

  res.json(response);
});

app.listen(PORT, () => {
  console.log(`NexChat API running on http://localhost:${PORT}`);
});
