-- Extração das naturezas de operação (dimensão) — base ems2fugini (PUB).
-- Carga full (tabela pequena). Classificada em stg.dim_natureza por regra.
SELECT
    "nat-operacao" AS nat_operacao,
    "denominacao"  AS denominacao,
    "tipo"         AS tipo,
    "cod-cfop"     AS cfop
FROM PUB."natur-oper"
