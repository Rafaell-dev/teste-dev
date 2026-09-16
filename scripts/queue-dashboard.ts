import * as express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import { CEP_QUEUE_NAME } from '../src/modules/cep/queues/cep.queue';

import * as dotenv from 'dotenv';
dotenv.config();

async function bootstrap() {
  const redisOptions = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  };

  const cepQueue = new Queue(CEP_QUEUE_NAME, { connection: redisOptions });

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [new BullMQAdapter(cepQueue)],
    serverAdapter: serverAdapter,
  });

  const app = express();

  app.use('/admin/queues', serverAdapter.getRouter());

  const port = process.env.BULL_BOARD_PORT || 3002;

  app.listen(port, () => {
    console.log(
      `🚀 BullMQ Dashboard rodando em: http://localhost:${port}/admin/queues`,
    );
    console.log(
      `Conectado ao Redis em: ${redisOptions.host}:${redisOptions.port}`,
    );
  });
}

bootstrap().catch(console.error);
