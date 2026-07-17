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

echo [%date% %time%] Sincronizando check-ins do app de campo (Supabase crm_fugini)...
python sync_checkins_crm.py || goto erro

echo [%date% %time%] OK — dados no dw_fugini (painel le direto daqui)
exit /b 0

:erro
echo [%date% %time%] FALHA - ver stg.etl_log
exit /b 1
