# common/log.py — registro de execução em stg.etl_log + checkpoint incremental
from datetime import datetime, timezone


def log_inicio(dw, tarefa: str) -> int:
    with dw.cursor() as c:
        c.execute(
            "insert into stg.etl_log (tarefa, iniciado_em, status) "
            "values (%s, now(), 'RODANDO') returning id",
            (tarefa,),
        )
        log_id = c.fetchone()[0]
    dw.commit()
    return log_id


def log_fim(dw, log_id: int, status: str, registros: int = 0, mensagem: str = "") -> None:
    with dw.cursor() as c:
        c.execute(
            "update stg.etl_log set finalizado_em = now(), status = %s, "
            "registros = %s, mensagem = %s where id = %s",
            (status, registros, mensagem[:2000], log_id),
        )
    dw.commit()


def get_checkpoint(dw, entidade: str):
    with dw.cursor() as c:
        c.execute("select ult_valor from stg.etl_checkpoint where entidade = %s", (entidade,))
        row = c.fetchone()
    return row[0] if row else None


def set_checkpoint(dw, entidade: str, valor) -> None:
    with dw.cursor() as c:
        c.execute(
            "insert into stg.etl_checkpoint (entidade, ult_valor, atualizado_em) "
            "values (%s, %s, now()) "
            "on conflict (entidade) do update set ult_valor = excluded.ult_valor, "
            "atualizado_em = now()",
            (entidade, valor),
        )
    dw.commit()
