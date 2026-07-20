@echo off
REM Carga COMPLETA (historica) Progress -> dw_fugini (painel le direto daqui).
REM Rodar UMA vez no setup, em horario de baixa carga do ERP (it-nota-fisc
REM tem ~1.8M+ notas).
cd /d "%~dp0"

echo [%date% %time%] Dimensoes ems2fugini (naturezas, itens, familias)...
python -m extract.extract_progress --empresa fugini --base ems2fugini --entidade natur_oper || goto erro
python -m extract.extract_progress --empresa fugini --base ems2fugini --entidade fam_comerc || goto erro
python -m extract.extract_progress --empresa fugini --base ems2fugini --entidade item      || goto erro

echo [%date% %time%] Dimensoes ems2mult (clientes, vendedores)...
python -m extract.extract_progress --empresa fugini --base ems2mult --entidade emitente || goto erro
python -m extract.extract_progress --empresa fugini --base ems2mult --entidade repres   || goto erro

echo [%date% %time%] Classificando naturezas e montando dimensoes...
python -m common.run_sql sql\030_dim_natureza.sql || goto erro
python -m common.run_sql sql\040_produtos.sql     || goto erro
python -m common.run_sql sql\050_clientes.sql     || goto erro
python -m common.run_sql sql\060_vendedores.sql   || goto erro

echo [%date% %time%] Fato it-nota-fisc (HISTORICO COMPLETO)...
python -m extract.extract_progress --empresa fugini --base ems2fugini --entidade it_nota_fisc --full || goto erro

echo [%date% %time%] Montando mart.vendas (historico)...
python -m transform.build_mart --empresa fugini --full || goto erro

echo [%date% %time%] Sincronizando check-ins do app de campo (Supabase crm_fugini)...
python sync_checkins_crm.py || goto erro

echo [%date% %time%] OK - carga completa concluida (dw_fugini; painel le direto daqui)
exit /b 0
:erro
echo [%date% %time%] FALHA - ver stg.etl_log
exit /b 1
