# teste_conexao_progress.py — PARTE 1 do Caminho B: valida conexão SEGURA.
#
# Faz o MÍNIMO possível na produção: confirma o isolamento dirty-read e roda
# duas consultas leves (contagem de uma tabela pequena + 1 linha da nota mais
# recente, que entra por índice). NÃO varre it-nota-fisc.
#
# Uso (na pasta etl, com o .env preenchido):
#   python teste_conexao_progress.py
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common.db import conectar_progress

BASE = os.environ.get("PROGRESS_BASE_TESTE", "ems2fugini")


def main() -> None:
    print(f"Conectando em {BASE} (read-only, dirty read)...")
    t0 = time.time()
    conn = conectar_progress(BASE)
    print(f"  conectado em {time.time()-t0:.1f}s")

    iso = conn.jconn.getTransactionIsolation()
    ro = conn.jconn.isReadOnly()
    ok_iso = iso == 1
    print(f"  Isolamento JDBC = {iso}  ({'OK — READ UNCOMMITTED (dirty read)' if ok_iso else 'ATENCAO: NAO e dirty read!'})")
    print(f"  Read-only = {ro}")
    if not ok_iso:
        print("  >> PARE: sem dirty read a extracao pode pegar lock do ERP. Nao prosseguir.")
        conn.close()
        sys.exit(1)

    cur = conn.cursor()

    # (a) tabela pequena — contagem barata
    t0 = time.time()
    cur.execute('SELECT COUNT(*) FROM PUB."natur-oper"')
    print(f'  natur-oper: {cur.fetchone()[0]} linhas ({time.time()-t0:.2f}s)')

    # (b) 1 linha via indice de data (nfftrm-20 / ch-sit-nota) — nao varre a tabela
    t0 = time.time()
    cur.execute('SELECT TOP 1 "nr-nota-fis","dt-emis-nota" FROM PUB."nota-fiscal" '
                'ORDER BY "dt-emis-nota" DESC')
    row = cur.fetchone()
    print(f'  nota mais recente: {row} ({time.time()-t0:.2f}s)')

    conn.close()
    print("OK — conexao segura validada. Pode seguir para a Parte 2 (dimensao pequena).")


if __name__ == "__main__":
    main()
