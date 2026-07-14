// pages/api/clientes.ts — carteira de clientes + cadastro de novos
// GET   /api/clientes?status=ativo&canal=varejo&busca=merc  (vendedor vê só a própria carteira)
// POST  /api/clientes  — cadastra novo cliente (origem 'crm')
// PATCH /api/clientes?cod_cliente=X — atualiza status/canal/limite (só master)
// Auth: Bearer token obrigatório (banco do CRM).
// Dados: a tabela clientes vive no banco analítico (db_FIC_Painel).
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireVendedor, supabaseAdmin } from '@/lib/authApi'
import { supabasePainel } from '@/lib/painelDb'

const CANAIS = ['varejo', 'atacado', 'food service', 'distribuidor', 'outro']

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const crm = supabaseAdmin()
  const vendedor = await requireVendedor(req, res, crm)
  if (!vendedor) return
  const admin = supabasePainel()

  // GET — lista carteira
  if (req.method === 'GET') {
    const { status, canal, busca, cod_vendedor } = req.query
    let query = admin
      .from('clientes')
      .select('cod_cliente, nome, cnpj, canal, cidade, uf, cod_vendedor, status, limite_credito, origem, data_cadastro')
      .order('nome', { ascending: true })
      .limit(500)

    // vendedor comum: sempre restrito à própria carteira
    if (vendedor.role !== 'master') {
      query = query.eq('cod_vendedor', vendedor.cod_vendedor)
    } else if (typeof cod_vendedor === 'string' && cod_vendedor) {
      query = query.eq('cod_vendedor', cod_vendedor)
    }
    if (typeof status === 'string' && ['ativo', 'inativo'].includes(status)) {
      query = query.eq('status', status)
    }
    if (typeof canal === 'string' && canal) query = query.eq('canal', canal)
    if (typeof busca === 'string' && busca.trim()) {
      const termo = busca.trim().replace(/[%,()]/g, '')
      query = query.or(`nome.ilike.%${termo}%,cod_cliente.ilike.%${termo}%,cnpj.ilike.%${termo}%`)
    }

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // POST — cadastro de novo cliente
  if (req.method === 'POST') {
    const { cod_cliente, nome, cnpj, canal, cidade, uf, endereco, limite_credito } = req.body || {}

    if (!cod_cliente || !nome) {
      return res.status(400).json({ error: 'Campos obrigatórios: cod_cliente, nome' })
    }
    if (canal && !CANAIS.includes(canal)) {
      return res.status(400).json({ error: `Canal inválido. Use: ${CANAIS.join(', ')}` })
    }
    if (cnpj && !/^\d{14}$/.test(String(cnpj).replace(/\D/g, ''))) {
      return res.status(400).json({ error: 'CNPJ inválido (14 dígitos)' })
    }

    // Novo cliente entra na carteira de quem cadastra; master pode indicar o dono
    const dono = vendedor.role === 'master' && req.body.cod_vendedor
      ? String(req.body.cod_vendedor)
      : vendedor.cod_vendedor

    const { data, error } = await admin
      .from('clientes')
      .insert([{
        cod_cliente: String(cod_cliente).trim(),
        nome: String(nome).trim(),
        cnpj: cnpj ? String(cnpj).replace(/\D/g, '') : null,
        canal: canal || null,
        cidade: cidade || null,
        uf: uf ? String(uf).toUpperCase().slice(0, 2) : null,
        endereco: endereco || null,
        limite_credito: Number(limite_credito) || 0,
        cod_vendedor: dono,
        status: 'ativo',
        origem: 'crm',
      }])
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Já existe cliente com este código' })
      }
      return res.status(500).json({ error: error.message })
    }
    return res.status(201).json(data)
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
    const { status, canal, limite_credito, cod_vendedor: novoDono } = req.body || {}
    const updates: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
    if (status && ['ativo', 'inativo'].includes(status)) updates.status = status
    if (canal && CANAIS.includes(canal)) updates.canal = canal
    if (limite_credito !== undefined) updates.limite_credito = Number(limite_credito) || 0
    if (novoDono) updates.cod_vendedor = String(novoDono)

    const { data, error } = await admin
      .from('clientes')
      .update(updates)
      .eq('cod_cliente', cod_cliente)
      .select()

    if (error) return res.status(500).json({ error: error.message })
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado' })
    }
    return res.status(200).json(data[0])
  }

  return res.status(405).json({ error: 'Método não permitido' })
}
