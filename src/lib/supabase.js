import { createClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const rawAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

const hasRealValue = (value, placeholder) =>
  Boolean(value) && value !== placeholder && !value.includes('your-')

export const isSupabaseConfigured =
  hasRealValue(rawUrl, 'https://your-project.supabase.co') &&
  hasRealValue(rawAnonKey, 'your-supabase-anon-key')

export const supabase = isSupabaseConfigured
  ? createClient(rawUrl, rawAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
