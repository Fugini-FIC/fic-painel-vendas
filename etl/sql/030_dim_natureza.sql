-- ============================================================
-- 030_dim_natureza.sql — classifica as naturezas de operação por REGRA.
-- Roda no dw_fugini APÓS extrair raw.natur_oper. Reexecutável: reclassifica
-- tudo (pega naturezas novas automaticamente). Rodar antes do build_mart.
--
-- Regras (ordem importa):
--   bonificacao ← BONIFICAÇÃO / DOAÇÃO / BRINDE / AMOSTRA (mesmo com CFOP de venda)
--   devolucao   ← começa com "DEV" e contém "VENDA" (devolução DE venda; abate)
--   venda       ← saída (tipo=2) com "VENDA" na denominação
--   ignorar     ← resto (compras, transferências, remessas, retornos, frete...)
-- ============================================================

truncate table stg.dim_natureza;

insert into stg.dim_natureza (empresa, nat_operacao, cfop, tipo)
select
  empresa,
  trim(nat_operacao),
  trim(coalesce(cfop, '')),
  case
    when upper(coalesce(denominacao,'')) like '%BONIFICA%'
      or upper(coalesce(denominacao,'')) like '%AMOSTRA%'
      or upper(coalesce(denominacao,'')) like '%BRINDE%'
      or upper(coalesce(denominacao,'')) like '%DOA%'          -- DOACAO / DOAÇÃO
      then 'bonificacao'
    when upper(coalesce(denominacao,'')) like 'DEV%'
      and upper(coalesce(denominacao,'')) like '%VENDA%'
      then 'devolucao'
    when tipo = 2 and upper(coalesce(denominacao,'')) like '%VENDA%'
      then 'venda'
    else 'ignorar'
  end
from raw.natur_oper;

-- Conferência rápida da distribuição (rode manualmente após):
-- select tipo, count(*) from stg.dim_natureza group by 1 order by 2 desc;
