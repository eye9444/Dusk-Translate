import { getAccountEntitlements } from '../../server/entitlements.js';
import { requireAuthenticatedUser } from '../../server/supabase.js';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const user = await requireAuthenticatedUser(request);
    response.status(200).json(await getAccountEntitlements(user.id));
  } catch (error) {
    response.status(error.statusCode || 503).json({ error: 'Unable to confirm your plan. Please retry.' });
  }
}
