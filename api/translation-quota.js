import { requireAuthenticatedUser, getSupabaseAdmin } from '../server/supabase.js';
import { getPaddleEnvironment } from '../server/paddle.js';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }
  try {
    const user = await requireAuthenticatedUser(request);
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body || {};
    const admin = getSupabaseAdmin();
    const { data: superUser, error: superUserError } = await admin.from('super_users')
      .select('user_id').eq('user_id', user.id).maybeSingle();
    if (superUserError) throw superUserError;
    if (superUser) return response.status(200).json({ unlimited: true, tier: 'advanced' });
    const { data, error } = await admin.rpc('translation_quota', {
      target_actor: user.id, target_environment: getPaddleEnvironment(), target_project: body.projectId,
      operation: body.operation, attempt_id: body.attemptId || null, target_chapter: body.chapterId || null,
      target_output_hash: body.outputHash || null,
    });
    if (error) throw error;
    return response.status(data.blocked ? 409 : 200).json(data);
  } catch (error) {
    return response.status(error.statusCode || 503).json({ error: 'Cloud translation is paused. Check access, save your chapter, and retry.' });
  }
}
