import { processPaddleEvent } from '../../server/billing.js';
import { getPaddle, getWebhookSecret } from '../../server/paddle.js';

export const config = { api: { bodyParser: false } };

async function rawBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > 2_000_000) throw new Error('Webhook body too large.');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const signature = request.headers['paddle-signature'];
  let body;
  try { body = await rawBody(request); }
  catch { return response.status(413).json({ error: 'Invalid webhook body.' }); }
  if (typeof signature !== 'string' || !body) {
    response.status(400).json({ error: 'Missing Paddle signature or request body.' });
    return;
  }

  try {
    // Do not parse body before verification: Paddle signs the raw bytes.
    const event = await getPaddle().webhooks.unmarshal(body, getWebhookSecret(), signature);
    await processPaddleEvent(event);
    response.status(200).json({ received: true });
  } catch (error) {
    // Do not log SDK request objects, authorization headers, or customer payloads.
    console.error('Paddle webhook verification or persistence failed.');
    // Any non-2xx response asks Paddle to retry an at-least-once delivery.
    response.status(500).json({ error: 'Webhook processing failed.' });
  }
}
