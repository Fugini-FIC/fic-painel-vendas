# Painel de Vendas — Fugini (app standalone)

Dashboard para Gestores e Diretoria: faturamento (mês/dia/campanha/vendedor/família),
caixas, positivação, carteira ativos/inativos, canais, metas, visitas e cadastro de
clientes. Next.js 16 (pages router), deploy independente do CRM antigo.

## Bancos de dados

| Variável de ambiente | Projeto Supabase | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | CRM (`pyiybinbsnouxdtnfcpe`) | Login dos usuários (Supabase Auth) |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | CRM (`pyiybinbsnouxdtnfcpe`) | Validação de sessão, vendedores, visitas, metas |
| `PAINEL_SUPABASE_URL` + `PAINEL_SUPABASE_SERVICE_ROLE_KEY` | db_FIC_Painel (`izflaeiehnwpoxsyhyiv`) | Vendas, carteira, produtos, campanhas (analítico) |

## Deploy no Vercel (projeto novo)

1. `vercel.com` → Add New → Project → importar `Fugini-FIC/FIC-CRM-Vendas`
2. **Root Directory:** `painel-vendas` (obrigatório — o repo é um monorepo)
3. Framework: Next.js (detectado automático)
4. Adicionar as 6 variáveis de ambiente da tabela acima
5. Deploy. Cada push em `painel-vendas/` redeploya automaticamente.

## Dados

O banco analítico é alimentado pelo ETL `../fugini-etl/sync_painel_supabase.py`
(rodar na máquina interna, agendado após o `load_nf.py` diário). Estrutura do
banco: `db/migrations/PAINEL/001_estrutura.sql` no repositório fugini-crm —
já aplicada em 14/jul/2026.

Definições de negócio (cliente ativo = 90 dias, faturamento líquido etc.):
ver `docs/PAINEL-GESTOR.md` no repositório fugini-crm.
