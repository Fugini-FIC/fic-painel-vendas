# sync_checkins_crm.py — Supabase crm_fugini (app de check-in) -> dw_fugini (crm.*)
#
# Puxa vendedores, metas, checkins e agendamentos do app de campo (Supabase) e
# grava no dw_fugini, para o painel interno ter tudo num lugar só. Idempotente.
#
# .env necessário:
#   CRM_SUPABASE_URL              URL do projeto crm_fugini (app de check-in)
#   CRM_SUPABASE_SERVICE_ROLE_KEY service_role do crm_fugini
#   DW_*                          Postgres interno dw_fugini
#
# Uso: python sync_checkins_crm.py
import os
import sys
import json
import urllib.request
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common.db import conectar_dw
from common.log import log_inicio, log_fim

URL = os.environ["CRM_SUPABASE_URL"].rstrip("/")
KEY = os.environ["CRM_SUPABASE_SERVICE_ROLE_KEY"]


def _get(tabela: str, cols: str) -> list:
    """Lê uma tabela do Supabase via PostgREST (paginado)."""
    out, passo = [], 1000
    ini = 0
    while True:
        req = urllib.request.Request(
            f"{URL}/rest/v1/{tabela}?select={cols}",
            headers={"apikey": KEY, "Authorization": f"Bearer {KEY}",
                     "Range-Unit": "items", "Range": f"{ini}-{ini+passo-1}"},
        )
        try:
            data = json.loads(urllib.request.urlopen(req, timeout=60).read())
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"{tabela} HTTP {e.code}: {e.read().decode('utf-8','replace')[:300]}") from e
        out.extend(data)
        if len(data) < passo:
            break
        ini += passo
    return out


def _upsert(dw, tabela: str, cols: list, linhas: list) -> None:
    if not linhas:
        return
    ph = ",".join(["%s"] * len(cols))
    setexpr = ",".join(f"{c}=excluded.{c}" for c in cols if c != "id" and c not in ("cod_vendedor", "mes"))
    pk = "cod_vendedor,mes" if tabela == "crm.metas" else ("cod_vendedor" if tabela == "crm.vendedores" else "id")
    sql = (f"insert into {tabela} ({','.join(cols)}) values ({ph}) "
           f"on conflict ({pk}) do update set {setexpr}" if setexpr else
           f"insert into {tabela} ({','.join(cols)}) values ({ph}) on conflict ({pk}) do nothing")
    with dw.cursor() as c:
        c.executemany(sql, [tuple(l.get(k) for k in cols) for l in linhas])


def main() -> None:
    dw = conectar_dw()
    log_id = log_inicio(dw, "sync:crm_checkins")
    try:
        vend = _get("vendedores", "cod_vendedor,nome,role,email")
        _upsert(dw, "crm.vendedores", ["cod_vendedor", "nome", "role", "email"], vend)

        metas = _get("metas", "cod_vendedor,mes,meta_visitas,meta_positivados,meta_cadastros,fase,meta_faturamento,meta_caixas")
        _upsert(dw, "crm.metas", ["cod_vendedor", "mes", "meta_visitas", "meta_positivados",
                                  "meta_cadastros", "fase", "meta_faturamento", "meta_caixas"], metas)

        chk = _get("checkins", "id,cod_cliente,nome_cliente,cod_vendedor,lat_vendedor,lng_vendedor,status_visita,observacao,timestamp")
        _upsert(dw, "crm.checkins", ["id", "cod_cliente", "nome_cliente", "cod_vendedor", "lat_vendedor",
                                     "lng_vendedor", "status_visita", "observacao", "timestamp"], chk)

        ag = _get("agendamentos", "id,cod_cliente,nome_cliente,cod_vendedor,data_visita,status,checkin_id")
        _upsert(dw, "crm.agendamentos", ["id", "cod_cliente", "nome_cliente", "cod_vendedor",
                                         "data_visita", "status", "checkin_id"], ag)
        dw.commit()
        msg = f"{len(vend)} vendedores, {len(metas)} metas, {len(chk)} checkins, {len(ag)} agendamentos"
        log_fim(dw, log_id, "OK", len(chk), msg)
        print(f"[sync crm] {msg}")
    except Exception as e:
        dw.rollback()
        log_fim(dw, log_id, "ERRO", 0, str(e))
        raise
    finally:
        dw.close()


if __name__ == "__main__":
    main()
