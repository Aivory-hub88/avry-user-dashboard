/**
 * Supabase client instance for the free diagnostic storage.
 * Re-exports the singleton from the existing supabaseClient module.
 *
 * This file exists at lib/supabase/client.ts as a clean entry point
 * for the supabase/ sub-module. It uses the same env vars:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder-anon-key')
