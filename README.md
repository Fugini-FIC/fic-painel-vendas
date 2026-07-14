# Painel de Vendas — Fugini

Dashboard para Gestores e Diretoria: faturamento (mês/dia/campanha/vendedor/família),
caixas, positivação, carteira ativos/inativos, canais, metas, visitas e cadastro de
clientes. Next.js 16 (pages router).

**Stack independente:** este app usa APENAS o banco Supabase `db_FIC_Painel`
(`izflaeiehnwpoxsyhyiv`) — login, vendedores, metas, vendas e carteira.
Nenhuma dependência do CRM antigo ou do Vercel antigo.

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

Todas do MESMO projeto Supabase (`db_FIC_Painel`), em *Project Settings → API Keys*:

```
NEXT_PUBLIC_SUPABASE_URL=https://izflaeiehnwpoxsyhyiv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_URL=https://izflaeiehnwpoxsyhyiv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

## Setup (uma vez)

1. **Banco:** rodar `db/001_estrutura.sql` no SQL Editor do db_FIC_Painel (idempotente).
2. **Usuário:** no dashboard do Supabase → *Authentication → Users → Add user*
   (email + senha). Depois vincular no SQL Editor:
   ```sql
   insert into vendedores (cod_vendedor, nome, role, email)
   values ('GESTOR', 'Seu Nome', 'master', 'seu.email@exemplo.com')
   on conflict (cod_vendedor) do update set email = excluded.email, role = 'master';
   ```
   (`master` vê todos os vendedores; `vendedor` vê só os próprios números)
3. **Vercel:** importar este repositório, colar as 4 variáveis, Deploy.
4. **Dados:** rodar `etl/sync_painel_supabase.py` na máquina interna
   (variáveis `PAINEL_SUPABASE_URL`, `PAINEL_SUPABASE_SERVICE_ROLE_KEY`,
   `PG_HOST`, `PG_PASSWORD`, primeira vez com `--full`). Agendar diário
   após o ETL do TOTVS. O painel exibe "dados sincronizados até" para
   denunciar atraso de carga.

## Definições de negócio (implementadas em `painel_vendas()`)

| Termo | Régua |
|---|---|
| Cliente ativo | comprou (NF de venda) nos últimos 90 dias |
| Positivado | ≥1 NF de venda com valor > 0 no período (bonificação/devolução não positivam) |
| Faturamento | líquido = vendas − devoluções; bonificação conta só em caixas |
| Positivação % | positivados ÷ carteira ativa |
| Ticket médio / Preço médio caixa / Drop size | faturamento÷pedidos · faturamento÷caixas · caixas÷pedidos |
| Esfriando | ativos há 31–90 dias sem comprar, maiores primeiro |
