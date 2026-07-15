-- Extração do item de nota fiscal (grão do painel) — base ems2fugini (PUB).
--
-- PROTEÇÃO DA PRODUÇÃO: o filtro de data é feito no CABEÇALHO (nota-fiscal),
-- que TEM índice líder por dt-emis-nota (ch-sit-nota / nfftrm-20). O item
-- (it-nota-fisc) NÃO tem índice por data — filtrar direto nele faria FULL
-- SCAN de 1,8M linhas. O join entra pelos índices: cabeçalho por data,
-- item pela PK (cod-estabel, serie, nr-nota-fis). Some o table scan.
--
-- Colunas EXPLÍCITAS (nunca SELECT *: evita os campos livres char-N que
-- estouram a largura SQL do Datasul). Encoding ISO-8859-1 (tratado na gravação).
-- :INI e :FIM = fronteiras da janela (dia p/ incremental; ano p/ carga cheia).
SELECT
    i."cod-estabel"   AS cod_estabel,
    i."serie"         AS serie,
    i."nr-nota-fis"   AS nr_nota_fis,
    i."nr-seq-fat"    AS nr_seq_fat,
    i."it-codigo"     AS it_codigo,
    i."nat-operacao"  AS nat_operacao,
    i."qt-faturada"   AS qt_faturada,
    i."un-fatur"      AS un_fatur,
    i."vl-merc-liq"   AS vl_merc_liq,
    i."vl-tot-item"   AS vl_tot_item,
    i."qt-devolvida"  AS qt_devolvida,
    i."cd-emitente"   AS cd_emitente,
    i."cd-vendedor"   AS cd_vendedor,
    i."nome-ab-cli"   AS nome_ab_cli,
    i."nr-pedcli"     AS nr_pedcli,
    i."dt-emis-nota"  AS dt_emis_nota,
    i."dt-cancela"    AS dt_cancela,
    i."ind-sit-nota"  AS ind_sit_nota
FROM PUB."nota-fiscal" n
JOIN PUB."it-nota-fisc" i
  ON i."cod-estabel" = n."cod-estabel"
 AND i."serie"       = n."serie"
 AND i."nr-nota-fis" = n."nr-nota-fis"
WHERE n."dt-emis-nota" BETWEEN :INI AND :FIM
