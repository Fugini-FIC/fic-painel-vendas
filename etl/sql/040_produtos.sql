-- ============================================================
-- 040_produtos.sql — monta mart.produtos (descrição + FAMÍLIA comercial).
-- Roda no dw_fugini após extrair raw.item e raw.fam_comerc. Reexecutável.
-- Família = descrição da família comercial (fm-cod-com); fallback SEM FAMILIA.
-- ============================================================

insert into mart.produtos (empresa, it_codigo, descricao, familia)
select
  i.empresa,
  i.it_codigo,
  i.desc_item,
  coalesce(nullif(trim(fc.descricao), ''), 'SEM FAMILIA')
from raw.item i
left join raw.fam_comerc fc
  on fc.empresa = i.empresa and trim(fc.fm_cod_com) = trim(i.fm_cod_com)
on conflict (empresa, it_codigo) do update set
  descricao = excluded.descricao,
  familia   = excluded.familia;
