# common/run_sql.py — executa um arquivo .sql no dw_fugini (para os passos de transformação)
# Uso: python -m common.run_sql sql/030_dim_natureza.sql
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.db import conectar_dw

if __name__ == "__main__":
    caminho = sys.argv[1]
    sql = open(caminho, encoding="utf-8").read()
    dw = conectar_dw()
    try:
        with dw.cursor() as c:
            c.execute(sql)
        dw.commit()
        print(f"OK: {caminho}")
    finally:
        dw.close()
