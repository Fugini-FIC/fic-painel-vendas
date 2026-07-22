// pages/piloto.tsx — piloto com 5 vendedores específicos (Johnny, Simone,
// Robson, Wesley, João). 3 abas: Vendas (pedidos via Progress), Cadastros
// (clientes novos cadastrados em campo) e Check-ins (Supabase crm_fugini).
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'

interface Vendedor { cod_vendedor: string; nome: string; role: string }
interface Linha {
  cod_rep: string; nome: string
  pedidos_itens: number; pedidos_valor: number
  cadastros: number; checkins: number
}

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })
const fmtNum = new Intl.NumberFormat('pt-BR')

const ABAS = [
  { id: 'vendas',    label: '💰 Vendas' },
  { id: 'cadastros', label: '📋 Cadastros' },
  { id: 'checkins',  label: '📍 Check-ins' },
] as const
type AbaId = typeof ABAS[number]['id']

export default function Piloto() {
  const router = useRouter()
  const [vendedor, setVendedor] = useState<Vendedor | null>(null)
  const [linhas, setLinhas]     = useState<Linha[]>([])
  const [aba, setAba]           = useState<AbaId>('vendas')
  const [loading, setLoading]   = useState(true)
  const [erro, setErro]         = useState('')

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data } = await supabase
        .from('vendedores').select('cod_vendedor, nome, role').eq('email', user.email).single()
      if (!data) { router.replace('/login'); return }
      setVendedor(data)
    }
    init()
  }, [router])

  const carregar = useCallback(async () => {
    if (!vendedor) return
    setLoading(true); setErro('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/login'); return }
    try {
      const res = await fetch('/api/piloto', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar')
      setLinhas(json.vendedores || [])
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar dados do piloto')
      setLinhas([])
    }
    setLoading(false)
  }, [vendedor, router])

  useEffect(() => { carregar() }, [carregar])

  if (!vendedor) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: "'Segoe UI', sans-serif", color: '#888' }}>
      Carregando...
    </div>
  )

  const totalPedidos   = linhas.reduce((s, l) => s + l.pedidos_itens, 0)
  const totalValor     = linhas.reduce((s, l) => s + l.pedidos_valor, 0)
  const totalCadastros = linhas.reduce((s, l) => s + l.cadastros, 0)
  const totalCheckins  = linhas.reduce((s, l) => s + l.checkins, 0)

  return (
    <>
      <Head><title>Piloto — Fugini CRM</title></Head>
      <div style={{ fontFamily: "'Segoe UI', sans-serif", background: '#f5f5f5', minHeight: '100vh' }}>

        <div style={{ background: '#1a1a2e', color: 'white', padding: '0 16px', height: 52,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/dash" style={{ textDecoration: 'none', color: 'white' }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>
              FUGINI<span style={{ color: '#D2001B' }}>.</span>CRM
              <span style={{ fontSize: 11, color: '#aaa', marginLeft: 10, fontWeight: 400 }}>Piloto — 5 vendedores</span>
            </div>
          </a>
          <span style={{ fontSize: 12, color: '#ccc' }}>👤 {vendedor.nome}</span>
        </div>

        <div style={{ padding: 16, maxWidth: 720, margin: '0 auto' }}>

          {vendedor.role !== 'master' ? (
            <div style={{ background: 'white', borderRadius: 10, padding: '12px 14px',
              borderLeft: '4px solid #d03b3b', color: '#7a1f1f', fontSize: 13 }}>
              ⚠️ Essa visão comparativa é restrita ao gestor.
            </div>
          ) : (
            <>
              {/* Abas */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {ABAS.map(a => (
                  <button key={a.id} onClick={() => setAba(a.id)} style={{
                    flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: aba === a.id ? '#1a1a2e' : 'white',
                    color: aba === a.id ? 'white' : '#1a1a2e',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  }}>{a.label}</button>
                ))}
              </div>

              {erro && (
                <div style={{ background: 'white', borderRadius: 10, padding: '12px 14px', marginBottom: 12,
                  borderLeft: '4px solid #d03b3b', color: '#7a1f1f', fontSize: 13 }}>⚠️ {erro}</div>
              )}

              {loading ? (
                <div style={{ textAlign: 'center', color: '#bbb', padding: 32 }}>Carregando...</div>
              ) : (
                <div style={{ background: 'white', borderRadius: 10, padding: '12px 14px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>

                  {aba === 'vendas' && (
                    <>
                      <TituloAba t="Pedidos (ped-venda / ped-item)" total={`${fmtNum.format(totalPedidos)} itens · ${fmtBRL.format(totalValor)}`} />
                      {linhas.map(l => (
                        <LinhaTabela key={l.cod_rep} nome={l.nome} cod={l.cod_rep}
                          valor={`${fmtNum.format(l.pedidos_itens)} itens`}
                          sub={fmtBRL.format(l.pedidos_valor)} vazio={l.pedidos_itens === 0} />
                      ))}
                    </>
                  )}

                  {aba === 'cadastros' && (
                    <>
                      <TituloAba t="Cadastros de clientes novos" total={`${fmtNum.format(totalCadastros)} cadastros`} />
                      {linhas.map(l => (
                        <LinhaTabela key={l.cod_rep} nome={l.nome} cod={l.cod_rep}
                          valor={`${fmtNum.format(l.cadastros)} cadastros`} vazio={l.cadastros === 0} />
                      ))}
                    </>
                  )}

                  {aba === 'checkins' && (
                    <>
                      <TituloAba t="Check-ins de campo" total={`${fmtNum.format(totalCheckins)} check-ins`} />
                      {linhas.map(l => (
                        <LinhaTabela key={l.cod_rep} nome={l.nome} cod={l.cod_rep}
                          valor={`${fmtNum.format(l.checkins)} check-ins`} vazio={l.checkins === 0} />
                      ))}
                    </>
                  )}
                </div>
              )}

              <div style={{ fontSize: 11, color: '#bbb', textAlign: 'center', margin: '16px 0' }}>
                Piloto restrito a Johnny, Simone, Robson, Wesley e João (cod-rep 6003-6007)
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function TituloAba({ t, total }: { t: string; total: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e' }}>{t}</span>
      <span style={{ fontSize: 12, color: '#898781' }}>{total}</span>
    </div>
  )
}

function LinhaTabela({ nome, cod, valor, sub, vazio }:
  { nome: string; cod: string; valor: string; sub?: string; vazio?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '9px 0', borderBottom: '1px solid #f7f7f6' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: vazio ? '#bbb' : '#0b0b0b' }}>{nome}</div>
        <div style={{ fontSize: 11, color: '#898781' }}>cod-rep {cod}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: vazio ? '#bbb' : '#0b0b0b' }}>{valor}</div>
        {sub && <div style={{ fontSize: 11, color: '#898781' }}>{sub}</div>}
      </div>
    </div>
  )
}
