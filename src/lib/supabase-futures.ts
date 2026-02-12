// Supabase client specifically for Futures Insights Dashboard
// Uses separate Supabase project credentials
import { createClient } from '@supabase/supabase-js';

const FUTURES_SUPABASE_URL = import.meta.env.VITE_FUTURES_SUPABASE_URL;
const FUTURES_SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_FUTURES_SUPABASE_PUBLISHABLE_KEY;

if (!FUTURES_SUPABASE_URL || !FUTURES_SUPABASE_PUBLISHABLE_KEY) {
  console.warn('Futures Insights Supabase credentials not configured. Please check your .env file.');
}

// Create a separate Supabase client for Futures Insights Dashboard
export const futuresSupabase = createClient(
  FUTURES_SUPABASE_URL || '',
  FUTURES_SUPABASE_PUBLISHABLE_KEY || '',
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    }
  }
);
