-- ============================================================
-- db_FIC_Painel — Migração 001 (estrutura analítica)
-- Rodar no SQL Editor do projeto db_FIC_Painel (izflaeiehnwpoxsyhyiv)
--
-- Este banco guarda os dados ANALÍTICOS do Painel do Gestor,
-- sincronizados do ERP/TOTVS pelo ETL. Login, visitas, agenda e
-- metas continuam no banco do CRM (fugini-crm).
-- Idempotente: pode rodar mais de uma vez.
--
-- DEFINIÇÕES DE NEGÓCIO (contrato — não mudar sem alinhar comercial):
--  * Cliente ATIVO  = tem NF de venda nos últimos 90 dias (janela móvel).
--  * POSITIVADO no período = >=1 NF tipo 'venda' com valor > 0.
--    Bonificação NÃO positiva; devolução NÃO positiva.
--  * FATURAMENTO líquido = vendas - devoluções. Bonificação conta em
--    caixas (volume), nunca em receita.
--  * Datas de venda = data de emissão da NF, fuso America/Sao_Paulo.
-- ============================================================

create table if not exists clientes (
  cod_cliente text primary key
);
alter table clientes add column if not exists nome            text;
alter table clientes add column if not exists cnpj            text;
alter table clientes add column if not exists canal           text;   -- varejo, atacado, food service, distribuidor
alter table clientes add column if not exists cidade          text;
alter table clientes add column if not exists uf              text;
alter table clientes add column if not exists endereco        text;
alter table clientes add column if not exists cod_vendedor    text;
alter table clientes add column if not exists status          text not null default 'ativo';
alter table clientes add column if not exists limite_credito  numeric(14,2) default 0;  -- limite-disp do TOTVS
alter table clientes add column if not exists origem          text not null default 'crm';
alter table clientes add column if not exists data_cadastro   timestamptz not null default now();
alter table clientes add column if not exists atualizado_em   timestamptz not null default now();
create index if not exists idx_clientes_vendedor on clientes(cod_vendedor);
create index if not exists idx_clientes_canal    on clientes(canal);

create table if not exists produtos (
  it_codigo text primary key
);
alter table produtos add column if not exists descricao text;
alter table produtos add column if not exists familia   text default 'SEM FAMILIA';
create index if not exists idx_produtos_familia on produtos(familia);

create table if not exists campanhas (
  id bigint generated always as identity primary key
);
alter table campanhas add column if not exists nome        text;
alter table campanhas add column if not exists data_inicio date;
alter table campanhas add column if not exists data_fim    date;
alter table campanhas add column if not exists mecanica    text;
alter table campanhas add column if not exists parametros  jsonb;
alter table campanhas add column if not exists ativa       boolean not null default true;

create table if not exists vendas (
  id bigint generated always as identity primary key
);
alter table vendas add column if not exists nr_nota      text;
alter table vendas add column if not exists nr_pedido    text;
alter table vendas add column if not exists cod_cliente  text;
alter table vendas add column if not exists cod_vendedor text;
alter table vendas add column if not exists it_codigo    text;
alter table vendas add column if not exists qt_caixas    numeric(12,2) not null default 0;
alter table vendas add column if not exists valor        numeric(14,2) not null default 0;
alter table vendas add column if not exists tipo         text not null default 'venda';
alter table vendas add column if not exists data_emissao date;
alter table vendas add column if not exists campanha_id  bigint;
alter table vendas add column if not exists carregado_em timestamptz not null default now();
do $$ begin
  alter table vendas add constraint vendas_nota_item_cliente_uk
    unique (nr_nota, it_codigo, cod_cliente);
exception
  when duplicate_object then null;
  when duplicate_table  then null;
end $$;
create index if not exists idx_vendas_data      on vendas(data_emissao);
create index if not exists idx_vendas_vendedor  on vendas(cod_vendedor, data_emissao);
create index if not exists idx_vendas_cliente   on vendas(cod_cliente, data_emissao);
create index if not exists idx_vendas_item      on vendas(it_codigo);

do $$ begin
  alter table clientes add constraint clientes_status_ck
    check (status in ('ativo','inativo'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table clientes add constraint clientes_origem_ck
    check (origem in ('crm','totvs'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table vendas add constraint vendas_tipo_ck
    check (tipo in ('venda','devolucao','bonificacao'));
exception when duplicate_object then null; end $$;

-- Garante RLS ligado mesmo se o gatilho automático não cobrir
alter table clientes  enable row level security;
alter table produtos  enable row level security;
alter table campanhas enable row level security;
alter table vendas    enable row level security;

-- ============================================================
-- painel_vendas(): KPIs de VENDAS e CARTEIRA (este banco).
-- Visitas e metas são agregadas pela API a partir do banco do CRM.
-- ============================================================
create or replace function painel_vendas(
  p_inicio   date,
  p_fim      date,
  p_vendedor text default null
) returns jsonb
language sql
stable
as $$
with
hoje_sp as (select (now() at time zone 'America/Sao_Paulo')::date as d),
v as (
  select * from vendas
  where data_emissao between p_inicio and p_fim
    and (p_vendedor is null or cod_vendedor = p_vendedor)
),
vl as (
  select
    coalesce(sum(valor)     filter (where tipo = 'venda'), 0)
      - coalesce(sum(valor) filter (where tipo = 'devolucao'), 0)  as faturamento_liquido,
    coalesce(sum(valor)     filter (where tipo = 'devolucao'), 0)  as devolucoes,
    coalesce(sum(qt_caixas) filter (where tipo in ('venda','bonificacao')), 0) as caixas_total,
    coalesce(sum(qt_caixas) filter (where tipo = 'bonificacao'), 0) as caixas_bonificadas,
    count(distinct nr_pedido) filter (where nr_pedido is not null and tipo = 'venda') as pedidos,
    count(distinct nr_nota)   filter (where tipo = 'venda') as notas,
    count(distinct cod_cliente) filter (where tipo = 'venda' and valor > 0) as positivados,
    count(distinct (nr_pedido, it_codigo)) filter (where nr_pedido is not null and tipo = 'venda') as linhas_pedido
  from v
),
cart as (
  select * from clientes
  where (p_vendedor is null or cod_vendedor = p_vendedor)
),
recencia as (
  select c.cod_cliente, c.nome, c.cod_vendedor, c.limite_credito,
         max(vd.data_emissao) as ultima_compra,
         (select d from hoje_sp) - max(vd.data_emissao) as dias_sem_compra,
         coalesce(sum(vd.valor) filter (
           where vd.data_emissao >= (select d from hoje_sp) - 180), 0) as faturamento_6m
  from cart c
  left join vendas vd on vd.cod_cliente = c.cod_cliente and vd.tipo = 'venda'
  group by c.cod_cliente, c.nome, c.cod_vendedor, c.limite_credito
)
select jsonb_build_object(

  'dados_ate', (select max(carregado_em) from vendas),

  'anterior', (select jsonb_build_object(
    'faturamento_total',
      coalesce(sum(valor) filter (where tipo = 'venda'), 0)
        - coalesce(sum(valor) filter (where tipo = 'devolucao'), 0),
    'caixas_total', coalesce(sum(qt_caixas) filter (where tipo in ('venda','bonificacao')), 0),
    'clientes_positivados', count(distinct cod_cliente) filter (where tipo = 'venda' and valor > 0)
  ) from vendas
    where data_emissao between (p_inicio - (p_fim - p_inicio + 1)) and (p_inicio - 1)
      and (p_vendedor is null or cod_vendedor = p_vendedor)),

  'resumo', (select jsonb_build_object(
    'faturamento_total',    faturamento_liquido,
    'devolucoes',           devolucoes,
    'caixas_total',         caixas_total,
    'caixas_bonificadas',   caixas_bonificadas,
    'pedidos',              pedidos,
    'notas',                notas,
    'clientes_positivados', positivados,
    'media_skus_pedido',    case when pedidos > 0 then round(linhas_pedido::numeric / pedidos, 1) else 0 end,
    'ticket_medio',         case when pedidos > 0 then round(faturamento_liquido / pedidos, 2) else 0 end,
    'preco_medio_caixa',    case when caixas_total - caixas_bonificadas > 0
                            then round(faturamento_liquido / (caixas_total - caixas_bonificadas), 2) else 0 end,
    'drop_size',            case when pedidos > 0 then round(caixas_total / pedidos, 1) else 0 end
  ) from vl),

  'faturamento_hoje', (select coalesce(sum(case tipo when 'venda' then valor when 'devolucao' then -valor else 0 end), 0)
    from vendas, hoje_sp
    where data_emissao = hoje_sp.d
      and (p_vendedor is null or cod_vendedor = p_vendedor)),
  'caixas_hoje', (select coalesce(sum(qt_caixas) filter (where tipo in ('venda','bonificacao')), 0)
    from vendas, hoje_sp
    where data_emissao = hoje_sp.d
      and (p_vendedor is null or cod_vendedor = p_vendedor)),

  'carteira', (select jsonb_build_object(
    'total',            count(*),
    'ativos',           count(*) filter (where dias_sem_compra <= 90),
    'inativos',         count(*) filter (where dias_sem_compra > 90),
    'nunca_compraram',  count(*) filter (where ultima_compra is null),
    'pct_ativos',       case when count(*) > 0
                        then round(100.0 * count(*) filter (where dias_sem_compra <= 90) / count(*), 1)
                        else 0 end,
    'pct_positivacao',  case when count(*) filter (where dias_sem_compra <= 90) > 0
                        then round(100.0 * (select positivados from vl)
                             / count(*) filter (where dias_sem_compra <= 90), 1)
                        else 0 end,
    'limite_credito_total', coalesce(sum(limite_credito), 0)
  ) from recencia),

  'esfriando', (select coalesce(jsonb_agg(t), '[]'::jsonb)
    from (select cod_cliente, nome, cod_vendedor, dias_sem_compra, faturamento_6m
          from recencia
          where dias_sem_compra between 31 and 90
          order by faturamento_6m desc
          limit 10) t),

  'por_canal', (select coalesce(jsonb_agg(t order by t.faturamento desc), '[]'::jsonb)
    from (select coalesce(c.canal, 'Sem canal') as canal,
                 count(distinct c.cod_cliente) as qtd,
                 round(100.0 * count(distinct c.cod_cliente)
                       / greatest(sum(count(distinct c.cod_cliente)) over (), 1), 1) as pct,
                 coalesce(sum(case vv.tipo when 'venda' then vv.valor when 'devolucao' then -vv.valor else 0 end), 0) as faturamento,
                 coalesce(sum(vv.qt_caixas) filter (where vv.tipo in ('venda','bonificacao')), 0) as caixas
          from cart c
          left join v vv on vv.cod_cliente = c.cod_cliente
          group by 1) t),

  'por_vendedor', (select coalesce(jsonb_agg(t order by t.faturamento desc), '[]'::jsonb)
    from (select cod_vendedor,
                 sum(case tipo when 'venda' then valor when 'devolucao' then -valor else 0 end) as faturamento,
                 sum(qt_caixas) filter (where tipo in ('venda','bonificacao')) as caixas,
                 count(distinct cod_cliente) filter (where tipo = 'venda' and valor > 0) as positivados,
                 count(distinct nr_pedido) filter (where nr_pedido is not null and tipo = 'venda') as pedidos
          from v
          group by cod_vendedor) t),

  'por_familia', (select coalesce(jsonb_agg(t order by t.faturamento desc), '[]'::jsonb)
    from (select coalesce(p.familia, 'SEM FAMILIA') as familia,
                 sum(case v.tipo when 'venda' then v.valor when 'devolucao' then -v.valor else 0 end) as faturamento,
                 sum(v.qt_caixas) filter (where v.tipo in ('venda','bonificacao')) as caixas,
                 count(distinct v.cod_cliente) filter (where v.tipo = 'venda') as pdvs
          from v left join produtos p on p.it_codigo = v.it_codigo
          group by 1) t),

  'por_dia', (select coalesce(jsonb_agg(t order by t.dia), '[]'::jsonb)
    from (select data_emissao as dia,
                 sum(case tipo when 'venda' then valor when 'devolucao' then -valor else 0 end) as faturamento,
                 sum(qt_caixas) filter (where tipo in ('venda','bonificacao')) as caixas
          from v group by 1) t),

  'por_campanha', (select coalesce(jsonb_agg(t order by t.faturamento desc), '[]'::jsonb)
    from (select c.nome, c.data_inicio, c.data_fim, c.mecanica,
                 coalesce(sum(case vv.tipo when 'venda' then vv.valor when 'devolucao' then -vv.valor else 0 end), 0) as faturamento,
                 coalesce(sum(vv.qt_caixas) filter (where vv.tipo in ('venda','bonificacao')), 0) as caixas
          from campanhas c
          left join vendas vv on vv.campanha_id = c.id
            and (p_vendedor is null or vv.cod_vendedor = p_vendedor)
          where c.data_fim >= p_inicio and c.data_inicio <= p_fim
          group by c.id, c.nome, c.data_inicio, c.data_fim, c.mecanica) t),

  -- Cadastros feitos no CRM por vendedor (para o realizado da meta)
  'cadastros', (select coalesce(jsonb_agg(t), '[]'::jsonb)
    from (select cod_vendedor, count(*) as qtd
          from clientes
          where origem = 'crm'
            and data_cadastro::date between p_inicio and p_fim
            and (p_vendedor is null or cod_vendedor = p_vendedor)
          group by cod_vendedor) t)
);
$$;

revoke execute on function painel_vendas(date, date, text) from anon;

-- ============================================================
-- Operacional do painel (banco único — sem dependência do CRM antigo)
-- ============================================================

create table if not exists vendedores (
  cod_vendedor text primary key
);
alter table vendedores add column if not exists nome  text;
alter table vendedores add column if not exists role  text not null default 'vendedor';
alter table vendedores add column if not exists email text unique;
do $$ begin
  alter table vendedores add constraint vendedores_role_ck
    check (role in ('vendedor','master'));
exception when duplicate_object then null; end $$;

create table if not exists metas (
  cod_vendedor text not null,
  mes          text not null,                     -- 'YYYY-MM'
  primary key (cod_vendedor, mes)
);
alter table metas add column if not exists meta_visitas     integer default 0;
alter table metas add column if not exists meta_positivados integer default 0;
alter table metas add column if not exists meta_cadastros   integer default 0;
alter table metas add column if not exists fase             integer default 1;
alter table metas add column if not exists meta_faturamento numeric(14,2) default 0;
alter table metas add column if not exists meta_caixas      numeric(12,2) default 0;

-- Visitas (estrutura pronta para o painel receber check-ins no futuro)
create table if not exists checkins (
  id            uuid primary key default gen_random_uuid(),
  cod_cliente   text,
  nome_cliente  text,
  cod_vendedor  text,
  lat_vendedor  double precision,
  lng_vendedor  double precision,
  status_visita text,
  observacao    text,
  timestamp     timestamptz not null default now()
);
create table if not exists agendamentos (
  id            uuid primary key default gen_random_uuid(),
  cod_cliente   text,
  nome_cliente  text,
  cod_vendedor  text,
  data_visita   date,
  hora_visita   time,
  observacao    text,
  endereco      text,
  ordem_roteiro integer,
  status        text default 'pendente',
  checkin_id    uuid,
  timestamp_criacao timestamptz not null default now()
);

alter table vendedores   enable row level security;
alter table metas        enable row level security;
alter table checkins     enable row level security;
alter table agendamentos enable row level security;

-- Única leitura feita direto do navegador (anon key + sessão):
-- o app resolve o vendedor logado e a lista de vendedores (filtro do master).
drop policy if exists vendedores_select_autenticado on vendedores;
create policy vendedores_select_autenticado on vendedores
  for select to authenticated using (true);
