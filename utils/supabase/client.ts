import { createBrowserClient } from '@supabase/ssr'

// Clean utility to safely strip any accidental quotes or trailing spaces from Vercel envs
const clean = (val: string | undefined) => (val || '').replace(/['";\s]+/g, '').trim();

export function createClient() {
  return createBrowserClient(
    clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  )
}
