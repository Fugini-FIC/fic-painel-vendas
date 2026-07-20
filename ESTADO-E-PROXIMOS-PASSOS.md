# Painel de Vendas Fugini — Estado atual e próximos passos

> Documento de continuidade. Atualizado em 20/jul/2026.

## Arquitetura definitiva

```
Origens Progress (TOTVS Datasul)        DW / base principal            Apps
ems2fugini ─┐
des2fugini  ├── ETL (CSV ou JDBC) ──►  dw_fugini (Postgres interno)  ◄── Painel de Vendas
wdkforms    │                          mart.*  = vendas/clientes/         (Next.js, INTERNO,
ems2mult   ─┘                          produtos/pedidos                    lê via pg)
                                       crm.*   = check-ins sincronizados
                                          ▲
                          Supabase crm_fugini ── app de CHECK-IN dos vendedores
                          (login do painel + visitas/agenda; sincronizado p/ dw_fugini)
```

- **dw_fugini** = base principal, de onde o painel lê. Fica na rede interna (192.168.0.242).
- **Supabase crm_fugini** = só o app de check-in de campo + login do painel.
- O Supabase `db_FIC_Painel` foi **descontinuado** (não usar).
- Dados de venda **não saem da rede**; só o login toca o Supabase.

## Duas formas de extração (fonte → dw_fugini)

- **Caminho A — CSV (adotado):** lê os CSVs que o ERP já exporta para
  `\\192.168.0.226\pdi`. **Zero impacto na produção.** Runner: `etl/run_csv.bat`.
  Limitação: sem natureza (bonificação não separa); sem preço de tabela.
- **Caminho B — JDBC direto (alternativa):** lê o Progress com proteções (dirty
  read, índice do cabeçalho, chunk por ano). Só se precisar de natureza/preço.
  Passo a passo seguro: `etl/CAMINHO-B-PASSO-A-PASSO.md`.

## O que está PRONTO (código commitado)

| Fase | Entrega | Fonte |
|---|---|---|
| **1** | Faturamento: R$, caixas, ticket, preço médio/caixa, drop size, SKUs/pedido, por dia/vendedor/família | CSV `totvs_itensnotafiscal` |
| **2a** | Carteira: canal, limite, ativos/inativos (recência 90d), positivação; vendedores com nome | CSV `totvs_cliente`/`totvs_produto` |
| **2b** | Pedidos: **carteira em aberto**, **fill rate**, **corte por motivo** (QUALI/COML/LOG/DIR) | CSV `totvs_itenspedido` |
| Infra | Painel interno (pg→dw_fugini), funções `mart.painel_vendas/painel_pedidos`, sync de check-ins, monitor (`stg.etl_log`) | — |

## O que FALTA EXECUTAR (nada disso rodou ainda)

Tudo é código; a execução acontece na **máquina interna** que enxerga o dw_fugini.

1. **Ambiente**: instalar Python (ETL) e Node.js 20+ (painel) na máquina interna.
2. **dw_fugini** (uma vez): rodar `etl/sql/010`, `etl/sql/021`, `dw/005_crm.sql`,
   `dw/010_painel_functions.sql`.
3. **`.env` do ETL** e **`.env.local` do painel**: preencher senhas (dw_fugini +
   service_role do crm_fugini). Ver `PAINEL-INTERNO.md` e `SETUP-MAQUINA-INTERNA.md`.
4. **Carga**: `etl/run_csv.bat` (após o `.bat` de cópia dos CSVs).
5. **Painel**: `npm install && npm run build && npm run start` na máquina interna
   (validar o build — foi uma reescrita grande de Supabase→Postgres).
6. **Login do gestor**: garantir usuário `role='master'` no `crm_fugini` (passo 2
   do `PAINEL-INTERNO.md`).

## Próximos passos (roadmap)

- [ ] **Executar e validar** o Caminho A ponta a ponta (itens acima) — ver os
      números reais no painel e reconciliar faturamento com o TOTVS.
- [ ] **Fase 2d — Campanhas**: quando os CSVs do portal (`clic_campanha`,
      `campanha_com`, `clic_itenscampanha`) aparecerem em `\pdi`. A coluna
      `campanha` do pedido já é carregada; falta o mart + KPIs de incremental/ROI.
- [ ] **Fase 2c — Tablet/pré-pedido** (`pre_pedido`/`item_pre_pedido`, wdkforms):
      funil visita→pré-pedido→pedido→nota e conversão. (CSVs do portal ainda não
      estavam na pasta na última verificação.)
- [ ] **Erosão de preço** (tabela × praticado, `vl-pretab`×`vl-preuni`) e
      **bonificação separada** e **crédito suspenso**: só via Caminho B (leitura
      direta) — avaliar se o valor justifica ligar o B, ou pedir esses campos no
      export CSV do ERP.
- [ ] **Empresa Cristal** (`ems2cristal`): já há coluna `empresa` no mart; falta
      carregar a 2ª empresa e habilitar filtro no painel.
- [ ] **Hierarquia gerente→vendedor** (`ped-repre` / `rep-indireto`): drill de
      gestão por gerente.
- [ ] **Agendar** `run_csv.bat` no Task Scheduler (após a cópia dos CSVs).

## Documentos de referência (no repo)

- `PAINEL-INTERNO.md` — hospedar o painel interno lendo o dw_fugini.
- `etl/SETUP-MAQUINA-INTERNA.md` — setup e execução do ETL (Caminho A e B).
- `etl/CAMINHO-B-PASSO-A-PASSO.md` — leitura direta segura do Progress.
- `etl/schema/DICIONARIO.md` — dicionário das tabelas de origem.
- `etl/sql/monitor.sql` — acompanhamento do ETL (`stg.etl_log`).
