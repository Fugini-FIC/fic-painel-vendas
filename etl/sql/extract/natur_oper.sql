-- Extração das naturezas de operação (dimensão) — base ems2fugini (PUB).
-- Carga full (tabela pequena). Classificada em stg.dim_natureza por regra.
-- log-natureza-bonif: flag oficial do Datasul que marca bonificação.
SELECT
    "nat-operacao"       AS nat_operacao,
    "denominacao"        AS denominacao,
    "tipo"               AS tipo,
    "cod-cfop"           AS cfop,
    "log-natureza-bonif" AS log_bonif
FROM PUB."natur-oper"
