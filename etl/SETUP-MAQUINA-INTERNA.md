# Guia de execução — máquina interna (primeira carga do Painel de Vendas)

Este guia é para a **máquina interna que enxerga o Progress e o `dw_fugini`**
(a mesma que já roda o ETL do TOTVS / `load_nf.py`, IP `192.168.0.242` na rede).
A Vercel/Supabase são alcançados por internet (push de saída). Siga na ordem.

> Tempo estimado: ~30–40 min (a maior parte é a carga histórica das notas).

---

## 0. Pré-requisitos (instalar uma vez)

| Item | Como obter / verificar |
|---|---|
| **Python 3.10+** | `python --version`. Se faltar: instalar de python.org (marcar "Add to PATH"). |
| **Java (JRE 8+)** | Necessário para o JDBC do Progress. `java -version`. Pode usar o Java que já vem com a instalação do OpenEdge (`%DLC%\jdk`) ou o do DBeaver. Se `java` não estiver no PATH, definir `JAVA_HOME`. |
| **openedge.jar** | O MESMO que o DBeaver usa. No DBeaver: *Database → Driver Manager → Progress OpenEdge → Edit → Libraries* mostra o caminho. Ou `%DLC%\java\openedge.jar`. Anote o caminho completo. |
| **Acesso de rede** | À base Progress (host/porta da conexão do DBeaver), ao `dw_fugini` (`192.168.0.242:5432`) e à internet (Supabase). |
| **Git** (opcional) | Para clonar/atualizar o repositório. Sem git, dá para baixar o ZIP do GitHub. |

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

Cria as camadas `raw`/`stg`/`mart`, tabelas, `painel_vendas` interno e as dimensões:
```cmd
python -m common.run_sql sql\010_estrutura_dw_fugini.sql
python -m common.run_sql sql\020_raw.sql
```
Se rodar sem erro, o `dw_fugini` está pronto. (Idempotente — pode repetir.)

---

## 5. Preparar o Supabase (aplicar migrações — uma vez)

No navegador, no **SQL Editor** do projeto `db_FIC_Painel`
(supabase.com/dashboard/project/izflaeiehnwpoxsyhyiv/sql), rode em ordem o conteúdo de:
1. `db\001_estrutura.sql` (se ainda não aplicado — é idempotente)
2. `db\002_fase2a.sql` (coluna `credito_suspenso` + função atualizada)

Abra cada arquivo no bloco de notas, copie tudo, cole no editor e clique **Run**.

---

## 6. Primeira carga (histórico completo)

Rode em **horário de baixa carga do ERP** (a `it-nota-fisc` tem 1,8M+ notas):
```cmd
run_full.bat
```
Ele faz, em ordem: dimensões (naturezas, itens, famílias, clientes, vendedores) →
classifica/monta as dimensões → extrai o histórico de faturamento → monta
`mart.vendas` → publica tudo no Supabase. Acompanhe o log na tela.

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
2. Nome: `Painel Vendas - Incremental`
3. Disparador: **Diariamente**, repetir a cada **1 ou 2 horas** em horário comercial
4. Ação: *Iniciar um programa* → Programa: `cmd.exe` →
   Argumentos: `/c "C:\Fugini\fic-painel-vendas\etl\run_incremental.bat"`
5. Marcar "Executar estando o usuário conectado ou não"

O `run_incremental.bat` reprocessa só a janela móvel (últimos `JANELA_DIAS`),
então é rápido. O painel mostra o carimbo "dados sincronizados até" — se a
tarefa falhar, o carimbo denuncia o atraso.

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
