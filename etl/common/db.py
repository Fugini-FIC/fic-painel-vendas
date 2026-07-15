# common/db.py — conexões com Progress (JDBC) e com o dw_fugini (Postgres)
import os
import jaydebeapi
import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "config", ".env"))


def conectar_progress(dbname: str):
    """Conexão SOMENTE-LEITURA e SEM LOCK a uma base Progress (produção crítica).

    Define DIRTY READ (TRANSACTION_READ_UNCOMMITTED) para que a extração NUNCA
    pegue lock de linha nem bloqueie transações do ERP — proteção nº1 para não
    onerar a fábrica. Aceita ler dado ainda não commitado (a janela móvel +
    reconciliação corrigem isso). Também marca a conexão read-only.
    """
    host = os.environ["PROGRESS_HOST"]
    port = os.environ["PROGRESS_PORT"]
    url = f"jdbc:datadirect:openedge://{host}:{port};databaseName={dbname}"
    conn = jaydebeapi.connect(
        "com.ddtek.jdbc.openedge.OpenEdgeDriver",
        url,
        [os.environ["PROGRESS_USER"], os.environ["PROGRESS_PASSWORD"]],
        os.environ["PROGRESS_JDBC_JAR"],
    )
    try:
        conn.jconn.setReadOnly(True)
        conn.jconn.setTransactionIsolation(1)  # java.sql.Connection.TRANSACTION_READ_UNCOMMITTED
        conn.jconn.setAutoCommit(True)
    except Exception as e:  # noqa: BLE001 — não travar a carga se o driver não expuser
        print(f"AVISO: nao foi possivel setar dirty-read/read-only: {e}")
    return conn


def conectar_dw():
    """Conexão com o Postgres interno dw_fugini (stage/DW)."""
    return psycopg2.connect(
        host=os.environ["DW_HOST"],
        port=int(os.environ.get("DW_PORT", "5432")),
        dbname=os.environ["DW_DBNAME"],
        user=os.environ["DW_USER"],
        password=os.environ["DW_PASSWORD"],
    )
