// pages/api/clientes.ts — carteira de clientes + cadastro de novos (dw_fugini).
// GET   /api/clientes?canal=varejo&busca=merc  (vendedor vê só a própria carteira)
// POST  /api/clientes  — cadastra novo cliente (origem 'crm')
// PATCH /api/clientes?cod_cliente=X — atualiza canal/limite/dono (só master)
// Auth: Bearer token obrigatório. Dados em mart.clientes (dw_fugini).
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireVendedor } from '@/lib/authApi'
import { dw } from '@/lib/dwdb'

const EMPRESA = 'fugini'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const vendedor = await requireVendedor(req, res)
  if (!vendedor) return

  // GET — lista carteira
  if (req.method === 'GET') {
    const { canal, busca, cod_vendedor } = req.query
    const cond: string[] = ['empresa = $1']
    const args: unknown[] = [EMPRESA]

    if (vendedor.role !== 'master') {
      args.push(vendedor.cod_vendedor); cond.push(`cod_vendedor = $${args.length}`)
    } else if (typeof cod_vendedor === 'string' && cod_vendedor) {
      args.push(cod_vendedor); cond.push(`cod_vendedor = $${args.length}`)
    }
    if (typeof canal === 'string' && canal) {
      args.push(canal); cond.push(`canal = $${args.length}`)
    }
    if (typeof busca === 'string' && busca.trim()) {
      args.push(`%${busca.trim()}%`)
      cond.push(`(nome ilike $${args.length} or cod_cliente ilike $${args.length} or cnpj ilike $${args.length})`)
    }
    const r = await dw().query(
      `select cod_cliente, nome, cnpj, canal, cidade, uf, cod_vendedor,
              limite_credito, credito_suspenso
       from mart.clientes where ${cond.join(' and ')} order by nome limit 500`, args)
    return res.status(200).json(r.rows)
  }

  // POST — cadastro de novo cliente (origem crm)
  if (req.method === 'POST') {
    const { cod_cliente, nome, cnpj, canal, cidade, uf, limite_credito } = req.body || {}
    if (!cod_cliente || !nome) {
      return res.status(400).json({ error: 'Campos obrigatórios: cod_cliente, nome' })
    }
    if (cnpj && !/^\d{14}$/.test(String(cnpj).replace(/\D/g, ''))) {
      return res.status(400).json({ error: 'CNPJ inválido (14 dígitos)' })
    }
    const dono = vendedor.role === 'master' && req.body.cod_vendedor
      ? String(req.body.cod_vendedor) : vendedor.cod_vendedor
    try {
      const r = await dw().query(
        `insert into mart.clientes
           (empresa, cod_cliente, nome, cnpj, canal, cidade, uf, cod_vendedor, limite_credito)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
        [EMPRESA, String(cod_cliente).trim(), String(nome).trim(),
         cnpj ? String(cnpj).replace(/\D/g, '') : null, canal || null, cidade || null,
         uf ? String(uf).toUpperCase().slice(0, 2) : null, dono, Number(limite_credito) || 0])
      return res.status(201).json(r.rows[0])
    } catch (e) {
      const err = e as { code?: string }
      if (err.code === '23505') return res.status(409).json({ error: 'Já existe cliente com este código' })
      return res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
    }
  }

  // PATCH — atualização (gestor)
  if (req.method === 'PATCH') {
    if (vendedor.role !== 'master') {
      return res.status(403).json({ error: 'Apenas o gestor altera cadastros' })
    }
    const { cod_cliente } = req.query
    if (typeof cod_cliente !== 'string' || !cod_cliente) {
      return res.status(400).json({ error: 'cod_cliente obrigatório' })
    }
    const { canal, limite_credito, cod_vendedor: novoDono } = req.body || {}
    const sets: string[] = []
    const args: unknown[] = []
    if (canal) { args.push(canal); sets.push(`canal = $${args.length}`) }
    if (limite_credito !== undefined) { args.push(Number(limite_credito) || 0); sets.push(`limite_credito = $${args.length}`) }
    if (novoDono) { args.push(String(novoDono)); sets.push(`cod_vendedor = $${args.length}`) }
    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar' })
    args.push(EMPRESA, cod_cliente)
    const r = await dw().query(
      `update mart.clientes set ${sets.join(', ')}
       where empresa = $${args.length - 1} and cod_cliente = $${args.length} returning *`, args)
    if (!r.rows.length) return res.status(404).json({ error: 'Cliente não encontrado' })
    return res.status(200).json(r.rows[0])
  }

  return res.status(405).json({ error: 'Método não permitido' })
}
