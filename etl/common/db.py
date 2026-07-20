# common/db.py — conexões com o dw_fugini (Postgres) e, opcionalmente, Progress (JDBC)
import os
import psycopg2
from dotenv import load_dotenv

# jaydebeapi só é necessário no Caminho B (leitura direta do Progress).
# No Caminho A (CSV) não precisa de Java/JDBC — import opcional.
try:
    import jaydebeapi
except ImportError:  # pragma: no cover
    jaydebeapi = None

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "config", ".env"))


def conectar_progress(dbname: str):
    """Conexão SOMENTE-LEITURA e SEM LOCK a uma base Progress (produção crítica).

    Define DIRTY READ (TRANSACTION_READ_UNCOMMITTED) para que a extração NUNCA
    pegue lock de linha nem bloqueie transações do ERP — proteção nº1 para não
    onerar a fábrica. Aceita ler dado ainda não commitado (a janela móvel +
    reconciliação corrigem isso). Também marca a conexão read-only.
    """
    if jaydebeapi is None:
        raise RuntimeError(
            "jaydebeapi não instalado. O Caminho A (CSV) não precisa dele. "
            "Para o Caminho B (JDBC): pip install jaydebeapi JPype1 (requer Java)."
        )
    host = os.environ["PROGRESS_HOST"]
    # Cada base Progress tem seu próprio broker/porta e credenciais (não é
    # multiplexado por databaseName num único broker) — ex.: ems2fugini:24649,
    # ems2mult:24613, cada uma com usuário/senha próprios.
    sufixo = dbname.upper()
    port = os.environ.get(f"PROGRESS_PORT_{sufixo}") or os.environ["PROGRESS_PORT"]
    user = os.environ.get(f"PROGRESS_USER_{sufixo}") or os.environ["PROGRESS_USER"]
    senha = os.environ.get(f"PROGRESS_PASSWORD_{sufixo}") or os.environ["PROGRESS_PASSWORD"]
    url = f"jdbc:datadirect:openedge://{host}:{port};databaseName={dbname}"
    conn = jaydebeapi.connect(
        "com.ddtek.jdbc.openedge.OpenEdgeDriver",
        url,
        [user, senha],
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
