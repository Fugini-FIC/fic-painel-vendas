-- ============================================================
-- db_FIC_Painel — Migração 003 (Fase 2b: pedidos / carteira em aberto)
-- Rodar no SQL Editor do db_FIC_Painel após a 002. Idempotente.
--  * Tabela pedidos (item de pedido, publicada do dw pelo ETL)
--  * painel_pedidos(): carteira em aberto, fill rate, corte por motivo
--    (função separada; o /api/dash combina com painel_vendas)
-- ============================================================

create table if not exists pedidos (
  nr_pedido    text not null,
  it_codigo    text not null,
  cod_cliente  text not null,
  cod_vendedor text,
  qt_caixas    numeric(14,2) default 0,
  valor        numeric(14,2) default 0,
  tipo         text default 'venda',
  status_grupo text,                       -- aberto | faturado | corte
  motivo_corte text,
  familia      text,
  data_pedido  date,
  campanha     text,
  primary key (nr_pedido, it_codigo, cod_cliente)
);
create index if not exists idx_ped_data   on pedidos(data_pedido);
create index if not exists idx_ped_status on pedidos(status_grupo);
create index if not exists idx_ped_vend   on pedidos(cod_vendedor);
alter table pedidos enable row level security;

-- ============================================================
-- painel_pedidos(): KPIs de pedidos.
--  - carteira em aberto = SNAPSHOT (todos os itens 'aberto', venda), não filtrado
--    por período — é a receita futura que está no forno AGORA.
--  - fill rate / corte = do PERÍODO (data_pedido entre p_inicio e p_fim).
-- ============================================================
create or replace function painel_pedidos(
  p_inicio   date,
  p_fim      date,
  p_vendedor text default null
) returns jsonb
language sql
stable
as $$
with
per as (  -- pedidos do período (para fill rate / corte)
  select * from pedidos
  where tipo = 'venda'
    and data_pedido between p_inicio and p_fim
    and (p_vendedor is null or cod_vendedor = p_vendedor)
),
ab as (   -- carteira em aberto = snapshot atual (não filtra período)
  select * from pedidos
  where tipo = 'venda' and status_grupo = 'aberto'
    and (p_vendedor is null or cod_vendedor = p_vendedor)
)
select jsonb_build_object(

  'carteira_aberta', (select jsonb_build_object(
    'valor',   coalesce(sum(valor), 0),
    'caixas',  coalesce(sum(qt_caixas), 0),
    'pedidos', count(distinct nr_pedido),
    'itens',   count(*)
  ) from ab),

  'fill_rate', (select jsonb_build_object(
    'caixas_faturadas', coalesce(sum(qt_caixas) filter (where status_grupo = 'faturado'), 0),
    'caixas_cortadas',  coalesce(sum(qt_caixas) filter (where status_grupo = 'corte'), 0),
    'valor_cortado',    coalesce(sum(valor)     filter (where status_grupo = 'corte'), 0),
    'pct',              case when sum(qt_caixas) filter (where status_grupo in ('faturado','corte')) > 0
                        then round(100.0 * sum(qt_caixas) filter (where status_grupo = 'faturado')
                             / sum(qt_caixas) filter (where status_grupo in ('faturado','corte')), 1)
                        else null end
  ) from per),

  'corte_por_motivo', (select coalesce(jsonb_agg(t order by t.caixas desc), '[]'::jsonb)
    from (select coalesce(motivo_corte, 'OUTRO') as motivo,
                 sum(qt_caixas) as caixas,
                 sum(valor)     as valor
          from per where status_grupo = 'corte'
          group by 1) t),

  'carteira_por_vendedor', (select coalesce(jsonb_agg(t order by t.valor desc), '[]'::jsonb)
    from (select cod_vendedor, sum(valor) as valor, sum(qt_caixas) as caixas,
                 count(distinct nr_pedido) as pedidos
          from ab group by cod_vendedor) t)
);
$$;

revoke execute on function painel_pedidos(date, date, text) from anon;
