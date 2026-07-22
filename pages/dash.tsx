// pages/dash.tsx — Painel do Gestor (gestores e diretoria)
// KPIs de vendas, carteira, metas e visitas. Vendedor comum vê só os
// próprios números; master vê o consolidado e filtra por vendedor.
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// Paleta categórica validada (dataviz) — identidade fixa por série
const COR = {
  faturamento: '#2a78d6', // azul
  caixas:      '#1baf7a', // aqua
  clientes:    '#4a3aa7', // violeta
  visitas:     '#eb6834', // laranja
}
const COR_CANAL = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834']
const STATUS = { good: '#0ca30c', warning: '#fab219', critical: '#d03b3b' }

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtNum = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const fmtDec = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

interface Vendedor { cod_vendedor: string; nome: string; role: string }

interface DashData {
  role: string
  filtro_vendedor: string | null
  dados_ate: string | null
  anterior: { faturamento_total: number; caixas_total: number; clientes_positivados: number }
  resumo: {
    faturamento_total: number; devolucoes: number; caixas_total: number; caixas_bonificadas: number
    pedidos: number; notas: number; clientes_positivados: number; media_skus_pedido: number
    ticket_medio: number; preco_medio_caixa: number; drop_size: number
  }
  faturamento_hoje: number
  caixas_hoje: number
  carteira: {
    total: number; ativos: number; inativos: number; nunca_compraram: number
    pct_ativos: number; pct_positivacao: number; limite_credito_total: number
    suspensos: number; limite_suspenso: number
  }
  esfriando: { cod_cliente: string; nome: string; cod_vendedor: string; dias_sem_compra: number; faturamento_6m: number }[]
  por_canal: { canal: string; qtd: number; pct: number; faturamento: number; caixas: number }[]
  por_vendedor: { cod_vendedor: string; nome: string; faturamento: number; caixas: number; positivados: number; pedidos: number }[]
  por_familia: { familia: string; faturamento: number; caixas: number; pdvs: number }[]
  por_dia: { dia: string; faturamento: number; caixas: number }[]
  por_campanha: { nome: string; data_inicio: string; data_fim: string; faturamento: number; caixas: number }[]
  visitas: { checkins: number; realizadas: number; agendadas: number; pendentes: number }
  pedidos: {
    carteira_aberta: { valor: number; caixas: number; pedidos: number; itens: number }
    fill_rate: { caixas_faturadas: number; caixas_cortadas: number; valor_cortado: number; pct: number | null }
    corte_por_motivo: { motivo: string; caixas: number; valor: number }[]
    carteira_por_vendedor: { cod_vendedor: string; nome: string; valor: number; caixas: number; pedidos: number }[]
  } | null
  metas: {
    cod_vendedor: string; nome: string; fase: number
    meta_visitas: number; meta_positivados: number; meta_cadastros: number
    meta_faturamento: number; meta_caixas: number
    real_visitas: number; real_positivados: number; real_cadastros: number
    real_faturamento: number; real_caixas: number
  }[]
}

function mesRange(d: Date): { inicio: string; fim: string } {
  const y = d.getFullYear(), m = d.getMonth()
  const ultimo = new Date(y, m + 1, 0).getDate()
  const mm = String(m + 1).padStart(2, '0')
  return { inicio: `${y}-${mm}-01`, fim: `${y}-${mm}-${String(ultimo).padStart(2, '0')}` }
}

export default function Dash() {
  const router = useRouter()
  const [vendedor, setVendedor]     = useState<Vendedor | null>(null)
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [filtro, setFiltro]         = useState('')
  const [mesAtual, setMesAtual]     = useState(new Date())
  const [dados, setDados]           = useState<DashData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [erro, setErro]             = useState('')

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data } = await supabase
        .from('vendedores')
        .select('cod_vendedor, nome, role')
        .eq('email', user.email)
        .single()
      if (!data) { router.replace('/login'); return }
      setVendedor(data)
      if (data.role === 'master') {
        const { data: lista } = await supabase
          .from('vendedores')
          .select('cod_vendedor, nome, role')
          .order('nome')
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
    const { inicio, fim } = mesRange(mesAtual)
    const qs = new URLSearchParams({ inicio, fim })
    if (filtro) qs.set('cod_vendedor', filtro)
    try {
      const res = await fetch(`/api/dash?${qs}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar')
      setDados(json)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar indicadores')
      setDados(null)
    }
    setLoading(false)
  }, [vendedor, mesAtual, filtro, router])

  useEffect(() => { carregar() }, [carregar])

  function mudarMes(delta: number) {
    setMesAtual(m => { const n = new Date(m); n.setMonth(n.getMonth() + delta); return n })
  }

  if (!vendedor) return <Tela msg="Carregando..." />

  const r = dados?.resumo
  const cart = dados?.carteira
  const vis = dados?.visitas
  const maxVend = Math.max(1, ...(dados?.por_vendedor || []).map(v => v.faturamento))
  const maxFam  = Math.max(1, ...(dados?.por_familia  || []).map(f => f.faturamento))
  const maxDia  = Math.max(1, ...(dados?.por_dia      || []).map(d => d.faturamento))
  const usoLimite = cart && cart.limite_credito_total > 0 && r
    ? Math.round(100 * r.faturamento_total / cart.limite_credito_total) : null

  // Projeção de fechamento (run-rate) — só quando o mês exibido é o corrente
  const agora = new Date()
  const mesCorrente = mesAtual.getFullYear() === agora.getFullYear() && mesAtual.getMonth() === agora.getMonth()
  const diasNoMes = new Date(mesAtual.getFullYear(), mesAtual.getMonth() + 1, 0).getDate()
  const projecao = mesCorrente && r && agora.getDate() > 0
    ? (r.faturamento_total / agora.getDate()) * diasNoMes : null

  // Variação % vs período anterior de mesma duração
  const delta = (atual: number, ant: number): string | null =>
    ant > 0 ? `${atual >= ant ? '▲' : '▼'} ${fmtDec.format(Math.abs(100 * (atual - ant) / ant))}% vs anterior` : null
  const dadosAte = dados?.dados_ate
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })
        .format(new Date(dados.dados_ate))
    : null

  return (
    <>
      <Head><title>Painel do Gestor — Fugini CRM</title></Head>
      <div style={{ fontFamily: "'Segoe UI', sans-serif", background: '#f5f5f5', minHeight: '100vh' }}>
        <Header nome={vendedor.nome} onSair={async () => {
          await supabase.auth.signOut(); localStorage.removeItem('cod_vendedor'); router.replace('/login')
        }} />

        <div style={{ padding: 16, maxWidth: 1100, margin: '0 auto' }}>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', marginBottom: 0 }}>
              <button onClick={() => mudarMes(-1)} style={navBtn}>‹</button>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', minWidth: 130, textAlign: 'center' }}>
                {MESES[mesAtual.getMonth()]} {mesAtual.getFullYear()}
              </div>
              <button onClick={() => mudarMes(1)} style={navBtn}>›</button>
            </div>
            {vendedor.role === 'master' && (
              <select value={filtro} onChange={e => setFiltro(e.target.value)} style={{
                ...cardStyle, padding: '10px 12px', fontSize: 13, border: 'none', marginBottom: 0,
                color: '#1a1a2e', cursor: 'pointer',
              }}>
                <option value="">Todos os vendedores</option>
                {vendedores.map(v => (
                  <option key={v.cod_vendedor} value={v.cod_vendedor}>{v.nome} ({v.cod_vendedor})</option>
                ))}
              </select>
            )}
            <a href="/clientes" style={{ ...cardStyle, padding: '10px 14px', fontSize: 13, fontWeight: 600,
              color: '#1a1a2e', textDecoration: 'none', marginBottom: 0 }}>➕ Clientes</a>
            <a href="/checkins" style={{ ...cardStyle, padding: '10px 14px', fontSize: 13, fontWeight: 600,
              color: '#1a1a2e', textDecoration: 'none', marginBottom: 0 }}>📍 Check-ins</a>
            <a href="/piloto" style={{ ...cardStyle, padding: '10px 14px', fontSize: 13, fontWeight: 600,
              color: '#1a1a2e', textDecoration: 'none', marginBottom: 0 }}>🧪 Piloto</a>
          </div>

          {erro && (
            <div style={{ ...cardStyle, borderLeft: `4px solid ${STATUS.critical}`, color: '#7a1f1f' }}>
              ⚠️ {erro} — verifique se a migração <code>PAINEL/001_estrutura.sql</code> foi aplicada no Supabase.
            </div>
          )}
          {loading && <Tela msg="Calculando indicadores..." inline />}

          {!loading && dados && r && cart && (
            <>
              {/* ===== Faturamento e volume ===== */}
              <Secao titulo="💰 Vendas do período" />
              {dadosAte && (
                <div style={{ fontSize: 11, color: '#898781', marginBottom: 8 }}>
                  🔄 Dados de venda sincronizados até {dadosAte} (ERP → painel via ETL)
                </div>
              )}
              <div style={gridTiles}>
                <Tile label="Faturamento líquido (mês)" valor={fmtBRL.format(r.faturamento_total)} cor={COR.faturamento}
                  sub={delta(r.faturamento_total, dados.anterior?.faturamento_total ?? 0) ?? undefined} />
                <Tile label="Faturamento hoje" valor={fmtBRL.format(dados.faturamento_hoje)} cor={COR.faturamento} />
                {projecao !== null && (
                  <Tile label="Projeção de fechamento" valor={fmtBRL.format(projecao)} cor={COR.faturamento}
                    sub={`ritmo até dia ${agora.getDate()} de ${diasNoMes}`} />
                )}
                <Tile label="Caixas (mês)" valor={fmtNum.format(r.caixas_total)} cor={COR.caixas}
                  sub={delta(r.caixas_total, dados.anterior?.caixas_total ?? 0) ?? undefined} />
                <Tile label="Caixas hoje" valor={fmtNum.format(dados.caixas_hoje)} cor={COR.caixas} />
                <Tile label="Pedidos" valor={fmtNum.format(r.pedidos)} cor={COR.clientes} />
                <Tile label="Ticket médio" valor={fmtBRL.format(r.ticket_medio)} cor={COR.faturamento} sub="R$ por pedido" />
                <Tile label="Preço médio por caixa" valor={fmtBRL.format(r.preco_medio_caixa)} cor={COR.caixas} sub="exclui bonificação" />
                <Tile label="Drop size" valor={fmtDec.format(r.drop_size)} cor={COR.caixas} sub="caixas por pedido" />
                <Tile label="Média de SKUs por pedido" valor={fmtDec.format(r.media_skus_pedido)} cor={COR.clientes} />
                {r.devolucoes > 0 && (
                  <Tile label="Devoluções" valor={fmtBRL.format(r.devolucoes)} cor={STATUS.critical} sub="já abatidas do líquido" />
                )}
              </div>

              {/* Faturamento por dia */}
              {dados.por_dia.length > 0 && (
                <div style={cardStyle}>
                  <TituloCard t="Faturamento por dia" />
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120, padding: '8px 4px 0' }}>
                    {dados.por_dia.map(d => (
                      <div key={d.dia} title={`${d.dia.slice(8)}/${d.dia.slice(5, 7)} — ${fmtBRL.format(d.faturamento)} · ${fmtNum.format(d.caixas)} cxs`}
                        style={{
                          flex: 1, minWidth: 6, background: COR.faturamento,
                          height: `${Math.max(3, Math.round(100 * d.faturamento / maxDia))}%`,
                          borderRadius: '4px 4px 0 0',
                        }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#898781', padding: '4px 4px 0' }}>
                    <span>{dados.por_dia[0]?.dia.slice(8)}/{dados.por_dia[0]?.dia.slice(5, 7)}</span>
                    <span>{dados.por_dia[dados.por_dia.length - 1]?.dia.slice(8)}/{dados.por_dia[dados.por_dia.length - 1]?.dia.slice(5, 7)}</span>
                  </div>
                </div>
              )}

              {/* ===== Vendas por vendedor ===== */}
              {dados.por_vendedor.length > 0 && (
                <div style={cardStyle}>
                  <TituloCard t="Total de vendas por vendedor" />
                  {dados.por_vendedor.map(v => (
                    <Barra key={v.cod_vendedor}
                      rotulo={`${v.nome}`}
                      detalhe={`${fmtNum.format(v.caixas)} cxs · ${v.positivados} positivados · ${v.pedidos} pedidos`}
                      valor={fmtBRL.format(v.faturamento)}
                      pct={Math.round(100 * v.faturamento / maxVend)}
                      cor={COR.faturamento} />
                  ))}
                </div>
              )}

              {/* ===== Faturamento e caixas por família ===== */}
              {dados.por_familia.length > 0 && (
                <div style={cardStyle}>
                  <TituloCard t="Faturamento e caixas por família de produto" />
                  {dados.por_familia.map(f => (
                    <Barra key={f.familia}
                      rotulo={f.familia}
                      detalhe={`${fmtNum.format(f.caixas)} caixas · ${fmtNum.format(f.pdvs)} PDVs compraram`}
                      valor={fmtBRL.format(f.faturamento)}
                      pct={Math.round(100 * f.faturamento / maxFam)}
                      cor={COR.caixas} />
                  ))}
                </div>
              )}

              {/* ===== Campanhas ===== */}
              {dados.por_campanha.length > 0 && (
                <div style={cardStyle}>
                  <TituloCard t="Faturamento por campanha" />
                  {dados.por_campanha.map(c => (
                    <Barra key={c.nome}
                      rotulo={c.nome}
                      detalhe={`${c.data_inicio.slice(8)}/${c.data_inicio.slice(5, 7)} a ${c.data_fim.slice(8)}/${c.data_fim.slice(5, 7)} · ${fmtNum.format(c.caixas)} cxs`}
                      valor={fmtBRL.format(c.faturamento)}
                      pct={Math.round(100 * c.faturamento / Math.max(1, ...dados.por_campanha.map(x => x.faturamento)))}
                      cor={COR.clientes} />
                  ))}
                </div>
              )}

              {/* ===== Carteira ===== */}
              <Secao titulo="🏢 Carteira de clientes" />
              <div style={{ fontSize: 11, color: '#898781', marginBottom: 8 }}>
                Régua: cliente ativo = comprou nos últimos 90 dias · positivado = emitiu NF de venda no período
              </div>
              <div style={gridTiles}>
                <Tile label="Clientes na carteira" valor={fmtNum.format(cart.total)} cor={COR.clientes}
                  sub={cart.nunca_compraram > 0 ? `${fmtNum.format(cart.nunca_compraram)} nunca compraram` : undefined} />
                <Tile label="Ativos (90 dias)" valor={`${fmtNum.format(cart.ativos)} (${fmtDec.format(cart.pct_ativos)}%)`} cor={STATUS.good} />
                <Tile label="Inativos" valor={`${fmtNum.format(cart.inativos)} (${fmtDec.format(100 - cart.pct_ativos)}%)`} cor={STATUS.critical} />
                <Tile label="Positivação" valor={`${fmtDec.format(cart.pct_positivacao)}%`} cor={COR.faturamento}
                  sub={`${fmtNum.format(r.clientes_positivados)} positivados / ${fmtNum.format(cart.ativos)} ativos`} />
                <Tile label="Limite de crédito da carteira" valor={fmtBRL.format(cart.limite_credito_total)} cor={COR.caixas}
                  sub={usoLimite !== null ? `faturamento = ${usoLimite}% do limite` : undefined} />
                {cart.suspensos > 0 && (
                  <Tile label="⚠️ Crédito suspenso" valor={fmtNum.format(cart.suspensos)} cor={STATUS.critical}
                    sub={`${fmtBRL.format(cart.limite_suspenso)} de limite travado`} />
                )}
              </div>

              {/* Clientes esfriando — lista acionável */}
              {(dados.esfriando?.length ?? 0) > 0 && (
                <div style={{ ...cardStyle, borderLeft: `4px solid ${STATUS.warning}` }}>
                  <TituloCard t="⚠️ Clientes esfriando (31–90 dias sem comprar, maiores primeiro)" />
                  {dados.esfriando.map(c => (
                    <div key={c.cod_cliente} style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f0f0f0', fontSize: 12 }}>
                      <div>
                        <span style={{ fontWeight: 600, color: '#0b0b0b' }}>{c.nome}</span>
                        <span style={{ color: '#898781', marginLeft: 6 }}>· {c.cod_cliente} · {c.cod_vendedor}</span>
                      </div>
                      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ color: STATUS.critical, fontWeight: 700 }}>{c.dias_sem_compra}d</span>
                        <span style={{ color: '#52514e', marginLeft: 8 }}>{fmtBRL.format(c.faturamento_6m)} em 6m</span>
                      </div>
                    </div>
                  ))}
                  <div style={{ fontSize: 11, color: '#898781', marginTop: 8 }}>
                    Ação sugerida: incluir na agenda da semana antes que virem inativos.
                  </div>
                </div>
              )}

              {/* Ativos x inativos + canais */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                <div style={cardStyle}>
                  <TituloCard t="Carteira: ativos × inativos" />
                  <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', gap: 2, background: '#fcfcfb' }}>
                    <div title={`Ativos: ${cart.ativos}`} style={{ width: `${cart.pct_ativos}%`, background: STATUS.good, borderRadius: 4 }} />
                    <div title={`Inativos: ${cart.inativos}`} style={{ flex: 1, background: STATUS.critical, borderRadius: 4 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: '#52514e' }}>
                    <span><Ponto cor={STATUS.good} /> Ativos {fmtDec.format(cart.pct_ativos)}%</span>
                    <span><Ponto cor={STATUS.critical} /> Inativos {fmtDec.format(100 - cart.pct_ativos)}%</span>
                  </div>
                </div>
                <div style={cardStyle}>
                  <TituloCard t="Clientes e vendas por canal" />
                  {dados.por_canal.length === 0 && <Vazio msg="Nenhum cliente com canal cadastrado" />}
                  {dados.por_canal.map((c, i) => (
                    <Barra key={c.canal} rotulo={c.canal}
                      valor={fmtBRL.format(c.faturamento)}
                      detalhe={`${fmtNum.format(c.qtd)} clientes (${fmtDec.format(c.pct)}%) · ${fmtNum.format(c.caixas)} cxs`}
                      pct={Math.round(100 * c.faturamento / Math.max(1, ...dados.por_canal.map(x => x.faturamento)))}
                      cor={COR_CANAL[i % COR_CANAL.length]} />
                  ))}
                </div>
              </div>

              {/* ===== Pedidos / Carteira em aberto (Fase 2b) ===== */}
              {dados.pedidos && (
                <>
                  <Secao titulo="📦 Pedidos e carteira" />
                  <div style={{ fontSize: 11, color: '#898781', marginBottom: 8 }}>
                    Carteira em aberto = snapshot atual (receita no forno). Fill rate e corte = do período.
                  </div>
                  <div style={gridTiles}>
                    <Tile label="Carteira em aberto" valor={fmtBRL.format(dados.pedidos.carteira_aberta.valor)} cor={COR.faturamento}
                      sub={`${fmtNum.format(dados.pedidos.carteira_aberta.pedidos)} pedidos · ${fmtNum.format(dados.pedidos.carteira_aberta.caixas)} cxs`} />
                    {dados.pedidos.fill_rate.pct !== null && (
                      <Tile label="Fill rate (atendimento)" valor={`${fmtDec.format(dados.pedidos.fill_rate.pct)}%`}
                        cor={dados.pedidos.fill_rate.pct >= 95 ? STATUS.good : dados.pedidos.fill_rate.pct >= 85 ? STATUS.warning : STATUS.critical}
                        sub="caixas faturadas / pedidas" />
                    )}
                    {dados.pedidos.fill_rate.caixas_cortadas > 0 && (
                      <Tile label="Caixas cortadas" valor={fmtNum.format(dados.pedidos.fill_rate.caixas_cortadas)} cor={STATUS.critical}
                        sub={`${fmtBRL.format(dados.pedidos.fill_rate.valor_cortado)} não entregue`} />
                    )}
                  </div>
                  {dados.pedidos.corte_por_motivo.length > 0 && (
                    <div style={cardStyle}>
                      <TituloCard t="Corte por motivo (caixas não entregues)" />
                      {dados.pedidos.corte_por_motivo.slice(0, 8).map((m, i) => (
                        <Barra key={m.motivo} rotulo={m.motivo}
                          valor={fmtNum.format(m.caixas)}
                          detalhe={fmtBRL.format(m.valor)}
                          pct={Math.round(100 * m.caixas / Math.max(1, ...dados.pedidos!.corte_por_motivo.map(x => x.caixas)))}
                          cor={COR_CANAL[i % COR_CANAL.length]} />
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ===== Visitas ===== */}
              <Secao titulo="📍 Visitas e check-ins" />
              <div style={gridTiles}>
                <Tile label="Check-ins no período" valor={fmtNum.format(vis?.checkins ?? 0)} cor={COR.visitas} />
                <Tile label="Visitas realizadas" valor={fmtNum.format(vis?.realizadas ?? 0)} cor={STATUS.good} />
                <Tile label="Visitas agendadas" valor={fmtNum.format(vis?.agendadas ?? 0)} cor={COR.faturamento} />
                <Tile label="Pendentes" valor={fmtNum.format(vis?.pendentes ?? 0)} cor={STATUS.warning} />
              </div>

              {/* ===== Metas ===== */}
              <Secao titulo="🎯 Metas do mês" />
              {dados.metas.length === 0 ? (
                <div style={cardStyle}><Vazio msg="Nenhuma meta cadastrada para este mês" /></div>
              ) : dados.metas.map(m => (
                <div key={m.cod_vendedor} style={cardStyle}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', marginBottom: 10 }}>
                    {m.nome} <span style={{ fontSize: 11, color: '#898781', fontWeight: 400 }}>· Fase {m.fase}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                    <Meta rotulo="Visitas" real={m.real_visitas} meta={m.meta_visitas} fmt={fmtNum} />
                    <Meta rotulo="Positivados" real={m.real_positivados} meta={m.meta_positivados} fmt={fmtNum} />
                    <Meta rotulo="Cadastros" real={m.real_cadastros} meta={m.meta_cadastros} fmt={fmtNum} />
                    <Meta rotulo="Faturamento" real={m.real_faturamento} meta={m.meta_faturamento} fmt={fmtBRL} />
                    <Meta rotulo="Caixas" real={m.real_caixas} meta={m.meta_caixas} fmt={fmtNum} />
                  </div>
                </div>
              ))}

              <div style={{ fontSize: 11, color: '#bbb', textAlign: 'center', margin: '24px 0 12px' }}>
                Dados de venda sincronizados do ERP via ETL · Fugini Alimentos, uso interno
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

/* ===== componentes ===== */

function Header({ nome, onSair }: { nome: string; onSair: () => void }) {
  return (
    <div style={{ background: '#1a1a2e', color: 'white', padding: '0 16px', height: 52,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <a href="/dash" style={{ textDecoration: 'none', color: 'white' }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>
          FUGINI<span style={{ color: '#D2001B' }}>.</span>CRM
          <span style={{ fontSize: 11, color: '#aaa', marginLeft: 10, fontWeight: 400 }}>Painel do Gestor</span>
        </div>
      </a>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, color: '#ccc' }}>👤 {nome}</span>
        <button onClick={onSair} style={{ fontSize: 11, color: '#aaa', background: 'none',
          border: '1px solid #444', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}>Sair</button>
      </div>
    </div>
  )
}

function Tela({ msg, inline }: { msg: string; inline?: boolean }) {
  return (
    <div style={{ minHeight: inline ? 120 : '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: "'Segoe UI', sans-serif", color: '#888' }}>{msg}</div>
  )
}

function Secao({ titulo }: { titulo: string }) {
  return <div style={{ fontSize: 13, fontWeight: 700, color: '#888', textTransform: 'uppercase',
    letterSpacing: 0.5, margin: '20px 0 10px' }}>{titulo}</div>
}

function TituloCard({ t }: { t: string }) {
  return <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 12 }}>{t}</div>
}

function Tile({ label, valor, cor, sub }: { label: string; valor: string; cor: string; sub?: string }) {
  return (
    <div style={{ background: 'white', borderRadius: 10, padding: '12px 14px',
      boxShadow: '0 1px 6px rgba(0,0,0,0.07)', borderTop: `3px solid ${cor}` }}>
      <div style={{ fontSize: 11, color: '#52514e', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#0b0b0b' }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: '#898781', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Barra({ rotulo, valor, detalhe, pct, cor }:
  { rotulo: string; valor: string; detalhe?: string; pct: number; cor: string }) {
  return (
    <div style={{ marginBottom: 10 }} title={detalhe ? `${rotulo}: ${valor} · ${detalhe}` : `${rotulo}: ${valor}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
        <span style={{ color: '#0b0b0b', fontWeight: 600 }}>{rotulo}</span>
        <span style={{ color: '#0b0b0b', fontWeight: 700 }}>{valor}</span>
      </div>
      <div style={{ background: '#f0efec', borderRadius: 4, height: 10, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, Math.max(1, pct))}%`, height: '100%', background: cor, borderRadius: 4 }} />
      </div>
      {detalhe && <div style={{ fontSize: 11, color: '#898781', marginTop: 2 }}>{detalhe}</div>}
    </div>
  )
}

function Meta({ rotulo, real, meta, fmt }:
  { rotulo: string; real: number; meta: number; fmt: Intl.NumberFormat }) {
  const pct = meta > 0 ? Math.round(100 * real / meta) : null
  const cor = pct === null ? '#898781' : pct >= 100 ? STATUS.good : pct >= 70 ? STATUS.warning : STATUS.critical
  return (
    <div>
      <div style={{ fontSize: 11, color: '#52514e', marginBottom: 3 }}>{rotulo}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0b0b0b' }}>
        {fmt.format(real)} <span style={{ fontSize: 12, color: '#898781', fontWeight: 400 }}>/ {meta > 0 ? fmt.format(meta) : '—'}</span>
        {pct !== null && <span style={{ fontSize: 12, color: cor, marginLeft: 6 }}>{pct}%</span>}
      </div>
      <div style={{ background: '#f0efec', borderRadius: 4, height: 6, overflow: 'hidden', marginTop: 4 }}>
        <div style={{ width: `${Math.min(pct ?? 0, 100)}%`, height: '100%', background: cor, borderRadius: 4 }} />
      </div>
    </div>
  )
}

function Ponto({ cor }: { cor: string }) {
  return <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
    background: cor, marginRight: 4 }} />
}

function Vazio({ msg }: { msg: string }) {
  return <div style={{ fontSize: 12, color: '#bbb', padding: '12px 0', textAlign: 'center' }}>{msg}</div>
}

const cardStyle: React.CSSProperties = {
  background: 'white', borderRadius: 12, padding: 16, marginBottom: 12,
  boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
}

const gridTiles: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
  gap: 12, marginBottom: 12,
}

const navBtn: React.CSSProperties = {
  background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#555', padding: '0 10px',
}
