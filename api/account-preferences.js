import { getSupabaseAdmin, requireAuthenticatedUser } from '../server/supabase.js';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'PUT'].includes(request.method)) {
    response.setHeader('Allow', 'GET, PUT');
    return response.status(405).json({ error: 'Method not allowed.' });
  }
  try {
    const user = await requireAuthenticatedUser(request);
    const admin = getSupabaseAdmin();
    if (request.method === 'PUT') {
      const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body || {};
      if (typeof body.dismissApiSpendingNotice !== 'boolean') {
        return response.status(400).json({ error: 'A boolean preference is required.' });
      }
      const { error } = await admin.from('account_preferences').upsert({
        user_id: user.id, dismiss_api_spending_notice: body.dismissApiSpendingNotice,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    }
    const { data, error } = await admin.from('account_preferences')
      .select('dismiss_api_spending_notice').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    return response.status(200).json({ dismissApiSpendingNotice: data?.dismiss_api_spending_notice || false });
  } catch (error) {
    return response.status(error.statusCode || 503).json({ error: 'Unable to load or save your preferences.' });
  }
}
