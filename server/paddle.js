import { Environment, Paddle } from '@paddle/paddle-node-sdk';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function getPaddle() {
  const environment = required('PADDLE_ENV');
  if (environment !== 'sandbox' && environment !== 'production') {
    throw new Error('PADDLE_ENV must be either sandbox or production.');
  }

  return new Paddle(required('PADDLE_API_KEY'), {
    environment: environment === 'sandbox' ? Environment.sandbox : Environment.production,
  });
}

export function getWebhookSecret() {
  return required('PADDLE_NOTIFICATION_WEBHOOK_SECRET');
}
