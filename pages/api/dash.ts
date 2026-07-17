// pages/api/dash.ts — agregados do Painel do Gestor (lê do dw_fugini).
// GET /api/dash?inicio=YYYY-MM-DD&fim=YYYY-MM-DD[&cod_vendedor=SC01]
// Auth: Bearer token (Supabase crm_fugini). Role 'master' vê tudo; 'vendedor'
// só vê os próprios números (filtro forçado pela sessão).
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireVendedor } from '@/lib/authApi'
import { dw } from '@/lib/dwdb'

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  const vendedor = await requireVendedor(req, res)
  if (!vendedor) return

  const { inicio, fim } = req.query
  if (typeof inicio !== 'string' || typeof fim !== 'string' ||
      !DATA_RE.test(inicio) || !DATA_RE.test(fim)) {
    return res.status(400).json({ error: 'Parâmetros inicio e fim obrigatórios (YYYY-MM-DD)' })
  }

  // Vendedor comum só enxerga a si mesmo; master pode filtrar ou ver tudo
  let filtro: string | null = null
  if (vendedor.role === 'master') {
    const q = req.query.cod_vendedor
    filtro = typeof q === 'string' && q.length > 0 ? q : null
  } else {
    filtro = vendedor.cod_vendedor
  }

  try {
    const [vendasRes, pedidosRes] = await Promise.all([
      dw().query('select mart.painel_vendas($1,$2,$3) as j', [inicio, fim, filtro]),
      dw().query('select mart.painel_pedidos($1,$2,$3) as j', [inicio, fim, filtro]),
    ])
    return res.status(200).json({
      role: vendedor.role,
      filtro_vendedor: filtro,
      ...vendasRes.rows[0].j,           // resumo, carteira, por_vendedor, visitas, metas, ...
      pedidos: pedidosRes.rows[0].j,    // carteira em aberto, fill rate, corte
    })
  } catch (e) {
    return res.status(500).json({
      error: 'Falha ao calcular indicadores no dw_fugini',
      detalhe: e instanceof Error ? e.message : String(e),
    })
  }
}
