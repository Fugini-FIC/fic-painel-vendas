# Caminho B — leitura direta do Progress, por partes (com cuidado)

Guia para ligar a extração **direta do ERP `ems2fugini` (produção crítica)** de
forma **escalonada e medível**, avançando só quando a etapa anterior passar limpa
e sem impacto. Use quando precisar do que o CSV (Caminho A) não traz: **natureza
de operação** (separar bonificação), preço de tabela × praticado, crédito suspenso.

> Lembre: o **Caminho A (CSV)** já cobre Fase 1/2a/2b com **zero risco** de
> produção. O Caminho B toca no ERP — por isso, ir devagar.

## Proteções já embutidas no código

- **Dirty read** (`READ UNCOMMITTED`) na conexão JDBC (`common/db.py`): a
  extração **não pega lock nem espera transação** do ERP.
- **Filtro de data no cabeçalho indexado** (`nota-fiscal`, índice líder por
  `dt-emis-nota`) com join no item pela PK → **sem full scan** de `it-nota-fisc`.
- **Carga histórica em chunks por ano** (commit por ano, retomável).
- **`fetchmany`** (5.000) em vez de puxar tudo de uma vez.

---

## As 5 partes (do mais leve ao mais pesado)

| Parte | O que faz | Impacto na produção |
|---|---|---|
| 0. Pré-requisitos | Python, Java, `openedge.jar`, `jaydebeapi` | nenhum |
| 1. Teste de conexão | Confirma dirty read + 2 consultas leves | ~zero (não varre nada) |
| 2. Dimensão pequena | Extrai só a `natur-oper` (~2 mil linhas) | desprezível |
| 3. Janela estreita | 1–2 dias de `it-nota-fisc` (via índice) — **medir** | baixo, medível |
| 4. Incremental | Janela de 7 dias | baixo |
| 5. Histórico | Ano a ano, **em horário de baixa carga** | controlado |

Avise o time do ERP/DBA antes da primeira execução, para acompanharem as sessões
(`_Connect` / `_Lock`) via PROMON / OE Management.

---

## Parte 0 — Pré-requisitos

1. **Python** — instalar de python.org marcando **"Add python.exe to PATH"**.
   Confirmar: `python --version`
2. **Java** — o Caminho B precisa (o DBeaver já usa um). Confirmar: `java -version`.
   Se não estiver no PATH, definir `JAVA_HOME` para a pasta do Java (com `bin\java.exe`).
3. **Localizar o `openedge.jar`** — no DBeaver: *Database → Driver Manager →
   Progress OpenEdge → Edit → Libraries*. Anotar o caminho.
4. **Instalar libs:**
   ```cmd
   cd C:\Users\ensouza\Documents\Fugini\fic-painel-vendas
   git pull
   cd etl
   python -m pip install -r requirements.txt jaydebeapi JPype1
   ```
5. **Configurar o `.env`** (descomentar a seção Caminho B):
   ```cmd
   copy config\.env.example config\.env
   notepad config\.env
   ```
   Preencher: `PROGRESS_JDBC_JAR` (passo 3), `PROGRESS_HOST`/`PROGRESS_PORT`
   (mesmos da conexão do DBeaver → *Edit Connection*), `PROGRESS_USER=sysprogress`,
   `PROGRESS_PASSWORD`, e também `DW_HOST`/`DW_PASSWORD` + `PAINEL_SUPABASE_*`.

## Parte 1 — Teste de conexão (primeiro comando de verdade)

```cmd
python teste_conexao_progress.py
```
Imprime o isolamento (**esperado = 1 / READ UNCOMMITTED**) e o tempo de 2
consultas leves. Se não for dirty read, o script **para sozinho** — não prosseguir.
Espere: "OK — conexao segura validada".

## Parte 2 — Dimensão pequena (valida o pipeline)

Cria as camadas do dw (se ainda não criou) e extrai só a `natur-oper`:
```cmd
python -m common.run_sql sql\010_estrutura_dw_fugini.sql
python -m common.run_sql sql\020_raw.sql
python -m extract.extract_progress --empresa fugini --base ems2fugini --entidade natur_oper
python -m common.run_sql sql\030_dim_natureza.sql
```
Confira no dw: `select tipo, count(*) from stg.dim_natureza group by 1;`
Deve mostrar venda/bonificacao/devolucao/ignorar. Impacto na produção: desprezível.

## Parte 3 — Janela estreita do fato (MEDIR)

Extrai poucos dias de `it-nota-fisc` para medir o tempo e confirmar que entra
por índice. Ajuste `JANELA_DIAS=2` no `.env` e rode:
```cmd
python -m extract.extract_progress --empresa fugini --base ems2fugini --entidade it_nota_fisc
```
**Anote o tempo.** Peça ao DBA um EXPLAIN da query confirmando que **não há
TABLE SCAN** em `it-nota-fisc` (deve entrar por `nota-fiscal` + PK do item).
Se rápido e sem contenção → seguir. Se lento → parar e revisar o plano.

## Parte 4 — Incremental (rotina)

Volte `JANELA_DIAS=7` e rode o fluxo completo (dimensões + fato + mart + publish):
```cmd
run_incremental.bat
```
Depois, agendar no Task Scheduler (1–2x/dia, fora do pico de faturamento).

## Parte 5 — Histórico completo (em horário de baixa carga)

Só na **madrugada / fim de semana**. Define o início do histórico no `.env`
(`PROGRESS_HIST_ANO_INI=2024`, diminua para mais histórico) e roda:
```cmd
run_full.bat
```
Lê ano a ano (transação curta, retomável). Acompanhar `_Lock`/`_Connect` na 1ª vez.

---

## Se algo onerar a produção

- Abortar a sessão do ETL: identificar o usernum em `_Connect` e
  `proshut <base> -C disconnect <usernum>` (o DBA faz) — sem derrubar o banco.
- Reduzir escopo: `JANELA_DIAS` menor, `PROGRESS_HIST_ANO_INI` mais recente.
- Última opção: voltar ao **Caminho A (CSV)**, que não toca na produção.

Checklist de segurança completo e VSTs a monitorar: ver
`SETUP-MAQUINA-INTERNA.md` → seção "Segurança da produção".
