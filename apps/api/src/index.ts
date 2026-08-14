import cors from 'cors';
import express from 'express';

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(
  cors({
    origin: 'http://localhost:5173',
  }),
);

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'nexchat-api',
  });
});

app.listen(port, () => {
  console.log(`NexChat API running on http://localhost:${port}`);
});
