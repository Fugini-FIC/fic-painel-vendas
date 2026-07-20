// lib/crmSupabase.ts — cliente Supabase server-side do crm_fugini (app de
// check-in dos vendedores). Usado para ler dados em tempo real (checkins,
// metas), sem depender da sincronização periódica pro dw_fugini.
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function crm(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.SUPABASE_URL!,             // crm_fugini
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
  }
  return client
}
