// Supabase Edge Function: purge-orphan-auth
// Deletes the auth.users logins queued by trg_queue_merchant_auth_purge after
// a merchant's data has been purged. Runs with the service role.
//
// Deploy:   supabase functions deploy purge-orphan-auth
// Secret:   supabase secrets set CRON_SECRET=<a-long-random-string>
// Schedule: see orphan-auth-queue.sql (pg_cron + pg_net) or the dashboard cron.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  // Only the scheduler (which knows the secret) may invoke this.
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: rows, error } = await supabase
    .from('orphan_auth_purge_queue')
    .select('id')
    .limit(200);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let deleted = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    const { error: delErr } = await supabase.auth.admin.deleteUser(row.id);
    // Treat "already gone" as success (e.g. deleted via cascade).
    const gone =
      !delErr ||
      (delErr as { status?: number }).status === 404 ||
      /not.?found/i.test(delErr.message ?? '');

    if (gone) {
      await supabase.from('orphan_auth_purge_queue').delete().eq('id', row.id);
      deleted++;
    } else {
      failed++; // leave in the queue; retried next run
    }
  }

  return new Response(
    JSON.stringify({ processed: rows?.length ?? 0, deleted, failed }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
