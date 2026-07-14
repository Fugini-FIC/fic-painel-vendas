# ETL — Progress (TOTVS Datasul) → dw_fugini → Supabase → Painel

Extrai vendas da base Progress `ems2fugini` (produção), organiza em camadas no
Postgres interno **dw_fugini** (raw → stg → mart) e publica o mart no Supabase
`db_FIC_Painel`, de onde o painel lê. A Vercel nunca alcança a rede interna: a
saída é sempre push HTTPS.

## Pré-requisitos (uma vez)

1. Python 3 na máquina interna + `pip install -r requirements.txt`
2. Java + o `openedge.jar` (mesmo do DBeaver) para o JDBC do Progress
3. `cp config/.env.example config/.env` e preencher:
   - Progress: host, porta, `sysprogress` + senha, caminho do `openedge.jar`
   - dw_fugini: host/porta/senha do Postgres interno
   - Supabase: URL + service_role do `db_FIC_Painel`
4. Criar a estrutura no dw_fugini (SQL Editor / psql):
   ```
   psql ... -f sql/010_estrutura_dw_fugini.sql
   psql ... -f sql/020_raw.sql
   ```
5. Preencher o mapa representante→vendedor (uma vez, com o comercial):
   ```sql
   insert into stg.map_vendedor (empresa, cod_rep, cod_vendedor)
   values ('fugini', '90', 'SC01');   -- exemplo
   ```

## Rodar

- **Primeira carga (histórico):** `run_full.bat` — em horário de baixa carga do
  ERP (a `it-nota-fisc` tem ~1,8M+ notas). Faz dimensões → classifica naturezas →
  monta produtos → extrai todo o histórico → monta mart → publica.
- **Incremental (rotina):** `run_incremental.bat` — janela móvel de `JANELA_DIAS`
  (padrão 7). Agendar no Task Scheduler a cada 1–2h em horário comercial.

## Camadas (schemas no dw_fugini)

- `raw`  — cópia fiel do Progress (it_nota_fisc, natur_oper, item, fam_comerc)
- `stg`  — controle (etl_log, etl_checkpoint), dim_natureza (classificação), map_vendedor
- `mart` — modelo do painel: vendas, produtos, clientes

## Regras de negócio implementadas

- **Tipo de movimento** classificado por natureza de operação (`stg.dim_natureza`,
  regra por denominação): venda / bonificação / devolução / ignorar. Bonificação
  (5910/6910/5911/6911 e "BONIF DENTRO DA NF") conta caixas, não receita.
- **Notas canceladas** (`dt-cancela`) são excluídas do mart.
- **Janela móvel** reprocessa os últimos dias, capturando correções/cancelamentos.
- **valor** sempre positivo; o `tipo` carrega o sinal (a função `painel_vendas()`
  faz `case tipo when 'devolucao' then -valor`).

## Verificar / próximas fases

- [ ] Conferir `un-fatur` da `it-nota-fisc`: se ≠ "CX", ajustar conversão de caixas
      em `transform/build_mart.py` (hoje usa `qt-faturada` direto).
- [ ] **Faturamento ainda é BRUTO**: devolução DE venda é nota de ENTRADA e não
      está na `it-nota-fisc` (saídas). Fase 2: extrair a origem das devoluções
      (docum-est) para o líquido.
- [ ] Fase 2 — enriquecer `mart.clientes` da `emitente` (nome, CNPJ, **canal**
      via `cod-canal-venda`, **limite de crédito**) e nomes de vendedor da `repres`.
- [ ] Empresa Cristal (`ems2cristal`): adicionar coluna `empresa` nas tabelas do
      Supabase e na chave antes de ligar a segunda empresa.
