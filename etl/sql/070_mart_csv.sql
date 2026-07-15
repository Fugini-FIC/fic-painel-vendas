-- ============================================================
-- 070_mart_csv.sql — monta mart.produtos/clientes/vendas a partir do raw_csv.
-- Roda no dw_fugini após carregar raw_csv.* (produto, cliente, nf).
-- Snapshot completo: refaz o mart de fugini a cada carga (o CSV é a fonte
-- inteira). Reexecutável.
--
-- LIMITAÇÃO do CSV: não há natureza de operação → bonificação não se separa.
--   tipo = 'devolucao' se valor < 0, senão 'venda'. (Para separar bonificação
--   seria preciso a leitura direta do ERP ou o export ganhar nat-operacao.)
-- ============================================================

-- ---------- Produtos (família comercial já vem por nome) ----------
insert into mart.produtos (empresa, it_codigo, descricao, familia)
select 'fugini', it_codigo, max(descricao),
       coalesce(nullif(max(trim(familia)), ''), 'SEM FAMILIA')
from raw_csv.produto
where it_codigo is not null
group by it_codigo
on conflict (empresa, it_codigo) do update set
  descricao = excluded.descricao,
  familia   = excluded.familia;

-- ---------- Clientes (canal por nome, limite disponível) ----------
insert into mart.clientes (empresa, cod_cliente, nome, cnpj, canal, cidade, uf,
                           cod_vendedor, limite_credito, credito_suspenso, dt_ult_venda)
select 'fugini', cod_cliente, max(nome), max(cnpj),
       nullif(max(trim(canal)), ''),
       null, null,
       nullif(max(trim(cod_erc)), ''),
       coalesce(max(limite_disp), 0),
       false,                          -- CSV não traz ind-cre-cli (crédito suspenso)
       null
from raw_csv.cliente
where cod_cliente is not null
group by cod_cliente
on conflict (empresa, cod_cliente) do update set
  nome           = excluded.nome,
  cnpj           = excluded.cnpj,
  canal          = excluded.canal,
  cod_vendedor   = excluded.cod_vendedor,
  limite_credito = excluded.limite_credito;

-- ---------- Vendas (grão item de NF; agrega por chave natural) ----------
delete from mart.vendas where empresa = 'fugini';

insert into mart.vendas (empresa, estabel, nr_nota, nr_pedido, cod_cliente,
                         cod_vendedor, it_codigo, qt_caixas, valor, tipo,
                         familia, data_emissao, carregado_em)
select
  'fugini',
  max(n.estabel),
  n.nr_nota,
  nullif(max(n.nr_pedido), ''),
  n.cod_cliente,
  max(n.cod_vendedor),
  n.it_codigo,
  sum(coalesce(n.qt_caixas, 0)),
  abs(sum(coalesce(n.valor, 0))),
  case when sum(coalesce(n.valor, 0)) < 0 then 'devolucao' else 'venda' end,
  coalesce(max(p.familia), 'SEM FAMILIA'),
  max(n.data_emissao),
  now()
from raw_csv.nf n
left join mart.produtos p on p.empresa = 'fugini' and p.it_codigo = n.it_codigo
where n.nr_nota is not null and n.it_codigo is not null and n.cod_cliente is not null
group by n.nr_nota, n.it_codigo, n.cod_cliente;
