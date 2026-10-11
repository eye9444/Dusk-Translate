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
      const update={user_id:user.id,updated_at:new Date().toISOString()};
      if(typeof body.dismissApiSpendingNotice==='boolean')update.dismiss_api_spending_notice=body.dismissApiSpendingNotice;
      if(typeof body.lastSeenRelease==='string'&&body.lastSeenRelease.length<=100)update.last_seen_release=body.lastSeenRelease;
      if(Object.keys(update).length===2)return response.status(400).json({error:'A supported preference is required.'});
      const { error } = await admin.from('account_preferences').upsert(update,{onConflict:'user_id'});
      if (error) throw error;
    }
    const { data, error } = await admin.from('account_preferences')
      .select('dismiss_api_spending_notice,last_seen_release').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    return response.status(200).json({ dismissApiSpendingNotice: data?.dismiss_api_spending_notice || false,lastSeenRelease:data?.last_seen_release||'' });
  } catch (error) {
    return response.status(error.statusCode || 503).json({ error: 'Unable to load or save your preferences.' });
  }
}
