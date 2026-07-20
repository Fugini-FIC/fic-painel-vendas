// lib/authApi.ts — autenticação das rotas /api do painel interno.
// Login/identidade: validados no Supabase crm_fugini (mesma base de usuários do
// app de check-in). Dados do vendedor (cod/role): lidos do dw_fugini (crm.vendedores),
// sincronizados do crm_fugini. O cod_vendedor/role SEMPRE vem daqui, nunca do body.
import type { NextApiRequest, NextApiResponse } from 'next'
import { dw } from './dwdb'
import { crm } from './crmSupabase'

export interface VendedorAuth {
  cod_vendedor: string
  nome: string
  role: string        // 'vendedor' | 'master'
  email: string
}

/** Valida o token e resolve o vendedor. Responde 401/403 e retorna null se falhar. */
export async function requireVendedor(
  req: NextApiRequest,
  res: NextApiResponse,
  roles?: string[]
): Promise<VendedorAuth | null> {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) {
    res.status(401).json({ error: 'Não autenticado' })
    return null
  }

  const { data: { user }, error } = await crm().auth.getUser(token)
  if (error || !user?.email) {
    res.status(401).json({ error: 'Sessão inválida ou expirada' })
    return null
  }

  const r = await dw().query(
    'select cod_vendedor, nome, role, email from crm.vendedores where email = $1',
    [user.email]
  )
  const vendedor = r.rows[0] as VendedorAuth | undefined
  if (!vendedor) {
    res.status(403).json({ error: 'Usuário sem vendedor vinculado' })
    return null
  }
  if (roles && !roles.includes(vendedor.role)) {
    res.status(403).json({ error: 'Acesso restrito ao gestor' })
    return null
  }
  return vendedor
}
