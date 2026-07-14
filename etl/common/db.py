# common/db.py — conexões com Progress (JDBC) e com o dw_fugini (Postgres)
import os
import jaydebeapi
import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "config", ".env"))


def conectar_progress(dbname: str):
    """Conexão read-only a uma base Progress via JDBC (mesmo openedge.jar do DBeaver)."""
    host = os.environ["PROGRESS_HOST"]
    port = os.environ["PROGRESS_PORT"]
    url = f"jdbc:datadirect:openedge://{host}:{port};databaseName={dbname}"
    return jaydebeapi.connect(
        "com.ddtek.jdbc.openedge.OpenEdgeDriver",
        url,
        [os.environ["PROGRESS_USER"], os.environ["PROGRESS_PASSWORD"]],
        os.environ["PROGRESS_JDBC_JAR"],
    )


def conectar_dw():
    """Conexão com o Postgres interno dw_fugini (stage/DW)."""
    return psycopg2.connect(
        host=os.environ["DW_HOST"],
        port=int(os.environ.get("DW_PORT", "5432")),
        dbname=os.environ["DW_DBNAME"],
        user=os.environ["DW_USER"],
        password=os.environ["DW_PASSWORD"],
    )
