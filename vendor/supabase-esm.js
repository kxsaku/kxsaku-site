// ESM wrapper — re-exports createClient from the UMD bundle loaded via <script> tag
// Pages using ESM import should load the UMD bundle first, then import from this file
export const createClient = window.supabase.createClient;
