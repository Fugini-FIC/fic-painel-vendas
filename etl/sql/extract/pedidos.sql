-- Extração de pedidos (ped-venda + ped-item) — base ems2fugini (PUB).
-- PILOTO: hard-scoped nos 5 vendedores 6003-6007 (nr-pedcli prefixado pelo
-- cod-rep, ex.: "6003.207033" — convenção interna da Fugini).
-- Filtros de negócio replicados exatamente como recebidos: exclui reps de
-- logística/transferência, cliente CRISTALINA (matriz), itens de brinde/
-- amostra (60./09./A%), e pedidos cancelados (cod-sit-ped = 6).
-- :INI e :FIM = janela de dt-implant (incremental).
SELECT
  i."nome-abrev"    AS nome_abrev,
  i."nr-pedcli"     AS nr_pedcli,
  v."cod-emitente"  AS cod_emitente,
  i."nr-sequencia"  AS nr_sequencia,
  i."it-codigo"     AS it_codigo,
  it."descricao-1"  AS descricao_1,
  it."descricao-2"  AS descricao_2,
  i."qt-pedida"     AS qt_pedida,
  i."vl-preori"     AS preco_venda,
  i."qt-pedida" * i."vl-preori" AS valor_total_venda,
  v."dt-implant"    AS dt_venda,
  v."no-ab-reppri"  AS representante,
  v."cod-sit-ped"   AS situacao_pedido
FROM PUB."ped-item" i
INNER JOIN PUB."ped-venda" v
  ON i."nome-abrev" = v."nome-abrev"
 AND i."nr-pedcli"  = v."nr-pedcli"
LEFT JOIN PUB."item" it
  ON i."it-codigo" = it."it-codigo"
WHERE v."dt-implant" BETWEEN :INI AND :FIM
  AND v."no-ab-reppri" NOT IN ('REMESSA POLP', 'TRANSFERENCI', 'LOGISTICA')
  AND i."nome-abrev" <> 'CRISTALINA'
  AND i."it-codigo" NOT LIKE '60.%'
  AND i."it-codigo" NOT LIKE '09.%'
  AND i."it-codigo" NOT LIKE 'A%'
  AND v."cod-sit-ped" <> 6
  AND i."nr-pedcli" >= 6003 AND i."nr-pedcli" < 6008
