# extract/extract_progress.py — extrai uma entidade de uma base Progress p/ raw.*
#
# Entidades registradas em entities.py. Fato (it_nota_fisc) = incremental por
# janela móvel (dt_emis_nota); dimensões (natur_oper) = full. Idempotente.
#
# Uso:
#   python -m extract.extract_progress --empresa fugini --base ems2fugini --entidade it_nota_fisc
#   python -m extract.extract_progress --empresa fugini --base ems2fugini --entidade natur_oper
#   ... --entidade it_nota_fisc --full
import os
import sys
import argparse
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.db import conectar_progress, conectar_dw
from common.log import log_inicio, log_fim
from extract.entities import ENTIDADES

SQL_DIR = os.path.join(os.path.dirname(__file__), "..", "sql", "extract")


def _conv(valor, coluna, cfg):
    if valor is None:
        return None
    if coluna in cfg["texto"]:
        return (valor.decode("latin-1") if isinstance(valor, bytes) else str(valor)).strip()
    if coluna in cfg.get("int", set()):
        try:
            return int(valor)
        except (ValueError, TypeError):
            return None
    return valor


def extrair(empresa: str, base: str, entidade: str, full: bool) -> None:
    cfg = ENTIDADES[entidade]
    dw = conectar_dw()
    log_id = log_inicio(dw, f"extract:{base}:{entidade}")
    total = 0
    try:
        sql = open(os.path.join(SQL_DIR, cfg["sql"]), encoding="utf-8").read()
        if cfg["incremental"]:
            if full:
                corte = "2000-01-01"
            else:
                dias = int(os.environ.get("JANELA_DIAS", "7"))
                corte = (datetime.now(timezone.utc) - timedelta(days=dias)).strftime("%Y-%m-%d")
            sql = sql.replace(":CORTE", "{d '" + corte + "'}")

        prog = conectar_progress(base)
        try:
            cur = prog.cursor()
            cur.execute(sql)
            desc_cols = [c[0].lower() for c in cur.description]
            colunas = cfg["colunas"]
            with dw.cursor() as dcur:
                # Limpa antes de reinserir (janela p/ incremental; tudo p/ full)
                if cfg["incremental"]:
                    dcur.execute(
                        f"delete from {cfg['raw_table']} where empresa=%s and dt_emis_nota>=%s",
                        (empresa, corte),
                    )
                else:
                    dcur.execute(f"delete from {cfg['raw_table']} where empresa=%s", (empresa,))

                cols_sql = ",".join(["empresa"] + colunas)
                ph = ",".join(["%s"] * (len(colunas) + 1))
                insert = f"insert into {cfg['raw_table']} ({cols_sql}) values ({ph}) on conflict do nothing"

                lote = []
                for row in cur.fetchall():
                    d = dict(zip(desc_cols, row))
                    linha = [empresa] + [_conv(d.get(c), c, cfg) for c in colunas]
                    lote.append(tuple(linha))
                    if len(lote) >= 5000:
                        dcur.executemany(insert, lote); total += len(lote); lote = []
                if lote:
                    dcur.executemany(insert, lote); total += len(lote)
            dw.commit()
        finally:
            prog.close()

        log_fim(dw, log_id, "OK", total, f"{total} linhas {entidade}@{base}")
        print(f"[{base}/{entidade}] {total} linhas")
    except Exception as e:
        dw.rollback()
        log_fim(dw, log_id, "ERRO", total, str(e))
        raise
    finally:
        dw.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--empresa", required=True)
    ap.add_argument("--base", required=True)
    ap.add_argument("--entidade", required=True, choices=list(ENTIDADES))
    ap.add_argument("--full", action="store_true")
    args = ap.parse_args()
    extrair(args.empresa, args.base, args.entidade, args.full)
