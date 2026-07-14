# ============================================================
# sync_painel_supabase.py
# Ponte DW -> Supabase para o Painel do Gestor do CRM.
#
# Sincroniza:
#   erp_progress.faturamento_nf  -> supabase.vendas
#   erp_progress.itens           -> supabase.produtos
#   totvs_cliente.csv            -> supabase.clientes
#
# Rodar na maquina interna (mesma que roda load_nf.py), apos o ETL:
#   python sync_painel_supabase.py                 -> incremental (ultimos 40 dias)
#   python sync_painel_supabase.py --full          -> carga completa
#   python sync_painel_supabase.py --desde 2026-01-01
#
# Credenciais via variaveis de ambiente (NAO hardcodar):
#   PAINEL_SUPABASE_URL               URL do projeto db_FIC_Painel
#                                     (https://izflaeiehnwpoxsyhyiv.supabase.co)
#   PAINEL_SUPABASE_SERVICE_ROLE_KEY  chave service_role do db_FIC_Painel
#   PG_PASSWORD                       senha do postgres interno
#
# ATENCAO: o destino e o banco ANALITICO db_FIC_Painel, nao o banco
# do CRM. O banco do CRM (pyiybinbsnouxdtnfcpe) segue apenas com
# login, agenda, checkins e metas.
# ============================================================

import os
import sys
import json
import time
import urllib.request
import psycopg2
import psycopg2.extras
import pandas as pd

# ============================================================
# CONFIGURACAO
# ============================================================

PG_CONFIG = dict(
    host=os.environ["PG_HOST"],
    port=int(os.environ.get("PG_PORT", "5432")),
    dbname="erp_progress",
    user=os.environ.get("PG_USER", "postgres"),
    password=os.environ["PG_PASSWORD"],
)

SUPABASE_URL = os.environ["PAINEL_SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["PAINEL_SUPABASE_SERVICE_ROLE_KEY"]

CSV_CLIENTES = os.environ.get("TOTVS_CLIENTES_CSV", r"Z:\in\full\totvs_cliente.csv")

# Mapa cod_rep (TOTVS) -> cod_vendedor (CRM). Manter alinhado com a
# tabela vendedores do Supabase.
MAPA_REP_VENDEDOR = {
    "6003": "SC01",
}

# Familia por prefixo da descricao do item. Ajustar conforme o
# portfolio real (ou substituir por coluna de familia do TOTVS
# quando disponivel).
FAMILIAS = [
    ("MOLHO", "MOLHOS"),
    ("KETCHUP", "KETCHUP"),
    ("MAIONESE", "MAIONESE"),
    ("MOSTARDA", "MOSTARDA"),
    ("EXTRATO", "ATOMATADOS"),
    ("POLPA", "ATOMATADOS"),
    ("TEMPERO", "TEMPEROS"),
    ("CONSERVA", "CONSERVAS"),
    ("MILHO", "CONSERVAS"),
    ("ERVILHA", "CONSERVAS"),
]

BATCH = 500


# ============================================================
# Supabase REST (PostgREST) — upsert em lote
# ============================================================

def supabase_upsert(tabela: str, linhas: list[dict], on_conflict: str) -> None:
    if not linhas:
        return
    url = f"{SUPABASE_URL}/rest/v1/{tabela}?on_conflict={on_conflict}"
    for i in range(0, len(linhas), BATCH):
        lote = linhas[i:i + BATCH]
        req = urllib.request.Request(
            url,
            data=json.dumps(lote, default=str).encode("utf-8"),
            method="POST",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                resp.read()
        except urllib.error.HTTPError as e:
            corpo = e.read().decode("utf-8", errors="replace")[:500]
            raise RuntimeError(f"Supabase {tabela} HTTP {e.code}: {corpo}") from e
        print(f"  {tabela}: {min(i + BATCH, len(linhas))}/{len(linhas)}")
        time.sleep(0.2)


# ============================================================
# 1) itens -> produtos (com familia inferida)
# ============================================================

def familia_do_item(descricao: str) -> str:
    d = (descricao or "").upper()
    for prefixo, familia in FAMILIAS:
        if prefixo in d:
            return familia
    return "OUTROS"


def sync_produtos(conn) -> None:
    print("[1/3] produtos...")
    df = pd.read_sql("select it_codigo, descricao_1 from itens", conn)
    linhas = [
        {
            "it_codigo": str(r.it_codigo).strip(),
            "descricao": (r.descricao_1 or "").strip(),
            "familia": familia_do_item(r.descricao_1),
        }
        for r in df.itertuples()
        if str(r.it_codigo).strip()
    ]
    supabase_upsert("produtos", linhas, "it_codigo")


# ============================================================
# 2) faturamento_nf -> vendas
# ============================================================

def sync_vendas(conn, desde: str) -> None:
    print(f"[2/3] vendas (data_emissao >= {desde})...")
    df = pd.read_sql(
        """
        select cod_cliente, cod_item, nr_nota_fiscal, nr_ped,
               valor_item_nf, qt_cxs_nf, data_emissao, cod_rep
        from faturamento_nf
        where data_emissao >= %s
        """,
        conn,
        params=(desde,),
    )
    linhas = []
    sem_mapa = set()
    for r in df.itertuples():
        cod_rep = str(r.cod_rep or "").strip()
        cod_vendedor = MAPA_REP_VENDEDOR.get(cod_rep)
        if cod_rep and not cod_vendedor:
            sem_mapa.add(cod_rep)
        valor = float(r.valor_item_nf or 0)
        linhas.append({
            "nr_nota": str(r.nr_nota_fiscal).strip(),
            "nr_pedido": str(r.nr_ped).strip() if r.nr_ped else None,
            "cod_cliente": str(r.cod_cliente).strip(),
            "cod_vendedor": cod_vendedor,
            "it_codigo": str(r.cod_item).strip() if r.cod_item else None,
            "qt_caixas": float(r.qt_cxs_nf or 0),
            "valor": abs(valor),
            # Regra simples: valor negativo = devolucao. Refinar com o
            # tipo de operacao do TOTVS quando o campo estiver no DW.
            "tipo": "devolucao" if valor < 0 else "venda",
            "data_emissao": str(r.data_emissao),
        })
    supabase_upsert("vendas", linhas, "nr_nota,it_codigo,cod_cliente")
    if sem_mapa:
        print(f"  AVISO: cod_rep sem mapeamento para vendedor: {sorted(sem_mapa)}")
        print("  -> adicionar em MAPA_REP_VENDEDOR para aparecerem no painel por vendedor.")


# ============================================================
# 3) totvs_cliente.csv -> clientes
# ============================================================

def sync_clientes() -> None:
    print(f"[3/3] clientes ({CSV_CLIENTES})...")
    df = pd.read_csv(CSV_CLIENTES, encoding="latin1", sep=";", dtype=str, low_memory=False)
    df.columns = [c.strip() for c in df.columns]
    linhas = []
    # iterrows (nao itertuples): as colunas do TOTVS tem hifen no nome
    for _, row in df.iterrows():
        cod = str(row.get("cod-cliente", "") or "").strip()
        nome = str(row.get("nome-cliente", "") or "").strip()
        if not cod or not nome:
            continue
        cod_erc = str(row.get("cod-erc", "") or "").strip()
        limite = str(row.get("limite-disp", "0") or "0").replace(".", "").replace(",", ".")
        try:
            limite_num = float(limite)
        except ValueError:
            limite_num = 0.0
        linhas.append({
            "cod_cliente": cod,
            "nome": nome,
            "endereco": str(row.get("endereco", "") or "").strip() or None,
            "cod_vendedor": MAPA_REP_VENDEDOR.get(cod_erc),
            "limite_credito": limite_num,
            "origem": "totvs",
        })
    supabase_upsert("clientes", linhas, "cod_cliente")


# ============================================================

def main() -> None:
    desde = None
    if "--full" in sys.argv:
        desde = "2000-01-01"
    elif "--desde" in sys.argv:
        desde = sys.argv[sys.argv.index("--desde") + 1]
    else:
        desde = (pd.Timestamp.now() - pd.Timedelta(days=40)).strftime("%Y-%m-%d")

    inicio = time.time()
    conn = psycopg2.connect(**PG_CONFIG)
    try:
        sync_produtos(conn)
        sync_vendas(conn, desde)
    finally:
        conn.close()
    sync_clientes()
    print(f"Concluido em {time.time() - inicio:.0f}s")


if __name__ == "__main__":
    main()
