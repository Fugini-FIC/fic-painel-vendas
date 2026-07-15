-- ============================================================
-- 060_vendedores.sql — monta mart.vendedores a partir de raw.repres.
-- Roda no dw_fugini após extrair raw.repres. Reexecutável (upsert).
-- ativo = não desligado (dt-deslig nulo). rep_indireto = hierarquia.
-- ============================================================

insert into mart.vendedores (empresa, cod_vendedor, nome, ativo, rep_indireto, regiao)
select
  empresa,
  cod_rep,
  nome,
  (dt_deslig is null),
  nullif(trim(rep_indireto), '0'),
  nullif(trim(nome_ab_reg), '')
from raw.repres
on conflict (empresa, cod_vendedor) do update set
  nome         = excluded.nome,
  ativo        = excluded.ativo,
  rep_indireto = excluded.rep_indireto,
  regiao       = excluded.regiao;
