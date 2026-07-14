-- ============================================================
-- discovery.sql — rodar no DBeaver para mapear as bases Progress
-- ANTES de finalizar a extração. Rode cada bloco na base indicada.
-- Sintaxe OpenEdge SQL: schema PUB, colunas com hífen entre aspas duplas.
-- ============================================================

-- 1) TESTE DE PRODUÇÃO — rodar em ems2fugini E em ems2mult e comparar.
--    Produção = emissao_mais_recente perto de hoje.
SELECT COUNT(*) AS qtd_notas, MAX("dt-emis-nota") AS emissao_mais_recente
FROM PUB."nota-fiscal";

-- 2) Confirma que as tabelas-chave de vendas existem (roda na base de produção).
--    Se alguma der erro, o nome é diferente — avisar.
SELECT COUNT(*) FROM PUB."nota-fiscal";   -- cabeçalho da NF
SELECT COUNT(*) FROM PUB."it-nota-fisc";  -- item da NF (grão do painel)
SELECT COUNT(*) FROM PUB."emitente";      -- cliente
SELECT COUNT(*) FROM PUB."item";          -- produto
SELECT COUNT(*) FROM PUB."fam-comerc";    -- família comercial
SELECT COUNT(*) FROM PUB."repres";        -- representante/vendedor
SELECT COUNT(*) FROM PUB."natur-oper";    -- natureza de operação (venda/devol/bonif)

-- 3) Amostra do cabeçalho da NF (OpenEdge usa TOP e {d '...'} para data).
SELECT TOP 5 * FROM PUB."nota-fiscal"
WHERE "dt-emis-nota" >= {d '2026-07-01'};

-- 4) Amostra do item da NF.
SELECT TOP 5 * FROM PUB."it-nota-fisc";

-- 5) Naturezas de operação usadas — é o que classifica venda/devolução/bonificação.
--    Copiar o resultado: vira a planilha config/naturezas.csv
SELECT "nat-operacao", "denominacao", "tipo", "cod-cfop"
FROM PUB."natur-oper"
ORDER BY "nat-operacao";

-- 6) Estabelecimentos (para separar empresas/filiais dentro da base).
SELECT DISTINCT "cod-estabel" FROM PUB."nota-fiscal" ORDER BY 1;
