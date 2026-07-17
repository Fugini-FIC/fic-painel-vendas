-- ============================================================
-- dw/005_crm.sql — schema crm no dw_fugini: espelho dos dados do app de
-- check-in (Supabase crm_fugini) sincronizados pelo ETL.
-- Rodar no dw_fugini. Idempotente.
-- ============================================================

create schema if not exists crm;

create table if not exists crm.vendedores (
  cod_vendedor text primary key,
  nome  text,
  role  text default 'vendedor',   -- vendedor | master
  email text
);

create table if not exists crm.metas (
  cod_vendedor     text not null,
  mes              text not null,   -- 'YYYY-MM'
  meta_visitas     integer default 0,
  meta_positivados integer default 0,
  meta_cadastros   integer default 0,
  fase             integer default 1,
  meta_faturamento numeric(14,2) default 0,
  meta_caixas      numeric(12,2) default 0,
  primary key (cod_vendedor, mes)
);

create table if not exists crm.checkins (
  id            text primary key,
  cod_cliente   text,
  nome_cliente  text,
  cod_vendedor  text,
  lat_vendedor  double precision,
  lng_vendedor  double precision,
  status_visita text,
  observacao    text,
  timestamp     timestamptz
);
create index if not exists idx_crm_chk_data on crm.checkins(timestamp);

create table if not exists crm.agendamentos (
  id            text primary key,
  cod_cliente   text,
  nome_cliente  text,
  cod_vendedor  text,
  data_visita   date,
  status        text,
  checkin_id    text
);
create index if not exists idx_crm_ag_data on crm.agendamentos(data_visita);
