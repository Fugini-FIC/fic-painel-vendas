-- ============================================================
-- 050_clientes.sql — monta mart.clientes a partir de raw.emitente.
-- Roda no dw_fugini após extrair raw.emitente. Reexecutável (upsert).
-- Canal, limite e crédito suspenso (ind-cre-cli=4) vêm da emitente.
-- ============================================================

insert into mart.clientes (
  empresa, cod_cliente, nome, cnpj, canal, cidade, uf,
  cod_vendedor, limite_credito, credito_suspenso, dt_ult_venda
)
select
  e.empresa,
  e.cod_emitente,
  e.nome_emit,
  nullif(trim(e.cgc), ''),
  nullif(trim(e.cod_canal_venda), '0'),         -- código do canal (0 = sem canal)
  e.cidade,
  e.estado,
  nullif(trim(e.cod_rep), '0'),
  coalesce(e.lim_credito, 0),
  (e.ind_cre_cli = 4),                           -- crédito suspenso
  e.dt_ult_venda
from raw.emitente e
where e.identific <> 2                           -- garante só clientes
on conflict (empresa, cod_cliente) do update set
  nome             = excluded.nome,
  cnpj             = excluded.cnpj,
  canal            = excluded.canal,
  cidade           = excluded.cidade,
  uf               = excluded.uf,
  cod_vendedor     = excluded.cod_vendedor,
  limite_credito   = excluded.limite_credito,
  credito_suspenso = excluded.credito_suspenso,
  dt_ult_venda     = excluded.dt_ult_venda;
