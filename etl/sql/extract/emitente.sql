-- Extração do cadastro de clientes (emitente) — base ems2mult (PUB). Carga full.
-- Só clientes (identific <> 2 = exclui fornecedor puro). Colunas explícitas.
-- canal, limite e status de crédito vêm daqui (nada de tabela extra).
SELECT
    "cod-emitente"     AS cod_emitente,
    "nome-emit"        AS nome_emit,
    "nome-abrev"       AS nome_abrev,
    "cgc"              AS cgc,
    "cidade"           AS cidade,
    "estado"           AS estado,
    "cod-rep"          AS cod_rep,
    "cod-canal-venda"  AS cod_canal_venda,
    "lim-credito"      AS lim_credito,
    "ind-cre-cli"      AS ind_cre_cli,
    "ind-sit-emitente" AS ind_sit_emitente,
    "dt-ult-venda"     AS dt_ult_venda,
    "identific"        AS identific
FROM PUB."emitente"
WHERE "identific" <> 2
