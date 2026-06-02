import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environmental variables for standalone script execution
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function cleanupExpiredCache() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase credentials are missing from environment');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Calculate cut-off date (30 days ago)
  const retentionDays = 30;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffIsoString = cutoffDate.toISOString();

  console.log(`\n=================== AI CACHE CLEANUP ===================`);
  console.log(`- Retention Period: ${retentionDays} days`);
  console.log(`- Target expiration date (UTC): ${cutoffIsoString}`);

  // 1. Clean match_ai_coaching_cache
  try {
    const { count, error } = await supabase
      .from('match_ai_coaching_cache')
      .delete({ count: 'exact' })
      .lt('created_at', cutoffIsoString);

    if (error) throw error;
    console.log(`✓ match_ai_coaching_cache cleared: ${count || 0} rows`);
  } catch (err: any) {
    console.error(`✗ Failed to clear match_ai_coaching_cache: ${err.message}`);
  }

  // 2. Clean player_ai_summary_cache
  try {
    const { count, error } = await supabase
      .from('player_ai_summary_cache')
      .delete({ count: 'exact' })
      .lt('created_at', cutoffIsoString);

    if (error) throw error;
    console.log(`✓ player_ai_summary_cache cleared: ${count || 0} rows`);
  } catch (err: any) {
    console.error(`✗ Failed to clear player_ai_summary_cache: ${err.message}`);
  }

  // 3. Clean squad_ai_coaching_cache
  try {
    const { count, error } = await supabase
      .from('squad_ai_coaching_cache')
      .delete({ count: 'exact' })
      .lt('created_at', cutoffIsoString);

    if (error) throw error;
    console.log(`✓ squad_ai_coaching_cache cleared: ${count || 0} rows`);
  } catch (err: any) {
    console.error(`✗ Failed to clear squad_ai_coaching_cache: ${err.message}`);
  }

  console.log(`========================================================\n`);
}

cleanupExpiredCache().catch(err => {
  console.error('❌ AI Cache Cleanup failed with error:', err);
  process.exit(1);
});
