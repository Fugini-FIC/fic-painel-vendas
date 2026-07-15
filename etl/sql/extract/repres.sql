-- Extração do cadastro de vendedores (repres) — base ems2mult (PUB). Carga full.
-- dt-deslig: desligamento (nulo = ativo). rep-indireto: hierarquia (rep pai).
SELECT
    "cod-rep"      AS cod_rep,
    "nome"         AS nome,
    "nome-abrev"   AS nome_abrev,
    "nome-ab-reg"  AS nome_ab_reg,
    "rep-indireto" AS rep_indireto,
    "dt-deslig"    AS dt_deslig,
    "ind-situacao" AS ind_situacao
FROM PUB."repres"
