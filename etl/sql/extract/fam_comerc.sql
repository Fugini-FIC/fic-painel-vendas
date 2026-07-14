-- Extração da família comercial (descrição p/ agrupar por família) — base ems2fugini (PUB).
-- Carga full. Nomes padrão Datasul (fm-cod-com, descricao) — confirmar na base.
SELECT
    "fm-cod-com" AS fm_cod_com,
    "descricao"  AS descricao
FROM PUB."fam-comerc"
