import { getSupabaseAdmin, requireAuthenticatedUser } from '../../server/supabase.js';

const VALID_TIERS = new Set(['free', 'pro', 'advanced']);

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }
  try {
    const caller = await requireAuthenticatedUser(request);
    const admin = getSupabaseAdmin();
    
    // Verify if caller is a super user
    const { data: isSuper } = await admin.from('super_users').select('user_id').eq('user_id', caller.id).maybeSingle();
    if (!isSuper) {
      return response.status(403).json({ error: 'Super-user access required.' });
    }

    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body || {};
    const { targetUserId, tier } = body;
    if (!targetUserId || !VALID_TIERS.has(tier)) {
      return response.status(400).json({ error: 'targetUserId and tier (free/pro/advanced) are required.' });
    }

    await admin.from('account_preferences').upsert({
      user_id: targetUserId,
      super_user_tier: tier,
      super_user_set_by: caller.id,
      updated_at: new Date().toISOString(),
    });

    return response.status(200).json({ ok: true, targetUserId, tier });
  } catch (error) {
    return response.status(error.statusCode || 503).json({ error: error.message || 'Unable to set tier.' });
  }
}
