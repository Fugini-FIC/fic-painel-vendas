# publish/sync_painel_supabase.py — dw_fugini (mart.*) -> Supabase db_FIC_Painel
#
# Publica os marts prontos no Supabase (PostgREST upsert). É a única saída da
# rede interna: push HTTPS, nenhuma porta aberta para dentro. O painel lê do
# Supabase via painel_vendas(). Idempotente.
#
# Nota MVP: só empresa 'fugini'. As tabelas do Supabase não têm coluna
# 'empresa' ainda — ao ligar a Cristal, adicionar 'empresa' lá e na chave.
#
# Uso: python -m publish.sync_painel_supabase [--full]
import os
import sys
import json
import argparse
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.db import conectar_dw
from common.log import log_inicio, log_fim

URL = os.environ["PAINEL_SUPABASE_URL"].rstrip("/")
KEY = os.environ["PAINEL_SUPABASE_SERVICE_ROLE_KEY"]
BATCH = 1000


def _push(tabela: str, on_conflict: str, linhas: list) -> None:
    url = f"{URL}/rest/v1/{tabela}?on_conflict={on_conflict}"
    for i in range(0, len(linhas), BATCH):
        lote = linhas[i:i + BATCH]
        req = urllib.request.Request(
            url, data=json.dumps(lote, default=str).encode(), method="POST",
            headers={
                "apikey": KEY, "Authorization": f"Bearer {KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
        )
        try:
            urllib.request.urlopen(req, timeout=120).read()
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"{tabela} HTTP {e.code}: {e.read().decode('utf-8','replace')[:400]}") from e


def sincronizar(full: bool) -> None:
    dw = conectar_dw()
    log_id = log_inicio(dw, "publish:supabase")
    total = 0
    try:
        corte = "2000-01-01" if full else (
            datetime.now(timezone.utc) - timedelta(days=int(os.environ.get("JANELA_DIAS", "7")))
        ).strftime("%Y-%m-%d")

        with dw.cursor() as c:
            # produtos (só fugini; sem coluna empresa no Supabase por enquanto)
            c.execute("select it_codigo, descricao, familia from mart.produtos where empresa='fugini'")
            prod = [{"it_codigo": r[0], "descricao": r[1], "familia": r[2]} for r in c.fetchall()]
            _push("produtos", "it_codigo", prod)

            # vendas (janela por data_emissao)
            c.execute(
                "select nr_nota, nr_pedido, cod_cliente, cod_vendedor, it_codigo, "
                "qt_caixas, valor, tipo, data_emissao "
                "from mart.vendas where empresa='fugini' and data_emissao >= %s", (corte,))
            vendas = [{
                "nr_nota": r[0], "nr_pedido": r[1], "cod_cliente": r[2], "cod_vendedor": r[3],
                "it_codigo": r[4], "qt_caixas": float(r[5] or 0), "valor": float(r[6] or 0),
                "tipo": r[7], "data_emissao": str(r[8]),
            } for r in c.fetchall()]
            _push("vendas", "nr_nota,it_codigo,cod_cliente", vendas)
            total = len(vendas)

        log_fim(dw, log_id, "OK", total, f"{len(prod)} produtos, {total} vendas (corte {corte})")
        print(f"[publish] {len(prod)} produtos, {total} vendas publicadas (corte {corte})")
    except Exception as e:
        log_fim(dw, log_id, "ERRO", total, str(e))
        raise
    finally:
        dw.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true")
    args = ap.parse_args()
    sincronizar(args.full)
