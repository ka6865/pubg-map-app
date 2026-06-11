import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environmental variables for standalone script execution
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const AI_CACHE_RETENTION_DAYS = 30;

export const AI_CACHE_TABLES = [
  {
    name: 'match_ai_coaching_cache',
    uniqueKey: 'match_id + platform + player_id + coaching_style + prompt_version'
  },
  {
    name: 'player_ai_summary_cache',
    uniqueKey: 'player_id + platform + match_ids_hash + prompt_version'
  },
  {
    name: 'squad_ai_coaching_cache',
    uniqueKey: 'player_id + platform + group_key + match_ids_hash + coaching_style + prompt_version'
  }
] as const;

function createSupabaseServiceClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase credentials are missing from environment');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export async function cleanupExpiredCache(
  supabase = createSupabaseServiceClient(),
  now = new Date()
) {
  const cutoffDate = new Date(now);
  cutoffDate.setDate(cutoffDate.getDate() - AI_CACHE_RETENTION_DAYS);
  const cutoffIsoString = cutoffDate.toISOString();

  console.info('\n=================== AI CACHE CLEANUP ===================');
  console.info(`- Retention Period: ${AI_CACHE_RETENTION_DAYS} days`);
  console.info(`- Target expiration date (UTC): ${cutoffIsoString}`);

  for (const table of AI_CACHE_TABLES) {
    try {
      const { count, error } = await supabase
        .from(table.name)
        .delete({ count: 'exact' })
        .lt('created_at', cutoffIsoString);

      if (error) throw error;
      console.info(`- ${table.name} cleared: ${count || 0} rows (${table.uniqueKey})`);
    } catch (err: any) {
      console.error(`- Failed to clear ${table.name}: ${err.message}`);
    }
  }

  console.info('========================================================\n');
}

function isDirectRun() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isDirectRun()) {
  cleanupExpiredCache().catch(err => {
    console.error('AI Cache Cleanup failed with error:', err);
    process.exit(1);
  });
}
