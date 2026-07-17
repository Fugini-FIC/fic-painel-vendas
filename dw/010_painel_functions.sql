-- ============================================================
-- dw/010_painel_functions.sql — funções analíticas do painel, no dw_fugini.
-- Leem mart.* (empresa 'fugini') e crm.* (check-ins sincronizados).
-- O painel interno chama estas funções via pg. Rodar no dw_fugini após o mart.
-- Idempotente.
-- ============================================================

create or replace function mart.painel_vendas(
  p_inicio date, p_fim date, p_vendedor text default null
) returns jsonb
language sql stable as $$
with
hoje_sp as (select (now() at time zone 'America/Sao_Paulo')::date as d),
v as (
  select * from mart.vendas
  where empresa = 'fugini' and data_emissao between p_inicio and p_fim
    and (p_vendedor is null or cod_vendedor = p_vendedor)
),
vl as (
  select
    coalesce(sum(valor) filter (where tipo='venda'),0) - coalesce(sum(valor) filter (where tipo='devolucao'),0) as faturamento_liquido,
    coalesce(sum(valor) filter (where tipo='devolucao'),0) as devolucoes,
    coalesce(sum(qt_caixas) filter (where tipo in ('venda','bonificacao')),0) as caixas_total,
    coalesce(sum(qt_caixas) filter (where tipo='bonificacao'),0) as caixas_bonificadas,
    count(distinct nr_pedido) filter (where nr_pedido is not null and tipo='venda') as pedidos,
    count(distinct nr_nota) filter (where tipo='venda') as notas,
    count(distinct cod_cliente) filter (where tipo='venda' and valor>0) as positivados,
    count(distinct (nr_pedido, it_codigo)) filter (where nr_pedido is not null and tipo='venda') as linhas_pedido
  from v
),
cart as (
  select * from mart.clientes
  where empresa='fugini' and (p_vendedor is null or cod_vendedor = p_vendedor)
),
recencia as (
  select c.cod_cliente, c.nome, c.cod_vendedor, c.limite_credito, c.credito_suspenso,
         max(vd.data_emissao) as ultima_compra,
         (select d from hoje_sp) - max(vd.data_emissao) as dias_sem_compra,
         coalesce(sum(vd.valor) filter (where vd.data_emissao >= (select d from hoje_sp) - 180),0) as faturamento_6m
  from cart c
  left join mart.vendas vd on vd.empresa='fugini' and vd.cod_cliente=c.cod_cliente and vd.tipo='venda'
  group by c.cod_cliente, c.nome, c.cod_vendedor, c.limite_credito, c.credito_suspenso
)
select jsonb_build_object(
  'dados_ate', (select max(carregado_em) from mart.vendas where empresa='fugini'),
  'anterior', (select jsonb_build_object(
    'faturamento_total', coalesce(sum(valor) filter (where tipo='venda'),0) - coalesce(sum(valor) filter (where tipo='devolucao'),0),
    'caixas_total', coalesce(sum(qt_caixas) filter (where tipo in ('venda','bonificacao')),0),
    'clientes_positivados', count(distinct cod_cliente) filter (where tipo='venda' and valor>0)
  ) from mart.vendas where empresa='fugini'
    and data_emissao between (p_inicio - (p_fim - p_inicio + 1)) and (p_inicio - 1)
    and (p_vendedor is null or cod_vendedor = p_vendedor)),
  'resumo', (select jsonb_build_object(
    'faturamento_total', faturamento_liquido, 'devolucoes', devolucoes,
    'caixas_total', caixas_total, 'caixas_bonificadas', caixas_bonificadas,
    'pedidos', pedidos, 'notas', notas, 'clientes_positivados', positivados,
    'media_skus_pedido', case when pedidos>0 then round(linhas_pedido::numeric/pedidos,1) else 0 end,
    'ticket_medio', case when pedidos>0 then round(faturamento_liquido/pedidos,2) else 0 end,
    'preco_medio_caixa', case when caixas_total-caixas_bonificadas>0 then round(faturamento_liquido/(caixas_total-caixas_bonificadas),2) else 0 end,
    'drop_size', case when pedidos>0 then round(caixas_total/pedidos,1) else 0 end
  ) from vl),
  'faturamento_hoje', (select coalesce(sum(case tipo when 'venda' then valor when 'devolucao' then -valor else 0 end),0)
    from mart.vendas, hoje_sp where empresa='fugini' and data_emissao=hoje_sp.d and (p_vendedor is null or cod_vendedor=p_vendedor)),
  'caixas_hoje', (select coalesce(sum(qt_caixas) filter (where tipo in ('venda','bonificacao')),0)
    from mart.vendas, hoje_sp where empresa='fugini' and data_emissao=hoje_sp.d and (p_vendedor is null or cod_vendedor=p_vendedor)),
  'carteira', (select jsonb_build_object(
    'total', count(*), 'ativos', count(*) filter (where dias_sem_compra<=90),
    'inativos', count(*) filter (where dias_sem_compra>90),
    'nunca_compraram', count(*) filter (where ultima_compra is null),
    'pct_ativos', case when count(*)>0 then round(100.0*count(*) filter (where dias_sem_compra<=90)/count(*),1) else 0 end,
    'pct_positivacao', case when count(*) filter (where dias_sem_compra<=90)>0 then round(100.0*(select positivados from vl)/count(*) filter (where dias_sem_compra<=90),1) else 0 end,
    'limite_credito_total', coalesce(sum(limite_credito),0),
    'suspensos', count(*) filter (where credito_suspenso),
    'limite_suspenso', coalesce(sum(limite_credito) filter (where credito_suspenso),0)
  ) from recencia),
  'esfriando', (select coalesce(jsonb_agg(t),'[]'::jsonb) from (
    select cod_cliente, nome, cod_vendedor, dias_sem_compra, faturamento_6m
    from recencia where dias_sem_compra between 31 and 90 order by faturamento_6m desc limit 10) t),
  'por_canal', (select coalesce(jsonb_agg(t order by t.faturamento desc),'[]'::jsonb) from (
    select coalesce(c.canal,'Sem canal') as canal, count(distinct c.cod_cliente) as qtd,
      round(100.0*count(distinct c.cod_cliente)/greatest(sum(count(distinct c.cod_cliente)) over (),1),1) as pct,
      coalesce(sum(case vv.tipo when 'venda' then vv.valor when 'devolucao' then -vv.valor else 0 end),0) as faturamento,
      coalesce(sum(vv.qt_caixas) filter (where vv.tipo in ('venda','bonificacao')),0) as caixas
    from cart c left join v vv on vv.cod_cliente=c.cod_cliente group by 1) t),
  'por_vendedor', (select coalesce(jsonb_agg(t order by t.faturamento desc),'[]'::jsonb) from (
    select vv.cod_vendedor, coalesce(mv.nome, vv.cod_vendedor) as nome,
      sum(case vv.tipo when 'venda' then vv.valor when 'devolucao' then -vv.valor else 0 end) as faturamento,
      sum(vv.qt_caixas) filter (where vv.tipo in ('venda','bonificacao')) as caixas,
      count(distinct vv.cod_cliente) filter (where vv.tipo='venda' and vv.valor>0) as positivados,
      count(distinct vv.nr_pedido) filter (where vv.nr_pedido is not null and vv.tipo='venda') as pedidos
    from v vv left join mart.vendedores mv on mv.empresa='fugini' and mv.cod_vendedor=vv.cod_vendedor
    group by vv.cod_vendedor, mv.nome) t),
  'por_familia', (select coalesce(jsonb_agg(t order by t.faturamento desc),'[]'::jsonb) from (
    select coalesce(p.familia,'SEM FAMILIA') as familia,
      sum(case v.tipo when 'venda' then v.valor when 'devolucao' then -v.valor else 0 end) as faturamento,
      sum(v.qt_caixas) filter (where v.tipo in ('venda','bonificacao')) as caixas,
      count(distinct v.cod_cliente) filter (where v.tipo='venda') as pdvs
    from v left join mart.produtos p on p.empresa='fugini' and p.it_codigo=v.it_codigo group by 1) t),
  'por_dia', (select coalesce(jsonb_agg(t order by t.dia),'[]'::jsonb) from (
    select data_emissao as dia,
      sum(case tipo when 'venda' then valor when 'devolucao' then -valor else 0 end) as faturamento,
      sum(qt_caixas) filter (where tipo in ('venda','bonificacao')) as caixas
    from v group by 1) t),
  'por_campanha', '[]'::jsonb,   -- Fase 2d (campanhas) ainda não ligada
  'metas', (select coalesce(jsonb_agg(t),'[]'::jsonb) from (
    select m.cod_vendedor, coalesce(vd.nome, m.cod_vendedor) as nome,
      m.meta_visitas, m.meta_positivados, m.meta_cadastros, m.meta_faturamento, m.meta_caixas, m.fase,
      (select count(*) from crm.checkins c where c.cod_vendedor=m.cod_vendedor and c.status_visita='realizada'
         and (c.timestamp at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim) as real_visitas,
      (select count(distinct vv.cod_cliente) from v vv where vv.cod_vendedor=m.cod_vendedor and vv.tipo='venda' and vv.valor>0) as real_positivados,
      0 as real_cadastros,
      (select coalesce(sum(case vv.tipo when 'venda' then vv.valor when 'devolucao' then -vv.valor else 0 end),0) from v vv where vv.cod_vendedor=m.cod_vendedor) as real_faturamento,
      (select coalesce(sum(vv.qt_caixas) filter (where vv.tipo in ('venda','bonificacao')),0) from v vv where vv.cod_vendedor=m.cod_vendedor) as real_caixas
    from crm.metas m left join crm.vendedores vd on vd.cod_vendedor=m.cod_vendedor
    where m.mes = to_char(p_inicio,'YYYY-MM') and (p_vendedor is null or m.cod_vendedor=p_vendedor)) t),
  'visitas', (select jsonb_build_object(
    'checkins', (select count(*) from crm.checkins c where (c.timestamp at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim and (p_vendedor is null or c.cod_vendedor=p_vendedor)),
    'realizadas', (select count(*) from crm.checkins c where c.status_visita='realizada' and (c.timestamp at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim and (p_vendedor is null or c.cod_vendedor=p_vendedor)),
    'agendadas', (select count(*) from crm.agendamentos a where a.data_visita between p_inicio and p_fim and (p_vendedor is null or a.cod_vendedor=p_vendedor)),
    'pendentes', (select count(*) from crm.agendamentos a where a.status='pendente' and a.data_visita between p_inicio and p_fim and (p_vendedor is null or a.cod_vendedor=p_vendedor))
  ))
);
$$;


create or replace function mart.painel_pedidos(
  p_inicio date, p_fim date, p_vendedor text default null
) returns jsonb
language sql stable as $$
with
per as (select * from mart.pedidos where empresa='fugini' and tipo='venda'
        and data_pedido between p_inicio and p_fim and (p_vendedor is null or cod_vendedor=p_vendedor)),
ab as (select * from mart.pedidos where empresa='fugini' and tipo='venda' and status_grupo='aberto'
       and (p_vendedor is null or cod_vendedor=p_vendedor))
select jsonb_build_object(
  'carteira_aberta', (select jsonb_build_object(
    'valor', coalesce(sum(valor),0), 'caixas', coalesce(sum(qt_caixas),0),
    'pedidos', count(distinct nr_pedido), 'itens', count(*)) from ab),
  'fill_rate', (select jsonb_build_object(
    'caixas_faturadas', coalesce(sum(qt_caixas) filter (where status_grupo='faturado'),0),
    'caixas_cortadas', coalesce(sum(qt_caixas) filter (where status_grupo='corte'),0),
    'valor_cortado', coalesce(sum(valor) filter (where status_grupo='corte'),0),
    'pct', case when sum(qt_caixas) filter (where status_grupo in ('faturado','corte'))>0
           then round(100.0*sum(qt_caixas) filter (where status_grupo='faturado')/sum(qt_caixas) filter (where status_grupo in ('faturado','corte')),1) else null end
  ) from per),
  'corte_por_motivo', (select coalesce(jsonb_agg(t order by t.caixas desc),'[]'::jsonb) from (
    select coalesce(motivo_corte,'OUTRO') as motivo, sum(qt_caixas) as caixas, sum(valor) as valor
    from per where status_grupo='corte' group by 1) t),
  'carteira_por_vendedor', (select coalesce(jsonb_agg(t order by t.valor desc),'[]'::jsonb) from (
    select ab.cod_vendedor, coalesce(mv.nome, ab.cod_vendedor) as nome,
      sum(ab.valor) as valor, sum(ab.qt_caixas) as caixas, count(distinct ab.nr_pedido) as pedidos
    from ab left join mart.vendedores mv on mv.empresa='fugini' and mv.cod_vendedor=ab.cod_vendedor
    group by ab.cod_vendedor, mv.nome) t)
);
$$;
