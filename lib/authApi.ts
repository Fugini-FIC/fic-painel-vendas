// lib/authApi.ts — autenticação server-side para as rotas /api
// Valida o JWT do Supabase enviado em Authorization: Bearer <token>
// e resolve o vendedor correspondente. O cod_vendedor/role SEMPRE vem
// daqui — nunca do body/query do cliente.
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export interface VendedorAuth {
  cod_vendedor: string
  nome: string
  role: string // 'vendedor' | 'master'
  email: string
}

export function supabaseAdmin(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/**
 * Autentica a requisição. Retorna o vendedor logado ou responde
 * 401/403 e retorna null (o handler deve dar return).
 * @param roles se informado, exige que o role esteja na lista (ex: ['master'])
 */
export async function requireVendedor(
  req: NextApiRequest,
  res: NextApiResponse,
  admin: SupabaseClient,
  roles?: string[]
): Promise<VendedorAuth | null> {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) {
    res.status(401).json({ error: 'Não autenticado' })
    return null
  }

  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user?.email) {
    res.status(401).json({ error: 'Sessão inválida ou expirada' })
    return null
  }

  const { data: vendedor } = await admin
    .from('vendedores')
    .select('cod_vendedor, nome, role, email')
    .eq('email', user.email)
    .single()

  if (!vendedor) {
    res.status(403).json({ error: 'Usuário sem vendedor vinculado' })
    return null
  }

  if (roles && !roles.includes(vendedor.role)) {
    res.status(403).json({ error: 'Acesso restrito ao gestor' })
    return null
  }

  return vendedor as VendedorAuth
}
