# transform/build_mart.py — raw.it_nota_fisc → mart.vendas (dentro do dw_fugini)
#
# Classifica o tipo pela natureza de operação (stg.dim_natureza), exclui notas
# canceladas, normaliza valor sempre positivo (o tipo carrega o sinal) e
# resolve o vendedor pelo mapa (stg.map_vendedor). Idempotente (upsert).
#
# Uso: python -m transform.build_mart --empresa fugini
import os
import sys
import argparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.db import conectar_dw
from common.log import log_inicio, log_fim

SQL = """
insert into mart.vendas (
  empresa, estabel, nr_nota, nr_pedido, cod_cliente, cod_vendedor,
  it_codigo, qt_caixas, valor, tipo, familia, data_emissao, carregado_em
)
select
  g.empresa,
  g.cod_estabel,
  g.nr_nota_fis,
  nullif(g.nr_pedcli, ''),
  g.cd_emitente,
  coalesce(c.cod_vendedor, mv.cod_vendedor, g.cd_vendedor), -- vendedor do cliente (emitente.cod-rep); it-nota-fisc.cd-vendedor vem sempre vazio
  g.it_codigo,
  g.qt_caixas,
  abs(g.vl_merc_liq),                                 -- sempre positivo
  coalesce(dn.tipo, 'venda'),                         -- natureza não mapeada = venda (com alerta)
  coalesce(p.familia, 'SEM FAMILIA'),
  g.dt_emis_nota,
  now()
from (
  -- Mesmo item pode aparecer em vários nr-seq-fat na mesma nota (lotes /
  -- entregas parciais) — soma antes do upsert p/ não colidir na chave.
  select
    empresa, cod_estabel, nr_nota_fis, it_codigo, cd_emitente,
    max(nat_operacao) as nat_operacao,
    max(cd_vendedor)  as cd_vendedor,
    max(nr_pedcli)    as nr_pedcli,
    max(dt_emis_nota) as dt_emis_nota,
    sum(coalesce(qt_faturada,0)) as qt_caixas,
    sum(coalesce(vl_merc_liq,0)) as vl_merc_liq
  from raw.it_nota_fisc
  where dt_cancela is null                            -- exclui notas canceladas
    and dt_emis_nota >= %(corte)s
  group by empresa, cod_estabel, nr_nota_fis, it_codigo, cd_emitente
) g
left join stg.dim_natureza dn on dn.empresa = g.empresa and dn.nat_operacao = g.nat_operacao
left join mart.clientes    c  on c.empresa  = g.empresa and c.cod_cliente = g.cd_emitente
left join stg.map_vendedor mv on mv.empresa = g.empresa and mv.cod_rep = coalesce(g.cd_vendedor,'')
left join mart.produtos    p  on p.empresa  = g.empresa and p.it_codigo  = g.it_codigo
where coalesce(dn.tipo, 'venda') <> 'ignorar'         -- exclui transferências/remessas
on conflict (empresa, nr_nota, it_codigo, cod_cliente) do update set
  estabel      = excluded.estabel,
  nr_pedido    = excluded.nr_pedido,
  cod_vendedor = excluded.cod_vendedor,
  qt_caixas    = excluded.qt_caixas,
  valor        = excluded.valor,
  tipo         = excluded.tipo,
  familia      = excluded.familia,
  data_emissao = excluded.data_emissao,
  carregado_em = now();
"""

ALERTA_NATUREZA = """
select r.empresa, r.nat_operacao, count(*) as qtd
from raw.it_nota_fisc r
left join stg.dim_natureza dn on dn.empresa=r.empresa and dn.nat_operacao=r.nat_operacao
where dn.nat_operacao is null and r.dt_cancela is null and r.dt_emis_nota >= %(corte)s
group by 1,2 order by qtd desc limit 20;
"""


def build(empresa: str, corte: str) -> None:
    dw = conectar_dw()
    log_id = log_inicio(dw, f"build_mart:{empresa}")
    try:
        with dw.cursor() as c:
            # Remove a janela reprocessada (pega itens que sumiram/cancelaram)
            c.execute(
                "delete from mart.vendas where empresa=%s and data_emissao>=%s",
                (empresa, corte),
            )
            c.execute(SQL, {"corte": corte})
            gravadas = c.rowcount
            c.execute(ALERTA_NATUREZA, {"corte": corte})
            faltando = c.fetchall()
        dw.commit()
        msg = f"{gravadas} vendas"
        if faltando:
            print("  AVISO: naturezas SEM classificação (caíram como 'venda'):")
            for emp, nat, qtd in faltando:
                print(f"    {emp}/{nat}: {qtd} itens")
            msg += f"; {len(faltando)} naturezas sem mapa"
        log_fim(dw, log_id, "OK", gravadas, msg)
        print(f"[{empresa}] {msg}")
    except Exception as e:
        dw.rollback()
        log_fim(dw, log_id, "ERRO", 0, str(e))
        raise
    finally:
        dw.close()


if __name__ == "__main__":
    from datetime import datetime, timedelta, timezone
    ap = argparse.ArgumentParser()
    ap.add_argument("--empresa", required=True)
    ap.add_argument("--full", action="store_true")
    args = ap.parse_args()
    if args.full:
        corte = "2000-01-01"
    else:
        dias = int(os.environ.get("JANELA_DIAS", "7"))
        corte = (datetime.now(timezone.utc) - timedelta(days=dias)).strftime("%Y-%m-%d")
    build(args.empresa, corte)
