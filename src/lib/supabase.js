import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)

const SUPABASE_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.co$/
const CONFIG_URL_ERROR = 'Supabase URL không hợp lệ. Kiểm tra VITE_SUPABASE_URL trong .env.local'
const CONFIG_KEY_ERROR = 'Supabase anon key không hợp lệ. Không dùng service role key trong frontend.'

function getSupabaseConfigError() {
  if (!hasSupabaseConfig) return ''

  try {
    new URL(supabaseUrl)
  } catch {
    return CONFIG_URL_ERROR
  }

  if (!SUPABASE_URL_PATTERN.test(supabaseUrl)) {
    return CONFIG_URL_ERROR
  }

  if (supabaseAnonKey.toLowerCase().includes('service_role')) {
    return CONFIG_KEY_ERROR
  }

  return ''
}

export const supabaseConfigError = getSupabaseConfigError()
export const isSupabaseConfigured = hasSupabaseConfig && !supabaseConfigError

if (import.meta.env.DEV) {
  console.log('hasSupabaseConfig', hasSupabaseConfig)
  if (supabaseUrl && !supabaseConfigError) {
    console.log('supabaseUrlHost', new URL(supabaseUrl).host)
  }
}

export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null
