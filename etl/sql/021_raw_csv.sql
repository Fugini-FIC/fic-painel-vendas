-- ============================================================
-- 021_raw_csv.sql — camada raw para o pipeline via CSV (TOTVS/portal).
-- Fonte: arquivos que o ERP já exporta (sem tocar na produção).
-- Rodar no dw_fugini após 010. Idempotente.
-- ============================================================

create schema if not exists raw_csv;

create table if not exists raw_csv.nf (
  it_codigo    text,
  nr_nota      text,
  qt_caixas    numeric(16,4),
  valor        numeric(16,4),   -- valor-item-nf (negativo = devolução)
  cod_cliente  text,
  data_emissao date,
  nr_pedido    text,
  estabel      text,
  vl_bruto     numeric(16,4),
  cod_vendedor text,            -- cod-rep
  vl_desconto  numeric(16,4)
);
create index if not exists idx_rawcsv_nf_data on raw_csv.nf(data_emissao);
create index if not exists idx_rawcsv_nf_item on raw_csv.nf(it_codigo);

create table if not exists raw_csv.cliente (
  cod_cliente text,
  cod_erc     text,             -- representante (código)
  nome        text,
  status      text,             -- Ativo/Inativo (cadastral)
  canal       text,             -- nome do canal (FOODSERVICE, ...)
  cnpj        text,
  limite_disp numeric(16,4),
  nome_erc    text              -- nome do representante
);
create index if not exists idx_rawcsv_cli on raw_csv.cliente(cod_cliente);

create table if not exists raw_csv.produto (
  it_codigo text,
  descricao text,
  familia   text                -- família comercial (nome)
);
create index if not exists idx_rawcsv_prod on raw_csv.produto(it_codigo);

create table if not exists raw_csv.pedido (
  it_codigo   text,
  nr_pedido   text,
  qt_caixas   numeric(16,4),
  valor       numeric(16,4),
  cod_cliente text,
  status_item text,             -- "Carteira" = pedido em aberto
  tipo        text,             -- Venda / Bonificacao...
  data_pedido date,
  campanha    text
);
create index if not exists idx_rawcsv_ped_data on raw_csv.pedido(data_pedido);
