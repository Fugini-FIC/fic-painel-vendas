-- ============================================================
-- 075_mart_pedidos.sql — monta mart.pedidos a partir de raw_csv.pedido.
-- Roda após carregar raw_csv.pedido (e mart.clientes/produtos p/ enriquecer).
-- Snapshot completo (refaz fugini). Reexecutável.
--
-- status_item → status_grupo:
--   'Faturado'  → faturado (virou NF)
--   'Carteira'  → aberto   (backlog / receita futura)
--   demais      → corte    (QUALI/COML/LOG/DIR... = não entregue; motivo = prefixo)
-- tipo: 'Dev' → devolucao ; senão venda.
-- ============================================================

delete from mart.pedidos where empresa = 'fugini';

insert into mart.pedidos (empresa, nr_pedido, it_codigo, cod_cliente, cod_vendedor,
                          qt_caixas, valor, tipo, status_item, status_grupo,
                          motivo_corte, familia, data_pedido, campanha, carregado_em)
select
  'fugini',
  p.nr_pedido,
  p.it_codigo,
  p.cod_cliente,
  max(c.cod_vendedor),
  sum(coalesce(p.qt_caixas, 0)),
  abs(sum(coalesce(p.valor, 0))),
  case when lower(coalesce(max(p.tipo), '')) like 'dev%' then 'devolucao' else 'venda' end,
  max(p.status_item),
  case
    when lower(max(coalesce(p.status_item, ''))) = 'faturado' then 'faturado'
    when lower(max(coalesce(p.status_item, ''))) = 'carteira' then 'aberto'
    when trim(max(coalesce(p.status_item, ''))) = ''          then 'aberto'
    else 'corte'
  end,
  case
    when lower(max(coalesce(p.status_item, ''))) in ('faturado', 'carteira', '') then null
    else split_part(max(p.status_item), '-', 1)          -- QUALI, COML, LOG, DIR...
  end,
  coalesce(max(pr.familia), 'SEM FAMILIA'),
  max(p.data_pedido),
  nullif(max(trim(p.campanha)), ''),
  now()
from raw_csv.pedido p
left join mart.clientes c on c.empresa = 'fugini' and c.cod_cliente = p.cod_cliente
left join mart.produtos pr on pr.empresa = 'fugini' and pr.it_codigo = p.it_codigo
where p.nr_pedido is not null and p.it_codigo is not null and p.cod_cliente is not null
group by p.nr_pedido, p.it_codigo, p.cod_cliente;
