# Dicionário de dados — origens Progress (Fugini)

Consolidado a partir do DDL real (arquivos `.sql` nesta pasta). Só as colunas
relevantes para o painel. **Nomes confirmados** — usar exatamente estes na extração.

## Chaves de junção (relacionamentos por convenção, não há FK no banco)

```
pre_pedido/item_pre_pedido ─(nome-abrev, nr-pedcli)─► ped-venda/ped-item ─(nr-pedcli via nome-abrev)─► it-nota-fisc
ped-venda ─(nr-pedido)─► ped-repre (gerente/rep do pedido)
emitente ─(cod-emitente = cod_cliente)─► cliente_inf_adic (tablet) ; ─(cod-rep)─► repres
item ─(fm-cod-com)─► fam-comerc (família comercial) ; ─(it-codigo)─► item_per_familia (campanha mensal)
```

## ems2fugini

### `ped-venda` (cabeçalho do pedido) — PK lógica `(nome-abrev, nr-pedcli)`; interno `nr-pedido`
- `cod-estabel`, `nome-abrev`(cliente), `nr-pedcli`(nº pedido cliente), `nr-pedido`(interno)
- `dt-emissao`, **`dt-implant`(data da venda)**, `dt-entrega`, **`dt-cancela`**(exclui)
- `nat-operacao`, `no-ab-reppri`(representante principal), `cod-sit-ped`(situação)
- `vl-tot-ped`, `vl-liq-ped`, `vl-liq-abe`(líquido em aberto), `perc-desco1/2`

### `ped-item` (item do pedido) — PK `(nome-abrev, nr-pedcli, nr-sequencia)`
- `it-codigo`, **`qt-pedida`, `qt-atendida`, `qt-pendente`, `qt-devolvida`**
- **`vl-pretab`(preço tabela), `vl-preori`(preço venda), `vl-preuni`(preço c/ desconto)**, `per-des-item`
- `dt-entrega`, `dt-canseq`(cancel. item), `cod-sit-item`

### `ped-repre` (representantes/gerente por pedido) — PK `(nr-pedido, nome-ab-rep, cod-classificador)`
- `nr-pedido`, `nome-ab-rep`, **`ind-repbase`**(1 = rep base), `perc-comis`
  → hierarquia: rep base vs demais no pedido

### `it-nota-fisc` (item da NF — faturamento, JÁ na Fase 1)
- grão do `mart.vendas`; liga ao pedido por `nr-pedcli` + `nome-ab-cli`

### `item` (produto) — PK `it-codigo`
- `it-codigo`, `desc-item`/`descricao-1`, `fm-codigo`(fam. materiais), **`fm-cod-com`(fam. comercial)**, `ge-codigo`, `un`

### `fam-comerc` (família COMERCIAL) — PK `fm-cod-com`  → `descricao`, `un`, `fator-conver`
### `familia` (família de materiais) — PK `fm-codigo` → `descricao`

## ems2mult

### `emitente` (cliente) — PK `cod-emitente`
- `cod-emitente`, `nome-emit`(razão), `nome-abrev`, `cgc`, `cidade`, `estado`, `cod-rep`
- **`cod-canal-venda`(CANAL)**, **`lim-credito`(limite)**, `lim-adicional`
- **`ind-cre-cli`(status crédito: 4=suspenso)**, `ind-sit-emitente`, **`dt-ult-venda`(última venda)**
- `identific`(1=cliente), `nome-mic-reg`(região), `dt-atualiza`+`hra-atualiz`(watermark)

### `repres` (vendedor) — PK `cod-rep`
- `cod-rep`, `nome`(completo), `nome-abrev`, `nome-ab-reg`(região)
- **`rep-indireto`**(direto×indireto), **`dt-deslig`(desligamento)**, `ind-situacao`, `cod-emitente`

## wdkforms

### `pre_pedido` (pré-pedido do TABLET) — PK `(nome-abrev, nr-pedcli)`
- `nr-pedido`, `cod-estabel`, `cod-emitente`, `no-ab-reppri`, `cod-rep`
- **`desc_status`, `id_status`, `status_pedido`**, **`dt-implant`(transmissão)**, `hr-implant`
- `dt_import`, `data_fatur`, `dt_reprova`, `vl-tot-ped`, `vl-liq-ped`, `campanha`, `semaforo`

### `item_pre_pedido` — PK `(nome-abrev, nr-pedcli, it-codigo, ep-codigo)`
- `it-codigo`, `qtde_pedida`, `preco_unit`, `perc_desconto`, `qtde_bonificada`, `vlr_tot_item`

### `cliente_inf_adic` (ficha do cliente no TABLET) — PK `cnpj`; liga por `cod-emitente`
- Rica em atributos comerciais: `canal_distrib`, `cod_canal_venda`, `lim_disponivel`, `lim_credito`
- **`frequencia-visita`, `nr-check-out`** (liga ao CRM de campo!), `qtd_lojas_cliente`, `equipe_vendas`
- `clie_camp_food`, `qtde_cxs_pallet`, `compra_fugini`, `status_cadastro`

### `campanha_caixa` (R$/caixa por produto) — idx `(it-codigo, cod-canal-venda, nome-ab-reg, data_inicio, data_fim)`
- `it-codigo`, `cod-canal-venda`, `nome-ab-reg`, `data_inicio`, `data_fim`, `valor_gera_verba`, `preco_gera_verba`

### `campanha_com` (campanha comercial casada) — PK `cod_campanha`
- `cod_campanha`, `descr_campanha`, `data_inicio`, `data_fim`

## des2fugini (base de DESENVOLVIMENTO — validar disponibilidade em rotina)

### `familia_per_item` (linha personalizada/mensal) — PK `(cod_familia, ano_ref, mes_ref)`
- `cod_familia`, `desc_familia`, `perc_premio`, `peso_fam`

### `item_per_familia` (item por categoria de campanha) — PK `(it-codigo, ano_ref, mes_ref)`
- `cod_familia`(food=6), `it-codigo`, `preco_tabela`, `prd_foco`, `contab_camp`

### `familia_produto_param` (parâmetros de campanha mensal) — PK `(ano_camp, mes_camp)`
- gatilhos e prêmios: `perc_camp_fat_fug`, `preco_med_caixa`, `gat_caixa_clt`, objetivos semanais
