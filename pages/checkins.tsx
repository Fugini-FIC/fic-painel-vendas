// pages/checkins.tsx — check-ins e metas dos vendedores, lidos em tempo real
// do Supabase crm_fugini (via /api/checkins). Vendedor vê os próprios; master
// vê todos e filtra por vendedor.
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'

interface Vendedor { cod_vendedor: string; nome: string; role: string }
interface Checkin {
  id: string; cod_cliente: string; nome_cliente: string; cod_vendedor: string
  status_visita: string; observacao: string | null; timestamp: string
  tipo_estabelecimento: string | null
}
interface Meta {
  cod_vendedor: string; mes: string; fase: number
  meta_visitas: number; meta_positivados: number; meta_cadastros: number
  meta_faturamento: number; meta_caixas: number
}

const STATUS_COR: Record<string, string> = {
  realizada: '#0ca30c', reagendada: '#2a78d6', ausente: '#fab219',
  fechado: '#d03b3b', inexistente: '#898781',
}

function hoje() { return new Date().toISOString().slice(0, 10) }
function diasAtras(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }

export default function Checkins() {
  const router = useRouter()
  const [vendedor, setVendedor]     = useState<Vendedor | null>(null)
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [filtro, setFiltro]         = useState('')
  const [inicio, setInicio]         = useState(diasAtras(7))
  const [fim, setFim]               = useState(hoje())
  const [checkins, setCheckins]     = useState<Checkin[]>([])
  const [metas, setMetas]           = useState<Meta[]>([])
  const [loading, setLoading]       = useState(true)
  const [erro, setErro]             = useState('')

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data } = await supabase
        .from('vendedores').select('cod_vendedor, nome, role').eq('email', user.email).single()
      if (!data) { router.replace('/login'); return }
      setVendedor(data)
      if (data.role === 'master') {
        const { data: lista } = await supabase.from('vendedores').select('cod_vendedor, nome, role').order('nome')
        setVendedores(lista || [])
      }
    }
    init()
  }, [router])

  const carregar = useCallback(async () => {
    if (!vendedor) return
    setLoading(true); setErro('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/login'); return }
    const qs = new URLSearchParams({ inicio, fim })
    if (filtro) qs.set('cod_vendedor', filtro)
    try {
      const res = await fetch(`/api/checkins?${qs}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar')
      setCheckins(json.checkins || [])
      setMetas(json.metas || [])
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar check-ins')
      setCheckins([]); setMetas([])
    }
    setLoading(false)
  }, [vendedor, inicio, fim, filtro, router])

  useEffect(() => { carregar() }, [carregar])

  if (!vendedor) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: "'Segoe UI', sans-serif", color: '#888' }}>
      Carregando...
    </div>
  )

  return (
    <>
      <Head><title>Check-ins — Fugini CRM</title></Head>
      <div style={{ fontFamily: "'Segoe UI', sans-serif", background: '#f5f5f5', minHeight: '100vh' }}>

        <div style={{ background: '#1a1a2e', color: 'white', padding: '0 16px', height: 52,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/dash" style={{ textDecoration: 'none', color: 'white' }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>
              FUGINI<span style={{ color: '#D2001B' }}>.</span>CRM
              <span style={{ fontSize: 11, color: '#aaa', marginLeft: 10, fontWeight: 400 }}>Check-ins</span>
            </div>
          </a>
          <span style={{ fontSize: 12, color: '#ccc' }}>👤 {vendedor.nome}</span>
        </div>

        <div style={{ padding: 16, maxWidth: 720, margin: '0 auto' }}>
          <div style={{ fontSize: 11, color: '#898781', marginBottom: 10 }}>
            🔴 Ao vivo — lido direto do app de campo (Supabase), sem espera de sincronização
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <input type="date" value={inicio} onChange={e => setInicio(e.target.value)}
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13 }} />
            <input type="date" value={fim} onChange={e => setFim(e.target.value)}
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13 }} />
            {vendedor.role === 'master' && (
              <select value={filtro} onChange={e => setFiltro(e.target.value)} style={{
                padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13,
                background: 'white', cursor: 'pointer',
              }}>
                <option value="">Todos os vendedores</option>
                {vendedores.map(v => (
                  <option key={v.cod_vendedor} value={v.cod_vendedor}>{v.nome} ({v.cod_vendedor})</option>
                ))}
              </select>
            )}
          </div>

          {erro && (
            <div style={{ background: 'white', borderRadius: 10, padding: '12px 14px', marginBottom: 12,
              borderLeft: '4px solid #d03b3b', color: '#7a1f1f', fontSize: 13 }}>⚠️ {erro}</div>
          )}

          {/* Metas do mês */}
          {metas.length > 0 && (
            <div style={{ background: 'white', borderRadius: 10, padding: '12px 14px', marginBottom: 14,
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 }}>
                Meta de visitas — {metas[0].mes}
              </div>
              {metas.map(m => (
                <div key={m.cod_vendedor} style={{ fontSize: 12, color: '#52514e', padding: '4px 0' }}>
                  {vendedor.role === 'master' && <b>{m.cod_vendedor}</b>} Visitas: {checkins.filter(c => c.cod_vendedor === m.cod_vendedor).length} / {m.meta_visitas}
                  {' · '}Positivados: {m.meta_positivados} · Cadastros: {m.meta_cadastros}
                </div>
              ))}
            </div>
          )}

          {/* Lista de check-ins */}
          {loading ? (
            <div style={{ textAlign: 'center', color: '#bbb', padding: 32 }}>Carregando...</div>
          ) : checkins.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#bbb', padding: 32 }}>Nenhum check-in no período</div>
          ) : checkins.map(c => (
            <div key={c.id} style={{
              background: 'white', borderRadius: 10, padding: '12px 14px', marginBottom: 8,
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              borderLeft: `3px solid ${STATUS_COR[c.status_visita] || '#898781'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#222' }}>{c.nome_cliente}</div>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, marginLeft: 8,
                  whiteSpace: 'nowrap',
                  background: `${STATUS_COR[c.status_visita] || '#898781'}22`,
                  color: STATUS_COR[c.status_visita] || '#898781',
                }}>{c.status_visita}</span>
              </div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                Cód: {c.cod_cliente}
                {vendedor.role === 'master' && <> · Vendedor: {c.cod_vendedor}</>}
                {c.tipo_estabelecimento && <> · {c.tipo_estabelecimento}</>}
                {' · '}{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(c.timestamp))}
              </div>
              {c.observacao && (
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{c.observacao}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
