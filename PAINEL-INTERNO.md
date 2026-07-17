# Painel de Vendas — hospedagem interna (lendo o dw_fugini)

Arquitetura definitiva: o painel roda **numa máquina da rede interna** e lê os
dados direto do **`dw_fugini`** (Postgres). Login usa o Supabase **`crm_fugini`**
(mesma base de usuários do app de check-in). Não há mais Supabase de analytics.

```
Origens Progress ─ETL─► dw_fugini (mart.* + crm.*) ◄─pg─ Painel (Next.js interno)
                                                              │ login (JWT)
                                          Supabase crm_fugini ┘  (app de check-in;
                                          check-ins sincronizados p/ dw_fugini)
```

## 1. Preparar o dw_fugini (uma vez)

Além dos scripts do ETL (`etl/sql/010`, `021`), rode a camada de serviço:
```
python -m common.run_sql dw\005_crm.sql              # schema crm.* (visitas sincronizadas)
python -m common.run_sql dw\010_painel_functions.sql # funções mart.painel_vendas / painel_pedidos
```
(ou rode os `.sql` no DBeaver conectado ao dw_fugini)

## 2. Vincular o gestor (login)

O login valida no Supabase `crm_fugini`. Garanta um usuário **master**:
1. No `crm_fugini`, em *Authentication → Users*, crie/tenha o e-mail do gestor.
2. Na tabela `vendedores` do `crm_fugini`, esse e-mail deve ter `role = 'master'`.
3. O ETL (`sync_checkins_crm.py`) copia isso para `dw_fugini.crm.vendedores`, de
   onde o painel resolve o `cod_vendedor`/`role`.

## 3. Configurar o painel (.env.local)

Na raiz do `fic-painel-vendas`, crie `.env.local`:
```
# Login (Supabase crm_fugini — app de check-in)
NEXT_PUBLIC_SUPABASE_URL=https://pyiybinbsnouxdtnfcpe.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key do crm_fugini>
SUPABASE_URL=https://pyiybinbsnouxdtnfcpe.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role do crm_fugini>

# Dados (Postgres interno dw_fugini)
DW_HOST=192.168.0.242
DW_PORT=5432
DW_DBNAME=dw_fugini
DW_USER=postgres
DW_PASSWORD=<senha do dw_fugini>
```

## 4. Rodar o painel na máquina interna

Precisa de Node.js 20+ na máquina (que enxergue o dw_fugini):
```
npm install
npm run build
npm run start      # sobe em http://<ip-da-maquina>:3000
```
Para deixar sempre no ar, use um gerenciador de processo (ex.: `pm2`,
`nssm`/serviço do Windows, ou IIS com iisnode). Abra a porta 3000 (ou faça
proxy 80→3000) para a rede interna.

## 5. Fluxo diário

1. O `.bat` da Fugini copia os CSVs para `C:\pdi\in\full`.
2. `etl\run_csv.bat` carrega o dw_fugini e sincroniza os check-ins.
3. O painel (já no ar) lê o dw_fugini — nada a reiniciar; é só atualizar a página.

Os dados **não saem da rede** (só o login usa o Supabase). Acompanhamento do ETL:
`etl/sql/monitor.sql` (tabela `stg.etl_log`).
