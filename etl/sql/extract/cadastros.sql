-- Extração de cadastros de clientes feitos pelos representantes — base
-- wdkforms (PUB."wt_cliente_repres"). PILOTO: hard-scoped nos 5 vendedores
-- 6003-6007. Carga full (delete + reload) — sem filtro de data, é o
-- cadastro corrente de cada cliente novo.
-- ATENÇÃO: "cod-emitente" NÃO é único — clientes ainda não aprovados no ERP
-- ficam com cod-emitente=0 (placeholder), vários registros compartilham
-- esse valor. A chave real é "tmp-emitente" (id temporário do cadastro).
SELECT
  w."tmp-emitente"      AS tmp_emitente,
  w."cod-emitente"      AS cod_emitente,
  w."nome-emit"         AS nome_emit,
  w."cidade"            AS cidade,
  w."estado"            AS estado,
  w."cgc_cpf"           AS cgc_cpf,
  w."telefone"          AS telefone,
  w."e-mail"            AS email,
  w."cod-rep"           AS cod_rep,
  w."nome-abrev"        AS nome_abrev,
  w."id_status"         AS id_status,
  w."desc_status"       AS desc_status,
  w."canal-distribuicao" AS canal_distribuicao,
  w."dt_implantacao"    AS dt_implantacao,
  w."dt_impl_web"       AS dt_impl_web,
  w."dt_efetiva_coml"   AS dt_efetiva_coml,
  w."lim_credito"       AS lim_credito,
  w."vlr_credito_sugerido" AS vlr_credito_sugerido
FROM PUB."wt_cliente_repres" w
WHERE w."cod-rep" >= 6003 AND w."cod-rep" < 6008
