-- Extração do item de nota fiscal (grão do painel) — base ems2fugini (PUB).
-- Colunas EXPLÍCITAS (nunca SELECT *: evita os campos livres char-N que
-- estouram a largura SQL do Datasul). Filtro pela janela móvel :CORTE.
-- Encoding da base = ISO-8859-1 (tratado na gravação).
SELECT
    "cod-estabel"   AS cod_estabel,
    "serie"         AS serie,
    "nr-nota-fis"   AS nr_nota_fis,
    "nr-seq-fat"    AS nr_seq_fat,
    "it-codigo"     AS it_codigo,
    "nat-operacao"  AS nat_operacao,
    "qt-faturada"   AS qt_faturada,
    "un-fatur"      AS un_fatur,
    "vl-merc-liq"   AS vl_merc_liq,
    "vl-tot-item"   AS vl_tot_item,
    "qt-devolvida"  AS qt_devolvida,
    "cd-emitente"   AS cd_emitente,
    "cd-vendedor"   AS cd_vendedor,
    "nome-ab-cli"   AS nome_ab_cli,
    "nr-pedcli"     AS nr_pedcli,
    "dt-emis-nota"  AS dt_emis_nota,
    "dt-cancela"    AS dt_cancela,
    "ind-sit-nota"  AS ind_sit_nota
FROM PUB."it-nota-fisc"
WHERE "dt-emis-nota" >= :CORTE
