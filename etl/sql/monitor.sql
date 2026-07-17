-- ============================================================
-- monitor.sql — acompanhamento do ETL no dw_fugini.
-- Rode no DBeaver e reexecute para ver o progresso (status RODANDO = em curso).
-- ============================================================

-- Últimas execuções (segundos = duração; RODANDO ainda conta o tempo corrente)
select id, tarefa, status, registros, mensagem,
       to_char(iniciado_em, 'DD/MM HH24:MI:SS') as inicio,
       to_char(finalizado_em, 'HH24:MI:SS')     as fim,
       round(extract(epoch from coalesce(finalizado_em, now()) - iniciado_em)) as segundos
from stg.etl_log
order by id desc
limit 30;

-- Só o que está rodando agora
select * from stg.etl_log where status = 'RODANDO' order by id desc;

-- Falhas recentes (ver a coluna mensagem para o motivo)
select id, tarefa, mensagem, iniciado_em
from stg.etl_log where status = 'ERRO' order by id desc limit 20;

-- Volumetria do mart depois da carga
select 'vendas'   as tabela, count(*) as linhas, max(data_emissao)::text as ate from mart.vendas
union all select 'pedidos',  count(*), max(data_pedido)::text from mart.pedidos
union all select 'clientes', count(*), null from mart.clientes
union all select 'produtos', count(*), null from mart.produtos;
