@echo off
REM Carga COMPLETA (historica) Progress -> dw_fugini. Rodar UMA vez no setup,
REM em horario de baixa carga do ERP (it-nota-fisc tem ~1.8M+ notas).
cd /d "%~dp0"

echo [%date% %time%] Dimensoes (naturezas, itens, familias)...
python -m extract.extract_progress --empresa fugini --base ems2fugini --entidade natur_oper || goto erro
python -m extract.extract_progress --empresa fugini --base ems2fugini --entidade fam_comerc || goto erro
python -m extract.extract_progress --empresa fugini --base ems2fugini --entidade item      || goto erro

echo [%date% %time%] Classificando naturezas e montando produtos...
python -m common.run_sql sql\030_dim_natureza.sql || goto erro
python -m common.run_sql sql\040_produtos.sql     || goto erro

echo [%date% %time%] Fato it-nota-fisc (HISTORICO COMPLETO)...
python -m extract.extract_progress --empresa fugini --base ems2fugini --entidade it_nota_fisc --full || goto erro

echo [%date% %time%] Montando mart.vendas (historico)...
python -m transform.build_mart --empresa fugini --full || goto erro

echo [%date% %time%] Publicando no Supabase...
python -m publish.sync_painel_supabase --full || goto erro

echo [%date% %time%] OK - carga completa concluida
exit /b 0
:erro
echo [%date% %time%] FALHA - ver stg.etl_log
exit /b 1
