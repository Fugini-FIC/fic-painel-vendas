# extract/extract_progress.py — extrai uma entidade de uma base Progress p/ raw.*
#
# PROTEÇÃO DA PRODUÇÃO (ems2fugini é ERP crítico):
#  - conexão em DIRTY READ (common/db.py) → nunca pega lock do ERP;
#  - fato (it_nota_fisc) filtra por data no CABEÇALHO indexado (nota-fiscal) via
#    join → sem full scan;
#  - carga cheia quebrada em CHUNKS por ano (transação curta, retomável), a
#    partir de PROGRESS_HIST_ANO_INI (default: ano atual - 2);
#  - fetchmany em vez de fetchall → cursor não fica aberto puxando tudo.
#  Rodar a carga cheia em janela de baixa carga (madrugada/fim de semana).
#
# Uso:
#   python -m extract.extract_progress --empresa fugini --base ems2fugini --entidade it_nota_fisc
#   python -m extract.extract_progress --empresa fugini --base ems2mult   --entidade repres
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
FETCH = 5000


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
    if coluna in cfg.get("bool", set()):
        if isinstance(valor, bool):
            return valor
        return str(valor).strip().lower() in ("1", "true", "yes", "sim", "y", "t")
    if coluna in cfg.get("extent_decimal", set()):
        # EXTENT(2) do Progress vem como "valor;valor" (string) — 1º elemento.
        texto = valor.split(";")[0] if isinstance(valor, str) else valor
        try:
            return float(texto)
        except (ValueError, TypeError):
            return None
    return valor


def _sql(nome: str) -> str:
    return open(os.path.join(SQL_DIR, nome), encoding="utf-8").read()


def _copiar(prog, dw, cfg, empresa: str, sql: str) -> int:
    """Executa o SELECT no Progress e insere na raw em lotes (fetchmany)."""
    colunas = cfg["colunas"]
    cols_sql = ",".join(["empresa"] + colunas)
    ph = ",".join(["%s"] * (len(colunas) + 1))
    insert = f"insert into {cfg['raw_table']} ({cols_sql}) values ({ph}) on conflict do nothing"

    cur = prog.cursor()
    try:
        cur.arraysize = FETCH
    except Exception:
        pass
    cur.execute(sql)
    desc = [c[0].lower() for c in cur.description]
    total = 0
    with dw.cursor() as dcur:
        while True:
            rows = cur.fetchmany(FETCH)
            if not rows:
                break
            lote = []
            for row in rows:
                d = dict(zip(desc, row))
                lote.append(tuple([empresa] + [_conv(d.get(c), c, cfg) for c in colunas]))
            dcur.executemany(insert, lote)
            total += len(lote)
    return total


def extrair(empresa: str, base: str, entidade: str, full: bool) -> None:
    cfg = ENTIDADES[entidade]
    dw = conectar_dw()
    log_id = log_inicio(dw, f"extract:{base}:{entidade}")
    total = 0
    try:
        prog = conectar_progress(base)
        try:
            if not cfg["incremental"]:
                # Dimensão: carga full simples (tabela pequena, sem data)
                with dw.cursor() as dcur:
                    dcur.execute(f"delete from {cfg['raw_table']} where empresa=%s", (empresa,))
                total = _copiar(prog, dw, cfg, empresa, _sql(cfg["sql"]))
                dw.commit()
            elif full:
                # Fato — carga cheia por ano (chunks curtos, retomável)
                ano_ini = int(os.environ.get("PROGRESS_HIST_ANO_INI", str(datetime.now().year - 2)))
                ano_fim = datetime.now().year
                with dw.cursor() as dcur:
                    dcur.execute(
                        f"delete from {cfg['raw_table']} where empresa=%s and dt_emis_nota >= %s",
                        (empresa, f"{ano_ini}-01-01"))
                dw.commit()
                tmpl = _sql(cfg["sql"])
                for ano in range(ano_ini, ano_fim + 1):
                    sql = (tmpl.replace(":INI", "{d '%d-01-01'}" % ano)
                               .replace(":FIM", "{d '%d-12-31'}" % ano))
                    n = _copiar(prog, dw, cfg, empresa, sql)
                    dw.commit()                       # commit por ano
                    total += n
                    print(f"  {base}/{entidade} {ano}: {n} linhas")
            else:
                # Fato — incremental (janela móvel de JANELA_DIAS)
                dias = int(os.environ.get("JANELA_DIAS", "7"))
                corte = (datetime.now(timezone.utc) - timedelta(days=dias)).strftime("%Y-%m-%d")
                with dw.cursor() as dcur:
                    dcur.execute(
                        f"delete from {cfg['raw_table']} where empresa=%s and dt_emis_nota >= %s",
                        (empresa, corte))
                tmpl = _sql(cfg["sql"])
                sql = (tmpl.replace(":INI", "{d '%s'}" % corte)
                           .replace(":FIM", "{d '2999-12-31'}"))
                total = _copiar(prog, dw, cfg, empresa, sql)
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
