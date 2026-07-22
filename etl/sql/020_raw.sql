-- ============================================================
-- 020_raw.sql — tabelas da camada RAW no dw_fugini (cópia tipada do Progress)
-- Rodar no dw_fugini após 010_estrutura_dw_fugini.sql. Idempotente.
-- ============================================================

create table if not exists raw.it_nota_fisc (
  empresa       text not null,
  cod_estabel   text not null,
  serie         text not null,
  nr_nota_fis   text not null,
  nr_seq_fat    integer not null,
  it_codigo     text,
  nat_operacao  text,
  qt_faturada   numeric(16,4),
  un_fatur      text,
  vl_merc_liq   numeric(16,4),
  vl_tot_item   numeric(16,4),
  qt_devolvida  numeric(16,4),
  cd_emitente   text,
  cd_vendedor   text,
  nome_ab_cli   text,
  nr_pedcli     text,
  dt_emis_nota  date,
  dt_cancela    date,
  ind_sit_nota  integer,
  carregado_em  timestamptz not null default now(),
  primary key (empresa, cod_estabel, serie, nr_nota_fis, nr_seq_fat)
);
create index if not exists idx_raw_itnf_emis on raw.it_nota_fisc(dt_emis_nota);

create table if not exists raw.natur_oper (
  empresa      text not null,
  nat_operacao text not null,
  denominacao  text,
  tipo         integer,          -- 1=entrada  2=saída  3=serviço
  cfop         text,
  log_bonif    boolean,          -- flag oficial Datasul de bonificação
  carregado_em timestamptz not null default now(),
  primary key (empresa, nat_operacao)
);

create table if not exists raw.item (
  empresa    text not null,
  it_codigo  text not null,
  desc_item  text,
  fm_codigo  text,               -- família de materiais
  fm_cod_com text,               -- família COMERCIAL (agrupamento de venda)
  ge_codigo  text,               -- grupo de estoque
  un         text,
  carregado_em timestamptz not null default now(),
  primary key (empresa, it_codigo)
);

create table if not exists raw.fam_comerc (
  empresa    text not null,
  fm_cod_com text not null,
  descricao  text,
  carregado_em timestamptz not null default now(),
  primary key (empresa, fm_cod_com)
);

-- Fase 2a: dimensões cliente e vendedor (origem ems2mult)
create table if not exists raw.emitente (
  empresa          text not null,
  cod_emitente     text not null,
  nome_emit        text,
  nome_abrev       text,
  cgc              text,
  cidade           text,
  estado           text,
  cod_rep          text,
  cod_canal_venda  text,               -- código do canal de venda
  lim_credito      numeric(16,2),
  ind_cre_cli      integer,            -- 4 = crédito suspenso
  ind_sit_emitente integer,
  dt_ult_venda     date,
  identific        integer,            -- 1=cliente 2=fornecedor 3=ambos
  carregado_em     timestamptz not null default now(),
  primary key (empresa, cod_emitente)
);

create table if not exists raw.repres (
  empresa      text not null,
  cod_rep      text not null,
  nome         text,
  nome_abrev   text,
  nome_ab_reg  text,
  rep_indireto text,
  dt_deslig    date,
  ind_situacao integer,
  carregado_em timestamptz not null default now(),
  primary key (empresa, cod_rep)
);

-- Piloto: pedidos (ped-venda + ped-item) e cadastros (wt_cliente_repres),
-- hard-scoped nos 5 vendedores 6003-6007 (ver etl/sql/extract/pedidos.sql
-- e cadastros.sql).
create table if not exists raw.pedidos (
  empresa            text not null,
  nome_abrev         text not null,
  nr_pedcli          text not null,
  cod_emitente       text,
  nr_sequencia       integer not null,
  it_codigo          text,
  descricao_1        text,
  descricao_2        text,
  qt_pedida          numeric(16,4),
  preco_venda        numeric(16,4),
  valor_total_venda  numeric(16,4),
  dt_venda           date,
  representante      text,
  situacao_pedido    integer,
  carregado_em       timestamptz not null default now(),
  primary key (empresa, nome_abrev, nr_pedcli, nr_sequencia)
);
create index if not exists idx_raw_pedidos_dt on raw.pedidos(dt_venda);

-- Sem chave natural confiavel: wt_cliente_repres e' uma fila de submissoes
-- (cod_emitente e tmp_emitente ficam em 0 pra cadastros recem-enviados, e ha
-- duplicatas reais de app). Usa id substituto e preserva o bruto como veio.
create table if not exists raw.cadastros (
  id                    bigserial primary key,
  empresa               text not null,
  tmp_emitente          bigint,
  cod_emitente          text,
  nome_emit             text,
  cidade                text,
  estado                text,
  cgc_cpf               text,
  telefone              text,
  email                 text,
  cod_rep               text,
  nome_abrev            text,
  id_status             integer,
  desc_status           text,
  canal_distribuicao    text,
  dt_implantacao        date,
  dt_impl_web           date,
  dt_efetiva_coml       date,
  lim_credito           numeric(16,2),
  vlr_credito_sugerido  numeric(16,2),
  carregado_em          timestamptz not null default now()
);
create index if not exists idx_raw_cadastros_rep on raw.cadastros(cod_rep);
