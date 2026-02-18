// Supabase client specifically for Futures Insights Dashboard
// Uses separate Supabase project credentials
import { createClient } from '@supabase/supabase-js';

const FUTURES_SUPABASE_URL = import.meta.env.VITE_FUTURES_SUPABASE_URL;
const FUTURES_SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_FUTURES_SUPABASE_PUBLISHABLE_KEY;

// Validate environment variables
if (!FUTURES_SUPABASE_URL || !FUTURES_SUPABASE_PUBLISHABLE_KEY) {
  const errorMsg = 'Futures Insights Supabase credentials not configured. Please check your .env file or Vercel environment variables.';
  console.error(errorMsg);
  // In production, we should still create a client to avoid breaking the app
  // but it will fail gracefully when used
}

// Create a separate Supabase client for Futures Insights Dashboard
// Only create if credentials are available
export const futuresSupabase = (FUTURES_SUPABASE_URL && FUTURES_SUPABASE_PUBLISHABLE_KEY)
  ? createClient(
      FUTURES_SUPABASE_URL,
      FUTURES_SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          storage: localStorage,
          persistSession: true,
          autoRefreshToken: true,
        }
      }
    )
  : null;

// Helper function to check if futures supabase is available
export const isFuturesSupabaseAvailable = () => {
  return futuresSupabase !== null;
};
