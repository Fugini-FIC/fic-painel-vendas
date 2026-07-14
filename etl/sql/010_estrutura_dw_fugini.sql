-- ============================================================
-- 010_estrutura_dw_fugini.sql
-- Estrutura da STAGE/DW no Postgres interno dw_fugini.
-- Camadas por schema (medallion enxuto):
--   raw  → cópia fiel do Progress (1:1, sem transformar)
--   stg  → limpo, tipado, unificado (fugini + cristal)
--   mart → modelo do painel (contrato de negócio)
-- Rodar UMA vez no dw_fugini. Idempotente.
-- ============================================================

create schema if not exists raw;
create schema if not exists stg;
create schema if not exists mart;

-- ---------- Controle de carga incremental ----------
create table if not exists stg.etl_checkpoint (
  entidade      text primary key,        -- ex: 'nota_fiscal:ems2fugini'
  ult_valor     timestamptz,             -- maior data/hora já processada (watermark)
  atualizado_em timestamptz not null default now()
);

create table if not exists stg.etl_log (
  id            bigint generated always as identity primary key,
  tarefa        text not null,
  iniciado_em   timestamptz not null default now(),
  finalizado_em timestamptz,
  status        text,                    -- OK | ERRO
  registros     integer,
  mensagem      text
);

-- ---------- Dimensão: mapa representante → vendedor do painel ----------
-- Substitui o dicionário hardcoded MAPA_REP_VENDEDOR do Python.
-- Preencher com o comercial (ex.: fugini/6003 → SC01).
create table if not exists stg.map_vendedor (
  empresa      text not null,            -- 'fugini' | 'cristal'
  cod_rep      text not null,
  cod_vendedor text not null,
  primary key (empresa, cod_rep)
);

-- ---------- Dimensão: naturezas de operação → tipo de movimento ----------
-- Preencher a partir da query 5 do discovery.sql, com apoio do fiscal.
create table if not exists stg.dim_natureza (
  empresa      text not null,
  nat_operacao text not null,
  cfop         text,
  tipo         text not null default 'venda'
    check (tipo in ('venda','devolucao','bonificacao','ignorar')),
  primary key (empresa, nat_operacao)
);

-- ============================================================
-- MART — espelha o contrato de db/001_estrutura.sql (o painel lê isto,
-- publicado no Supabase por sync_painel_supabase.py).
-- Chave natural inclui EMPRESA (fugini × cristal têm numeração própria).
-- ============================================================
create table if not exists mart.vendas (
  empresa      text not null,
  estabel      text,
  nr_nota      text not null,
  nr_pedido    text,
  cod_cliente  text not null,
  cod_vendedor text,
  it_codigo    text,
  qt_caixas    numeric(12,2) not null default 0,
  valor        numeric(14,2) not null default 0,   -- sempre positivo; o tipo carrega o sinal
  tipo         text not null default 'venda'
    check (tipo in ('venda','devolucao','bonificacao')),
  familia      text,
  data_emissao date not null,
  carregado_em timestamptz not null default now(),
  primary key (empresa, nr_nota, it_codigo, cod_cliente)
);
create index if not exists idx_mart_vendas_data on mart.vendas(data_emissao);
create index if not exists idx_mart_vendas_vend on mart.vendas(cod_vendedor, data_emissao);

create table if not exists mart.clientes (
  empresa        text not null,
  cod_cliente    text not null,
  nome           text,
  cnpj           text,
  canal          text,
  cidade         text,
  uf             text,
  cod_vendedor   text,
  limite_credito numeric(14,2) default 0,
  primary key (empresa, cod_cliente)
);

create table if not exists mart.produtos (
  empresa   text not null,
  it_codigo text not null,
  descricao text,
  familia   text default 'SEM FAMILIA',
  primary key (empresa, it_codigo)
);
