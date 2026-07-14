-- Extração do cadastro de itens (produtos) — base ems2fugini (PUB). Carga full.
-- fm-cod-com = família COMERCIAL (agrupamento de venda); fm-codigo = família de materiais.
SELECT
    "it-codigo"  AS it_codigo,
    "desc-item"  AS desc_item,
    "fm-codigo"  AS fm_codigo,
    "fm-cod-com" AS fm_cod_com,
    "ge-codigo"  AS ge_codigo,
    "un"         AS un
FROM PUB."item"
