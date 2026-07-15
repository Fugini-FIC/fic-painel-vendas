# extract/extract_csv.py — carrega um CSV do TOTVS/portal para raw_csv.*
#
# Sem tocar no ERP: lê o arquivo que o job do ERP já exportou (via .bat) para
# a pasta CSV_DIR. Trunca a tabela raw e recarrega o snapshot inteiro (o CSV é
# a fonte completa; idempotente). Parsing: latin-1, ';', decimal vírgula (e
# ponto de milhar quando houver), datas DD/MM/AA(AA).
#
# Uso: python -m extract.extract_csv --entidade nf
#      python -m extract.extract_csv --entidade cliente
import os
import sys
import csv as csvmod
import argparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.db import conectar_dw
from common.log import log_inicio, log_fim
from extract.csv_entities import CSV_ENTIDADES, CSV_DIR

LOTE = 5000


def _num(s):
    s = (s or "").strip()
    if not s:
        return None
    # "5.336,44" -> tira milhar '.' quando há ',' decimal; "788,15" -> "788.15"
    s = s.replace(".", "") if "," in s else s
    s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _int(s):
    v = _num(s)
    return int(v) if v is not None else None


def _dt(s):
    s = (s or "").strip()
    if not s or s in ("//", "0"):
        return None
    p = s.split("/")
    if len(p) != 3:
        return None
    d, m, y = p
    if len(y) == 2:
        y = "20" + y
    try:
        return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
    except ValueError:
        return None


_CONV = {"text": lambda s: (s or "").strip() or None, "num": _num, "int": _int, "date": _dt}


def carregar(entidade: str) -> None:
    cfg = CSV_ENTIDADES[entidade]
    caminho = os.path.join(CSV_DIR, cfg["arquivo"])
    dw = conectar_dw()
    log_id = log_inicio(dw, f"csv:{entidade}")
    total = 0
    try:
        if not os.path.exists(caminho):
            raise FileNotFoundError(f"CSV não encontrado: {caminho} (rodou o .bat de cópia?)")

        raw_cols = [c[1] for c in cfg["colunas"]]
        conv = [(c[0], c[2]) for c in cfg["colunas"]]
        insert = (f"insert into {cfg['raw_table']} ({','.join(raw_cols)}) "
                  f"values ({','.join(['%s'] * len(raw_cols))})")

        with dw.cursor() as dcur:
            dcur.execute(f"truncate table {cfg['raw_table']}")

            with open(caminho, encoding="latin-1", newline="") as fh:
                leitor = csvmod.DictReader(fh, delimiter=";")
                lote = []
                for linha in leitor:
                    reg = tuple(_CONV[tp](linha.get(csv_col)) for csv_col, tp in conv)
                    lote.append(reg)
                    if len(lote) >= LOTE:
                        dcur.executemany(insert, lote)
                        total += len(lote)
                        lote = []
                if lote:
                    dcur.executemany(insert, lote)
                    total += len(lote)
        dw.commit()
        log_fim(dw, log_id, "OK", total, f"{total} linhas de {cfg['arquivo']}")
        print(f"[csv/{entidade}] {total} linhas de {cfg['arquivo']}")
    except Exception as e:
        dw.rollback()
        log_fim(dw, log_id, "ERRO", total, str(e))
        raise
    finally:
        dw.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--entidade", required=True, choices=list(CSV_ENTIDADES))
    args = ap.parse_args()
    carregar(args.entidade)
