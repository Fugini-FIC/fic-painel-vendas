// pages/clientes.tsx — carteira de clientes + cadastro de novos
// Vendedor vê e cadastra na própria carteira; master vê tudo.
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'

const CANAIS = ['varejo', 'atacado', 'food service', 'distribuidor', 'outro']

interface Vendedor { cod_vendedor: string; nome: string; role: string }
interface Cliente {
  cod_cliente: string; nome: string; cnpj: string | null; canal: string | null
  cidade: string | null; uf: string | null; cod_vendedor: string | null
  status: string; limite_credito: number; origem: string; data_cadastro: string
}

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const FORM_INICIAL = {
  cod_cliente: '', nome: '', cnpj: '', canal: '', cidade: '', uf: '', endereco: '', limite_credito: '',
}

export default function Clientes() {
  const router = useRouter()
  const [vendedor, setVendedor]   = useState<Vendedor | null>(null)
  const [clientes, setClientes]   = useState<Cliente[]>([])
  const [loading, setLoading]     = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('')
  const [busca, setBusca]         = useState('')
  const [modal, setModal]         = useState(false)
  const [form, setForm]           = useState(FORM_INICIAL)
  const [salvando, setSalvando]   = useState(false)
  const [msg, setMsg]             = useState('')

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data } = await supabase
        .from('vendedores')
        .select('cod_vendedor, nome, role')
        .eq('email', user.email)
        .single()
      if (data) setVendedor(data)
    }
    init()
  }, [router])

  const carregar = useCallback(async () => {
    if (!vendedor) return
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/login'); return }
    const qs = new URLSearchParams()
    if (filtroStatus) qs.set('status', filtroStatus)
    if (busca.trim()) qs.set('busca', busca.trim())
    const res = await fetch(`/api/clientes?${qs}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const data = await res.json()
    setClientes(res.ok && Array.isArray(data) ? data : [])
    setLoading(false)
  }, [vendedor, filtroStatus, busca, router])

  useEffect(() => { carregar() }, [carregar])

  async function salvar() {
    if (salvando) return
    if (!form.cod_cliente.trim() || !form.nome.trim()) {
      setMsg('Informe ao menos código e nome do cliente.'); return
    }
    setSalvando(true); setMsg('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/login'); return }
    const res = await fetch('/api/clientes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        ...form,
        limite_credito: form.limite_credito ? Number(form.limite_credito) : 0,
        canal: form.canal || undefined,
      }),
    })
    const data = await res.json()
    setSalvando(false)
    if (!res.ok) { setMsg(data.error || 'Erro ao salvar'); return }
    setModal(false)
    setForm(FORM_INICIAL)
    carregar()
  }

  if (!vendedor) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: "'Segoe UI', sans-serif", color: '#888' }}>
      Carregando...
    </div>
  )

  return (
    <>
      <Head><title>Clientes — Fugini CRM</title></Head>
      <div style={{ fontFamily: "'Segoe UI', sans-serif", background: '#f5f5f5', minHeight: '100vh' }}>

        <div style={{ background: '#1a1a2e', color: 'white', padding: '0 16px', height: 52,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/dash" style={{ textDecoration: 'none', color: 'white' }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>
              FUGINI<span style={{ color: '#D2001B' }}>.</span>CRM
              <span style={{ fontSize: 11, color: '#aaa', marginLeft: 10, fontWeight: 400 }}>Clientes</span>
            </div>
          </a>
          <span style={{ fontSize: 12, color: '#ccc' }}>👤 {vendedor.nome}</span>
        </div>

        <div style={{ padding: 16, maxWidth: 720, margin: '0 auto' }}>

          {/* Ações e filtros */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <button onClick={() => { setModal(true); setMsg('') }} style={{
              background: '#D2001B', color: 'white', border: 'none', borderRadius: 8,
              padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>➕ Novo cliente</button>
            <input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar nome, código ou CNPJ..."
              style={{ flex: 1, minWidth: 160, padding: '10px 12px', borderRadius: 8,
                border: '1px solid #ddd', fontSize: 13 }} />
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd',
                fontSize: 13, background: 'white', cursor: 'pointer' }}>
              <option value="">Todos</option>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
            </select>
          </div>

          {/* Lista */}
          {loading ? (
            <div style={{ textAlign: 'center', color: '#bbb', padding: 32 }}>Carregando...</div>
          ) : clientes.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#bbb', padding: 32 }}>
              Nenhum cliente encontrado
            </div>
          ) : clientes.map(c => (
            <div key={c.cod_cliente} style={{
              background: 'white', borderRadius: 10, padding: '12px 14px', marginBottom: 8,
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              borderLeft: `3px solid ${c.status === 'ativo' ? '#0ca30c' : '#d03b3b'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#222' }}>{c.nome}</div>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, marginLeft: 8,
                  whiteSpace: 'nowrap',
                  background: c.status === 'ativo' ? '#0ca30c22' : '#d03b3b22',
                  color: c.status === 'ativo' ? '#0ca30c' : '#d03b3b',
                }}>{c.status === 'ativo' ? 'Ativo' : 'Inativo'}</span>
              </div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                Cód: {c.cod_cliente}
                {c.cnpj && <> · CNPJ: {c.cnpj}</>}
                {c.canal && <> · {c.canal}</>}
                {c.cidade && <> · {c.cidade}{c.uf ? `/${c.uf}` : ''}</>}
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                Vendedor: {c.cod_vendedor || '—'}
                {c.limite_credito > 0 && <> · Limite: {fmtBRL.format(c.limite_credito)}</>}
                {c.origem === 'crm' && <span style={{ color: '#2a78d6' }}> · cadastrado no CRM</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Modal de cadastro */}
        {modal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 }}>
            <div style={{ background: 'white', borderRadius: 12, padding: 20, width: '100%', maxWidth: 420,
              maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', marginBottom: 14 }}>
                Novo cliente
              </div>

              <Campo label="Código do cliente *" valor={form.cod_cliente}
                onChange={v => setForm(f => ({ ...f, cod_cliente: v }))} placeholder="ex: 12345" />
              <Campo label="Nome / Razão social *" valor={form.nome}
                onChange={v => setForm(f => ({ ...f, nome: v }))} placeholder="ex: Mercado Central Ltda" />
              <Campo label="CNPJ" valor={form.cnpj}
                onChange={v => setForm(f => ({ ...f, cnpj: v }))} placeholder="somente números" />

              <div style={{ marginBottom: 10 }}>
                <div style={labelStyle}>Canal</div>
                <select value={form.canal} onChange={e => setForm(f => ({ ...f, canal: e.target.value }))}
                  style={{ ...inputStyle, background: 'white' }}>
                  <option value="">Selecione...</option>
                  {CANAIS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
                <Campo label="Cidade" valor={form.cidade}
                  onChange={v => setForm(f => ({ ...f, cidade: v }))} />
                <Campo label="UF" valor={form.uf}
                  onChange={v => setForm(f => ({ ...f, uf: v }))} placeholder="SP" />
              </div>
              <Campo label="Endereço" valor={form.endereco}
                onChange={v => setForm(f => ({ ...f, endereco: v }))} />
              <Campo label="Limite de crédito (R$)" valor={form.limite_credito}
                onChange={v => setForm(f => ({ ...f, limite_credito: v.replace(/[^\d.,]/g, '') }))} placeholder="0" />

              {msg && <div style={{ fontSize: 12, color: '#d03b3b', marginBottom: 10 }}>{msg}</div>}

              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button onClick={salvar} disabled={salvando} style={{
                  flex: 1, background: salvando ? '#ccc' : '#D2001B', color: 'white', border: 'none',
                  borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 600,
                  cursor: salvando ? 'not-allowed' : 'pointer',
                }}>{salvando ? 'Salvando...' : 'Salvar cliente'}</button>
                <button onClick={() => setModal(false)} style={{
                  background: 'none', color: '#888', border: '1px solid #ddd', borderRadius: 8,
                  padding: '11px 16px', fontSize: 13, cursor: 'pointer',
                }}>Cancelar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function Campo({ label, valor, onChange, placeholder }:
  { label: string; valor: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={labelStyle}>{label}</div>
      <input value={valor} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={inputStyle} />
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#52514e', marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid #ddd',
  fontSize: 13, boxSizing: 'border-box',
}
