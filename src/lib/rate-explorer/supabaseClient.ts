/**
 * Separate Supabase client for Rate Explorer Edge Functions
 * This project has the scraping Edge Functions deployed
 */
import { createClient } from '@supabase/supabase-js';

// Rate Explorer Supabase project configuration
const RATE_EXPLORER_SUPABASE_URL = 'https://wrlwmvggedkqhmdzgmbo.supabase.co';
const RATE_EXPLORER_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndybHdtdmdnZWRrcWhtZHpnbWJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NjYwMjgsImV4cCI6MjA4NzQ0MjAyOH0.t-gsmPSGI4N2fvgZCqbrl7Stoow61DwlcVbU3X_WCyc';

// Create a separate Supabase client for Rate Explorer Edge Functions
export const rateExplorerSupabase = createClient(
  RATE_EXPLORER_SUPABASE_URL,
  RATE_EXPLORER_SUPABASE_ANON_KEY
);


