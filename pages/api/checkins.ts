// pages/api/checkins.ts — check-ins e metas dos vendedores, direto do Supabase
// crm_fugini (tempo real — não passa pela sincronização periódica pro dw_fugini,
// que roda só 1-2x/dia via etl/sync_checkins_crm.py).
// GET /api/checkins?inicio=YYYY-MM-DD&fim=YYYY-MM-DD[&cod_vendedor=SC01][&mes=YYYY-MM]
// Auth: Bearer token. Vendedor comum só vê os próprios; master filtra ou vê tudo.
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireVendedor } from '@/lib/authApi'
import { crm } from '@/lib/crmSupabase'

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/
const MES_RE = /^\d{4}-\d{2}$/

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  const vendedor = await requireVendedor(req, res)
  if (!vendedor) return

  const { inicio, fim, mes } = req.query
  const filtroVendedor = vendedor.role === 'master'
    ? (typeof req.query.cod_vendedor === 'string' && req.query.cod_vendedor ? req.query.cod_vendedor : null)
    : vendedor.cod_vendedor

  let chkQuery = crm().from('checkins')
    .select('id,cod_cliente,nome_cliente,cod_vendedor,status_visita,observacao,timestamp,tipo_estabelecimento')
    .order('timestamp', { ascending: false })
    .limit(200)
  if (filtroVendedor) chkQuery = chkQuery.eq('cod_vendedor', filtroVendedor)
  if (typeof inicio === 'string' && DATA_RE.test(inicio)) chkQuery = chkQuery.gte('timestamp', `${inicio}T00:00:00`)
  if (typeof fim === 'string' && DATA_RE.test(fim)) chkQuery = chkQuery.lte('timestamp', `${fim}T23:59:59`)

  const mesRef = typeof mes === 'string' && MES_RE.test(mes) ? mes : new Date().toISOString().slice(0, 7)
  let metaQuery = crm().from('metas')
    .select('cod_vendedor,mes,meta_visitas,meta_positivados,meta_cadastros,fase,meta_faturamento,meta_caixas')
    .eq('mes', mesRef)
  if (filtroVendedor) metaQuery = metaQuery.eq('cod_vendedor', filtroVendedor)

  const [chk, metas] = await Promise.all([chkQuery, metaQuery])
  if (chk.error) return res.status(500).json({ error: chk.error.message })
  if (metas.error) return res.status(500).json({ error: metas.error.message })

  return res.status(200).json({ mes: mesRef, checkins: chk.data, metas: metas.data })
}
