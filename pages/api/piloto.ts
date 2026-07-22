// pages/api/piloto.ts — piloto com 5 vendedores específicos (cod-rep 6003-6007).
// GET /api/piloto — pedidos (ped-venda/ped-item), cadastros (wt_cliente_repres)
// e check-ins (Supabase crm_fugini, já sincronizado em crm.checkins), tudo
// hard-scoped nesses 5. Só master acessa (visão comparativa entre vendedores).
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireVendedor } from '@/lib/authApi'
import { dw } from '@/lib/dwdb'

const VENDEDORES = [
  { cod_rep: '6003', nome: 'Johnny', cod_vendedor_crm: 'SC01' },
  { cod_rep: '6004', nome: 'Simone', cod_vendedor_crm: 'SP03' },
  { cod_rep: '6005', nome: 'Robson', cod_vendedor_crm: 'SP02' },
  { cod_rep: '6006', nome: 'Wesley', cod_vendedor_crm: 'SP04' },
  { cod_rep: '6007', nome: 'João',   cod_vendedor_crm: 'SP01' },
]

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' })
  }
  const vendedor = await requireVendedor(req, res, ['master'])
  if (!vendedor) return

  const codsRep = VENDEDORES.map(v => v.cod_rep)
  const codsCrm = VENDEDORES.map(v => v.cod_vendedor_crm)

  const [pedidos, cadastros, checkins] = await Promise.all([
    dw().query(
      `select r.cod_rep, count(*) itens, sum(p.valor_total_venda) valor
       from raw.pedidos p
       join raw.repres r on r.empresa = 'fugini' and r.nome_abrev = p.representante
       where r.cod_rep = any($1)
       group by r.cod_rep`,
      [codsRep]),
    dw().query(
      `select cod_rep, count(*) qtd
       from raw.cadastros where cod_rep = any($1)
       group by cod_rep`,
      [codsRep]),
    dw().query(
      `select cod_vendedor, count(*) qtd
       from crm.checkins where cod_vendedor = any($1)
       group by cod_vendedor`,
      [codsCrm]),
  ])

  const porRep = <T extends { cod_rep: string }>(rows: T[]) =>
    Object.fromEntries(rows.map(r => [r.cod_rep, r]))
  const pedidosPorRep = porRep(pedidos.rows)
  const cadastrosPorRep = porRep(cadastros.rows)
  const checkinsPorCrm = Object.fromEntries(checkins.rows.map(r => [r.cod_vendedor, r]))

  const linhas = VENDEDORES.map(v => ({
    cod_rep: v.cod_rep,
    nome: v.nome,
    pedidos_itens: Number(pedidosPorRep[v.cod_rep]?.itens ?? 0),
    pedidos_valor: Number(pedidosPorRep[v.cod_rep]?.valor ?? 0),
    cadastros: Number(cadastrosPorRep[v.cod_rep]?.qtd ?? 0),
    checkins: Number(checkinsPorCrm[v.cod_vendedor_crm]?.qtd ?? 0),
  }))

  return res.status(200).json({ vendedores: linhas })
}
