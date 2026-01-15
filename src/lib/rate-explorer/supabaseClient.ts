/**
 * Separate Supabase client for Rate Explorer Edge Functions
 * This project has the scraping Edge Functions deployed
 */
import { createClient } from '@supabase/supabase-js';

// Rate Explorer Supabase project configuration
const RATE_EXPLORER_SUPABASE_URL = 'https://iflnsckduohrcafafcpj.supabase.co';
const RATE_EXPLORER_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmbG5zY2tkdW9ocmNhZmFmY3BqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MDk1MjQsImV4cCI6MjA4MzI4NTUyNH0.y2mWIp_p0zmj0rhI6kQJBOzAuwpZND1QLwEZ8PeIMTg';

// Create a separate Supabase client for Rate Explorer Edge Functions
export const rateExplorerSupabase = createClient(
  RATE_EXPLORER_SUPABASE_URL,
  RATE_EXPLORER_SUPABASE_ANON_KEY
);

