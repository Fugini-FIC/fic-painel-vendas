@echo off
REM ============================================================
REM Pipeline via CSV (ZERO impacto no ERP) — TOTVS/portal -> dw_fugini -> Supabase
REM Rodar DEPOIS do .bat que copia os CSVs de \\192.168.0.226\pdi para CSV_DIR.
REM Agendar no Task Scheduler apos a copia dos CSVs.
REM ============================================================
cd /d "%~dp0"

echo [%date% %time%] Carregando CSVs para raw_csv...
python -m extract.extract_csv --entidade produto || goto erro
python -m extract.extract_csv --entidade cliente || goto erro
python -m extract.extract_csv --entidade nf      || goto erro
python -m extract.extract_csv --entidade pedido  || goto erro

echo [%date% %time%] Montando mart (produtos, clientes, vendas, pedidos)...
python -m common.run_sql sql\070_mart_csv.sql     || goto erro
python -m common.run_sql sql\075_mart_pedidos.sql || goto erro

echo [%date% %time%] Publicando no Supabase...
python -m publish.sync_painel_supabase --full || goto erro

echo [%date% %time%] OK
exit /b 0

:erro
echo [%date% %time%] FALHA - ver stg.etl_log
exit /b 1
