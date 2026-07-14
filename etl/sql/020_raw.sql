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
