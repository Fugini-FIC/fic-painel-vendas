// pages/api/dash.ts — agregados do Painel do Gestor
// GET /api/dash?inicio=2026-07-01&fim=2026-07-31[&cod_vendedor=SC01]
// Auth: Bearer token obrigatório (banco do CRM). Role 'master' vê tudo;
// 'vendedor' só vê os próprios números (filtro forçado pela sessão).
//
// Dois bancos: vendas/carteira vêm do projeto db_FIC_Painel
// (painel_vendas RPC); visitas e metas vêm do banco do CRM.
// A resposta é montada aqui num único JSON para o frontend.
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireVendedor, supabaseAdmin } from '@/lib/authApi'
import { supabasePainel } from '@/lib/painelDb'

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  const crm = supabaseAdmin()
  const vendedor = await requireVendedor(req, res, crm)
  if (!vendedor) return

  const { inicio, fim } = req.query
  if (typeof inicio !== 'string' || typeof fim !== 'string' ||
      !DATA_RE.test(inicio) || !DATA_RE.test(fim)) {
    return res.status(400).json({ error: 'Parâmetros inicio e fim obrigatórios (YYYY-MM-DD)' })
  }

  // Vendedor comum só enxerga a si mesmo; master pode filtrar ou ver tudo
  let filtroVendedor: string | null = null
  if (vendedor.role === 'master') {
    const q = req.query.cod_vendedor
    filtroVendedor = typeof q === 'string' && q.length > 0 ? q : null
  } else {
    filtroVendedor = vendedor.cod_vendedor
  }

  // ----- Banco analítico: vendas e carteira -----
  const painel = supabasePainel()
  const { data: vendasData, error: erroVendas } = await painel.rpc('painel_vendas', {
    p_inicio: inicio,
    p_fim: fim,
    p_vendedor: filtroVendedor,
  })
  if (erroVendas) {
    return res.status(500).json({
      error: 'Falha ao calcular indicadores de vendas (db_FIC_Painel)',
      detalhe: erroVendas.message,
    })
  }

  // ----- Banco do CRM: nomes, visitas e metas -----
  const mes = inicio.slice(0, 7)
  const proximoDia = new Date(`${fim}T00:00:00Z`)
  proximoDia.setUTCDate(proximoDia.getUTCDate() + 1)
  const fimExclusivo = proximoDia.toISOString().slice(0, 10)

  const [vendRes, chkRes, agRes, metasRes] = await Promise.all([
    crm.from('vendedores').select('cod_vendedor, nome'),
    crm.from('checkins')
      .select('cod_vendedor, status_visita')
      .gte('timestamp', `${inicio}T00:00:00Z`)
      .lt('timestamp', `${fimExclusivo}T00:00:00Z`)
      .limit(10000),
    crm.from('agendamentos')
      .select('cod_vendedor, status')
      .gte('data_visita', inicio)
      .lte('data_visita', fim)
      .limit(10000),
    crm.from('metas').select('*').eq('mes', mes),
  ])

  const nomes = new Map<string, string>()
  for (const v of vendRes.data || []) nomes.set(v.cod_vendedor, v.nome)

  const chk = (chkRes.data || []).filter(c => !filtroVendedor || c.cod_vendedor === filtroVendedor)
  const ag  = (agRes.data  || []).filter(a => !filtroVendedor || a.cod_vendedor === filtroVendedor)

  const visitas = {
    checkins: chk.length,
    realizadas: chk.filter(c => c.status_visita === 'realizada').length,
    agendadas: ag.length,
    pendentes: ag.filter(a => a.status === 'pendente').length,
  }

  // Realizado por vendedor: vendas do banco analítico + visitas do CRM
  interface PorVendedor { cod_vendedor: string; faturamento: number; caixas: number; positivados: number; pedidos: number }
  const porVendedor: PorVendedor[] = vendasData?.por_vendedor || []
  const vendasPorVendedor = new Map(porVendedor.map(v => [v.cod_vendedor, v]))
  const cadastros = new Map<string, number>(
    (vendasData?.cadastros || []).map((c: { cod_vendedor: string; qtd: number }) => [c.cod_vendedor, c.qtd])
  )

  const metas = (metasRes.data || [])
    .filter(m => !filtroVendedor || m.cod_vendedor === filtroVendedor)
    .map(m => {
      const v = vendasPorVendedor.get(m.cod_vendedor)
      return {
        ...m,
        nome: nomes.get(m.cod_vendedor) || m.cod_vendedor,
        real_visitas: chk.filter(c => c.cod_vendedor === m.cod_vendedor && c.status_visita === 'realizada').length,
        real_positivados: v?.positivados ?? 0,
        real_cadastros: cadastros.get(m.cod_vendedor) ?? 0,
        real_faturamento: v?.faturamento ?? 0,
        real_caixas: v?.caixas ?? 0,
      }
    })

  // Anexa nomes vindos do CRM aos recortes do banco analítico
  const comNome = <T extends { cod_vendedor: string }>(lista: T[]) =>
    lista.map(item => ({ ...item, nome: nomes.get(item.cod_vendedor) || item.cod_vendedor }))

  return res.status(200).json({
    role: vendedor.role,
    filtro_vendedor: filtroVendedor,
    ...vendasData,
    por_vendedor: comNome(porVendedor),
    esfriando: (vendasData?.esfriando || []).map((c: { nome: string | null; cod_cliente: string }) => ({
      ...c, nome: c.nome || c.cod_cliente,
    })),
    visitas,
    metas,
  })
}
