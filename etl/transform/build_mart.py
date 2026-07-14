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
  r.empresa,
  r.cod_estabel,
  r.nr_nota_fis,
  nullif(r.nr_pedcli, ''),
  r.cd_emitente,
  coalesce(mv.cod_vendedor, r.cd_vendedor),          -- mapa rep→vendedor; senão o do item
  r.it_codigo,
  -- qt_caixas: qt_faturada quando a unidade de faturamento é caixa
  case when upper(coalesce(r.un_fatur,'')) in ('CX','CXA','CAIXA')
       then coalesce(r.qt_faturada,0) else coalesce(r.qt_faturada,0) end,
  abs(coalesce(r.vl_merc_liq,0)),                     -- sempre positivo
  coalesce(dn.tipo, 'venda'),                         -- natureza não mapeada = venda (com alerta)
  coalesce(p.familia, 'SEM FAMILIA'),
  r.dt_emis_nota,
  now()
from raw.it_nota_fisc r
left join stg.dim_natureza dn on dn.empresa = r.empresa and dn.nat_operacao = r.nat_operacao
left join stg.map_vendedor mv on mv.empresa = r.empresa and mv.cod_rep = coalesce(r.cd_vendedor,'')
left join mart.produtos    p  on p.empresa  = r.empresa and p.it_codigo  = r.it_codigo
where r.dt_cancela is null                            -- exclui notas canceladas
  and coalesce(dn.tipo, 'venda') <> 'ignorar'         -- exclui transferências/remessas
  and r.dt_emis_nota >= %(corte)s
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
