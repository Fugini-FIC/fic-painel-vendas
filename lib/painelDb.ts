// lib/painelDb.ts — cliente do banco ANALÍTICO (projeto db_FIC_Painel)
// Guarda vendas, clientes, produtos e campanhas sincronizados do ERP.
// O banco do CRM (lib/authApi.ts) continua com auth, visitas e metas.
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export function supabasePainel(): SupabaseClient {
  return createClient(
    process.env.PAINEL_SUPABASE_URL!,
    process.env.PAINEL_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}
