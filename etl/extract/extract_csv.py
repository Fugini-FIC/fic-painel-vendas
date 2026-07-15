# extract/extract_csv.py — carrega um CSV do TOTVS/portal para raw_csv.*
#
# Sem tocar no ERP: lê o arquivo que o job do ERP já exportou (via .bat) para a
# pasta CSV_DIR. Trunca a tabela raw e recarrega (o CSV é o snapshot completo).
#
# Performance: os arquivos são grandes (NF ~437MB). Usa COPY do Postgres em
# blocos (muito mais rápido que INSERT linha a linha) e filtra o histórico por
# CSV_DESDE para não inchar o DW.
#
# Parsing: latin-1, ';', decimal vírgula (com ponto de milhar), datas DD/MM/AA.
#
# Uso: python -m extract.extract_csv --entidade nf
import os
import io
import sys
import csv as csvmod
import argparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.db import conectar_dw
from common.log import log_inicio, log_fim
from extract.csv_entities import CSV_ENTIDADES, CSV_DIR

BLOCO = 50_000                                    # linhas por COPY
DESDE = os.environ.get("CSV_DESDE", "2024-01-01")  # corta histórico antigo
csvmod.field_size_limit(10_000_000)


def _num(s):
    s = (s or "").strip()
    if not s:
        return None
    s = s.replace(".", "") if "," in s else s      # "5.336,44" -> "5336,44"
    s = s.replace(",", ".")
    try:
        float(s)
        return s
    except ValueError:
        return None


def _int(s):
    v = _num(s)
    if v is None:
        return None
    try:
        return str(int(float(v)))
    except ValueError:
        return None


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


def _txt(s):
    s = (s or "").strip()
    return s or None


_CONV = {"text": _txt, "num": _num, "int": _int, "date": _dt}


def _esc(v):
    """Escapa para o formato text do COPY."""
    if v is None:
        return r"\N"
    return (v.replace("\\", "\\\\").replace("\t", "\\t")
             .replace("\n", "\\n").replace("\r", ""))


def carregar(entidade: str) -> None:
    cfg = CSV_ENTIDADES[entidade]
    caminho = os.path.join(CSV_DIR, cfg["arquivo"])
    filtro = cfg.get("filtro_data")          # coluna raw de data p/ cortar histórico
    dw = conectar_dw()
    log_id = log_inicio(dw, f"csv:{entidade}")
    total, pulados = 0, 0
    try:
        if not os.path.exists(caminho):
            raise FileNotFoundError(f"CSV não encontrado: {caminho} (rodou o .bat de cópia?)")

        raw_cols = [c[1] for c in cfg["colunas"]]
        conv = [(c[0], c[1], c[2]) for c in cfg["colunas"]]
        copy_sql = (f"COPY {cfg['raw_table']} ({','.join(raw_cols)}) "
                    f"FROM STDIN WITH (FORMAT text)")

        with dw.cursor() as dcur:
            dcur.execute(f"truncate table {cfg['raw_table']}")
            buf = io.StringIO()
            n_buf = 0
            with open(caminho, encoding="latin-1", newline="") as fh:
                for linha in csvmod.DictReader(fh, delimiter=";"):
                    vals = {}
                    for csv_col, raw_col, tp in conv:
                        vals[raw_col] = _CONV[tp](linha.get(csv_col))
                    if filtro and vals.get(filtro) and vals[filtro] < DESDE:
                        pulados += 1
                        continue
                    buf.write("\t".join(_esc(vals[c]) for c in raw_cols) + "\n")
                    n_buf += 1
                    if n_buf >= BLOCO:
                        buf.seek(0)
                        dcur.copy_expert(copy_sql, buf)
                        total += n_buf
                        print(f"  {entidade}: {total:,} linhas...")
                        buf = io.StringIO()
                        n_buf = 0
            if n_buf:
                buf.seek(0)
                dcur.copy_expert(copy_sql, buf)
                total += n_buf
        dw.commit()
        msg = f"{total} linhas de {cfg['arquivo']}" + (f" ({pulados} anteriores a {DESDE} ignoradas)" if pulados else "")
        log_fim(dw, log_id, "OK", total, msg)
        print(f"[csv/{entidade}] {msg}")
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
