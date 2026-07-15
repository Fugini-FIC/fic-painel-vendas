# Guia de execução — máquina interna (primeira carga do Painel de Vendas)

Este guia é para a **máquina interna que enxerga o `dw_fugini`** e a pasta dos
CSVs (a mesma que já roda o ETL do TOTVS, IP `192.168.0.242`). Vercel/Supabase
são alcançados por internet (push de saída).

## Dois caminhos de extração

- **Caminho A — CSV (RECOMENDADO, adotado):** lê os arquivos que o ERP já
  exporta para `\\192.168.0.226\pdi` (o `.bat` de cópia da Fugini). **ZERO
  impacto na produção** e mais simples: dispensa Java, `openedge.jar` e senha do
  Progress. É o que este guia usa por padrão (seções com **[A]**).
- **Caminho B — leitura direta do Progress via JDBC (alternativa):** só se
  precisar de granularidade que o CSV não tem (ex.: natureza de operação para
  separar bonificação). Exige Java + `openedge.jar` + usuário read-only e as
  proteções da seção "Segurança da produção". Passos marcados **[B]**.

> Tempo estimado (Caminho A): ~15–20 min.

---

## 0. Pré-requisitos (instalar uma vez)

| Item | Caminho | Como obter / verificar |
|---|---|---|
| **Python 3.10+** | A e B | `python --version`. Se faltar: instalar de python.org (marcar "Add to PATH"). |
| **Acesso de rede** | A e B | Ao `dw_fugini` (`192.168.0.242:5432`) e à internet (Supabase). No Caminho A, também à pasta dos CSVs (`\\192.168.0.226\pdi` / `C:\pdi\in\full`). |
| **CSV atualizados** | **A** | Rodar o `.bat` da Fugini que copia os CSVs para `C:\pdi\in\full` **antes** da carga. |
| **Java (JRE 8+)** | B | `java -version`. Java do OpenEdge (`%DLC%\jdk`) ou do DBeaver. Se `java` não estiver no PATH, definir `JAVA_HOME`. |
| **openedge.jar** | B | O MESMO do DBeaver (*Driver Manager → Progress OpenEdge → Libraries*) ou `%DLC%\java\openedge.jar`. |
| **Git** (opcional) | A e B | Para clonar/atualizar o repositório (ou baixar o ZIP). |

---

## 1. Obter o código

Com git:
```cmd
cd C:\Fugini
git clone https://github.com/Fugini-FIC/fic-painel-vendas.git
cd fic-painel-vendas\etl
```
Sem git: baixar o ZIP em github.com/Fugini-FIC/fic-painel-vendas → *Code → Download ZIP*,
extrair, e abrir o prompt na pasta `fic-painel-vendas\etl`.

---

## 2. Instalar as dependências Python

```cmd
cd fic-painel-vendas\etl
python -m pip install -r requirements.txt
```
Instala `jaydebeapi`, `JPype1` (ponte Java↔Python), `psycopg2-binary`, `python-dotenv`.

Teste rápido do Java/JPype:
```cmd
python -c "import jaydebeapi, jpype; print('JDBC ok')"
```
Se der erro de JVM, definir o caminho do Java:
```cmd
set JAVA_HOME=C:\Progress\OpenEdge\jdk
```
(ajuste para a pasta real do Java; deve conter `bin\java.exe`).

---

## 3. Configurar as credenciais (.env)

```cmd
copy config\.env.example config\.env
notepad config\.env
```
Preencha (os valores entre `< >`):

```
# Progress (pegar host/porta na conexao do DBeaver: Edit Connection)
PROGRESS_JDBC_JAR=C:\Progress\OpenEdge\java\openedge.jar
PROGRESS_HOST=<host do ERP>
PROGRESS_PORT=<porta do SQL broker>
PROGRESS_USER=sysprogress
PROGRESS_PASSWORD=<senha recuperada do DBeaver>

# dw_fugini (Postgres interno)
DW_HOST=192.168.0.242
DW_PORT=5432
DW_DBNAME=dw_fugini
DW_USER=postgres
DW_PASSWORD=<senha do postgres interno>

# Supabase db_FIC_Painel (Project Settings -> API Keys -> service_role)
PAINEL_SUPABASE_URL=https://izflaeiehnwpoxsyhyiv.supabase.co
PAINEL_SUPABASE_SERVICE_ROLE_KEY=<service_role do db_FIC_Painel>

JANELA_DIAS=7
```
O `.env` **não vai para o git** (está no `.gitignore`). Guarde as senhas com cuidado.

---

## 4. Preparar o `dw_fugini` (criar os schemas — uma vez)

**[A] Caminho CSV:**
```cmd
python -m common.run_sql sql\010_estrutura_dw_fugini.sql
python -m common.run_sql sql\021_raw_csv.sql
```

**[B] Caminho JDBC (alternativa):**
```cmd
python -m common.run_sql sql\010_estrutura_dw_fugini.sql
python -m common.run_sql sql\020_raw.sql
```
Idempotente — pode repetir.

---

## 5. Preparar o Supabase (aplicar migrações — uma vez)

No navegador, no **SQL Editor** do projeto `db_FIC_Painel`
(supabase.com/dashboard/project/izflaeiehnwpoxsyhyiv/sql), rode em ordem o conteúdo de:
1. `db\001_estrutura.sql` (se ainda não aplicado — é idempotente)
2. `db\002_fase2a.sql` (coluna `credito_suspenso` + função atualizada)

Abra cada arquivo no bloco de notas, copie tudo, cole no editor e clique **Run**.

---

## 6. Primeira carga

**[A] Caminho CSV (recomendado):** primeiro rode o `.bat` da Fugini que copia
os CSVs para `C:\pdi\in\full`; depois:
```cmd
run_csv.bat
```
Ele carrega os CSVs (produto, cliente, nf, pedido) em `raw_csv` → monta
`mart.produtos/clientes/vendas` → publica no Supabase. Lê arquivos que o ERP já
exportou: **não toca na produção**. Pode rodar a qualquer hora.

**[B] Caminho JDBC (alternativa):** em **horário de baixa carga** (madrugada):
```cmd
run_full.bat
```
Extrai direto do Progress com as proteções da seção "Segurança da produção"
(dirty read, índice do cabeçalho, chunk por ano). Só usar se precisar de
natureza de operação (separar bonificação).

Se algum passo falhar, ele para e mostra "FALHA - ver stg.etl_log". Veja a seção 9.

---

## 7. Conferir os números

No `dw_fugini` (DBeaver ou psql), confira as contagens:
```sql
select 'vendas' t, count(*) n, max(data_emissao) ate from mart.vendas
union all select 'clientes', count(*), null from mart.clientes
union all select 'vendedores', count(*), null from mart.vendedores
union all select 'produtos', count(*), null from mart.produtos;

-- Distribuição das naturezas (deve ter venda/bonificacao/devolucao/ignorar)
select tipo, count(*) from stg.dim_natureza group by 1 order by 2 desc;

-- Log de cada etapa
select tarefa, status, registros, mensagem, finalizado_em
from stg.etl_log order by id desc limit 20;
```
Depois **abra o painel** (fic-painel-vendas.vercel.app), entre como gestor e
selecione o mês: faturamento, caixas, por vendedor (com nomes), carteira,
canal e o tile de crédito suspenso devem aparecer preenchidos.

**Reconciliação com o TOTVS** (o teste que dá confiança): compare o
faturamento de um dia no painel com o relatório oficial do ERP. Diferenças
apontam natureza mal classificada — me traga o caso que eu ajusto a regra.

---

## 8. Agendar a rotina (Task Scheduler)

Para o painel ficar atualizado sozinho:
1. Abrir **Agendador de Tarefas** do Windows → *Criar Tarefa Básica*
2. Nome: `Painel Vendas`
3. Disparador: **Diariamente** (ex.: 1x pela manhã, depois que os CSVs do dia
   já foram exportados/copiados). Pode repetir a cada algumas horas.
4. Ação: *Iniciar um programa* → Programa: `cmd.exe` →
   Argumentos **[A]**: `/c "C:\Fugini\fic-painel-vendas\etl\run_csv.bat"`
   (agende **depois** do `.bat` que copia os CSVs) ·
   Argumentos **[B]**: `/c "...\run_incremental.bat"`
5. Marcar "Executar estando o usuário conectado ou não"

O painel mostra o carimbo "dados sincronizados até" — se a tarefa falhar, o
carimbo denuncia o atraso.

---

## 9. Solução de problemas

| Sintoma | Causa provável / solução |
|---|---|
| `can't load driver class com.ddtek.jdbc.openedge.OpenEdgeDriver` | Caminho do `PROGRESS_JDBC_JAR` errado no `.env`, ou faltam `pool.jar`/`util.jar` na mesma pasta. |
| `JVMNotFoundException` / erro de JVM | Java não encontrado. Definir `JAVA_HOME` para a pasta do Java (com `bin\java.exe`). |
| `Column char-2 ... exceeding max length` | Alguma extração está usando `SELECT *`. Não deve acontecer (todas usam colunas explícitas); se acontecer, me avise. |
| Acentos errados (Ã, Ç) no painel | Encoding. O ETL já converte latin-1→UTF-8; se persistir, verificar o code page da conexão. |
| `relation "raw.xxx" does not exist` | Faltou rodar o passo 4 (`010`/`020`). |
| Painel com vendas zeradas | A carga (passo 6) não rodou, ou o `sync` falhou. Ver `stg.etl_log`. |
| Erro de conexão ao Progress | Host/porta errados no `.env`, ou o SQL broker do OpenEdge não está no ar. Testar a mesma conexão no DBeaver. |

Qualquer erro que travar, copie a mensagem do `stg.etl_log` (ou da tela) e me
mande — eu identifico e corrijo.

---

## 10. Segurança da produção (ems2fugini é ERP crítico)

Como a extração foi desenhada para **não onerar a base produtiva nem travar a
fábrica**:

1. **Leitura sem lock (DIRTY READ).** A conexão JDBC é aberta em
   `TRANSACTION_READ_UNCOMMITTED` + read-only (`common/db.py`). A extração
   **não adquire lock de registro nem espera lock de transação** do ERP — zero
   contenção com o faturamento. É a proteção nº 1.
2. **Entra por índice, sem full scan.** O filtro de data é no **cabeçalho**
   (`nota-fiscal`, que tem índice líder por `dt-emis-nota`), com join no item
   pela PK. Evita varrer as 1,8M linhas de `it-nota-fisc` a cada rodada.
3. **Histórico em chunks por ano.** A carga cheia lê ano a ano (commit por ano):
   transações curtas, retomável se cair, e sem cursor aberto por horas.
   Controlado por `PROGRESS_HIST_ANO_INI` no `.env`.
4. **`fetchmany`** (5.000 linhas por vez) em vez de puxar tudo de uma vez.
5. **Janela móvel curta** no dia a dia (7 dias) + reprocesso idempotente.

### Checklist para o DBA / time do ERP (antes de ligar a rotina)

- [ ] **Usuário SQL dedicado só de `SELECT`** nas tabelas usadas — NÃO usar o
      `sysprogress` (DBA) na rotina; criar um `etl_ro` read-only.
- [ ] Confirmar em runtime que a sessão do ETL está em **READ UNCOMMITTED**
      (via VST `_Connect` / log do servidor SQL).
- [ ] Rodar **EXPLAIN** da query do fato e confirmar que **não há TABLE SCAN**
      em `it-nota-fisc` (deve entrar por `nota-fiscal` + PK do item).
- [ ] **Carga histórica só em madrugada/fim de semana**; incremental fora do
      pico de faturamento.
- [ ] Durante a 1ª carga, monitorar as VSTs **`_Lock`** (deve ficar mínimo/vazio
      com dirty read), **`_Connect`**, **`_Trans`**, e I/O (**PROMON** / OE
      Management).
- [ ] Ter o **kill de sessão** pronto (identificar o usernum do ETL em `_Connect`
      e `proshut -C disconnect <usernum>`) caso precise abortar sem derrubar o banco.

### Alternativas de menor risco (se o DBA preferir)

- **Réplica / OpenEdge Replication** (se existir): extrair de um servidor
  secundário = zero impacto no primário. Ideal, se houver licença.
- **CSV via job ABL no ERP** (o que a Fugini já faz em `\\192.168.0.226\pdi`):
  o ERP exporta em horário controlado com `NO-LOCK` e o ETL só lê o arquivo —
  opção barata e de baixo risco para o incremental diário.
- **Pro2 (Progress→Postgres)**: replicação oficial para offload de relatório —
  alvo de médio prazo se o volume/frequência crescer.
