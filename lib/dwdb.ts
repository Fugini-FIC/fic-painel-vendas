// lib/dwdb.ts — pool de conexão ao Postgres interno dw_fugini (base do painel).
// O painel roda internamente e lê os dados de venda/carteira/visitas daqui.
import { Pool } from 'pg'

let pool: Pool | null = null

export function dw(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.DW_HOST,
      port: Number(process.env.DW_PORT || 5432),
      database: process.env.DW_DBNAME || 'dw_fugini',
      user: process.env.DW_USER,
      password: process.env.DW_PASSWORD,
      max: 5,
      idleTimeoutMillis: 30000,
    })
  }
  return pool
}
