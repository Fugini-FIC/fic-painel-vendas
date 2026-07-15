-- ============================================================
-- db_FIC_Painel — Migração 002 (Fase 2a: dimensões cliente/vendedor)
-- Rodar no SQL Editor do db_FIC_Painel após a 001. Idempotente.
--  * Novo: clientes.credito_suspenso (ind-cre-cli=4 do TOTVS)
--  * painel_vendas() ganha, no bloco carteira, a contagem de suspensos
--    e o limite de crédito preso neles.
-- Vendedores (nomes reais dos representantes) usam a tabela vendedores
-- já existente — sem mudança de schema.
-- ============================================================

alter table clientes add column if not exists credito_suspenso boolean default false;
create index if not exists idx_clientes_suspenso on clientes(credito_suspenso) where credito_suspenso;

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
  select c.cod_cliente, c.nome, c.cod_vendedor, c.limite_credito, c.credito_suspenso,
         max(vd.data_emissao) as ultima_compra,
         (select d from hoje_sp) - max(vd.data_emissao) as dias_sem_compra,
         coalesce(sum(vd.valor) filter (
           where vd.data_emissao >= (select d from hoje_sp) - 180), 0) as faturamento_6m
  from cart c
  left join vendas vd on vd.cod_cliente = c.cod_cliente and vd.tipo = 'venda'
  group by c.cod_cliente, c.nome, c.cod_vendedor, c.limite_credito, c.credito_suspenso
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
    'limite_credito_total', coalesce(sum(limite_credito), 0),
    'suspensos',        count(*) filter (where credito_suspenso),
    'limite_suspenso',  coalesce(sum(limite_credito) filter (where credito_suspenso), 0)
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
