@echo off
REM Carga incremental (janela movel) Progress -> dw_fugini -> Supabase
REM Agendar no Task Scheduler a cada 1-2h em horario comercial.
cd /d "%~dp0"

echo [%date% %time%] Dimensoes (naturezas, familias, itens, clientes, vendedores)...
python -m extract.extract_progress --empresa fugini --base ems2fugini --entidade natur_oper
if errorlevel 1 goto erro
python -m extract.extract_progress --empresa fugini --base ems2fugini --entidade fam_comerc
if errorlevel 1 goto erro
python -m extract.extract_progress --empresa fugini --base ems2fugini --entidade item
if errorlevel 1 goto erro
python -m extract.extract_progress --empresa fugini --base ems2mult --entidade emitente
if errorlevel 1 goto erro
python -m extract.extract_progress --empresa fugini --base ems2mult --entidade repres
if errorlevel 1 goto erro

echo [%date% %time%] Classificando naturezas e montando dimensoes...
python -m common.run_sql sql\030_dim_natureza.sql
if errorlevel 1 goto erro
python -m common.run_sql sql\040_produtos.sql
if errorlevel 1 goto erro
python -m common.run_sql sql\050_clientes.sql
if errorlevel 1 goto erro
python -m common.run_sql sql\060_vendedores.sql
if errorlevel 1 goto erro

echo [%date% %time%] Extraindo it-nota-fisc (fugini)...
python -m extract.extract_progress --empresa fugini --base ems2fugini --entidade it_nota_fisc
if errorlevel 1 goto erro

echo [%date% %time%] Montando mart.vendas...
python -m transform.build_mart --empresa fugini
if errorlevel 1 goto erro

echo [%date% %time%] Publicando no Supabase...
python -m publish.sync_painel_supabase
if errorlevel 1 goto erro

echo [%date% %time%] OK
exit /b 0

:erro
echo [%date% %time%] FALHA - ver stg.etl_log
exit /b 1
