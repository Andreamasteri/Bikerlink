import { Queue, Worker } from 'bullmq';

// Script di test locale (non usato in prod né in CI). La password vuota è
// accettabile come fallback perché questo script gira solo con un DragonflyDB
// locale di sviluppo dove l'autenticazione è opzionale.
const connection = { host: '127.0.0.1', port: 16379, password: process.env.TC_DRAGONFLY_PASSWORD ?? "", maxRetriesPerRequest: null };

const queueName = 'dragonfly-verify-' + Date.now();
const queue = new Queue(queueName, { connection });

let resolveDone;
const done = new Promise(r => resolveDone = r);

const worker = new Worker(queueName, async (job) => {
  console.log('WORKER processed job', job.id, JSON.stringify(job.data));
  return { ok: true };
}, { connection });

worker.on('completed', (job) => {
  console.log('COMPLETED event for job', job.id);
  resolveDone();
});
worker.on('failed', (job, err) => {
  console.error('FAILED', job?.id, err);
  resolveDone();
});

const job = await queue.add('test-job', { hello: 'dragonfly' });
console.log('ENQUEUED job', job.id);

const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout waiting for job completion')), 15000));
try {
  await Promise.race([done, timeout]);
  console.log('BULLMQ_TEST: PASS');
} catch (e) {
  console.error('BULLMQ_TEST: FAIL', e.message);
  process.exitCode = 1;
} finally {
  await worker.close();
  await queue.obliterate({ force: true }).catch(()=>{});
  await queue.close();
  process.exit(process.exitCode || 0);
}
