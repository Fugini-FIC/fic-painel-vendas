// pages/login.tsx — login do Painel de Vendas (Supabase Auth do CRM)
import { useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'

export default function Login() {
  const router = useRouter()
  const [email, setEmail]     = useState('')
  const [senha, setSenha]     = useState('')
  const [erro, setErro]       = useState('')
  const [loading, setLoading] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    })
    if (error) {
      setErro('Usuário ou senha inválidos')
      setLoading(false)
      return
    }
    await router.push('/dash')
  }

  return (
    <>
      <Head><title>Login — Painel de Vendas Fugini</title></Head>
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', background: '#f5f5f5',
        fontFamily: "'Segoe UI', sans-serif",
      }}>
        <div style={{
          background: 'white', borderRadius: 12, padding: '40px 32px',
          width: '100%', maxWidth: 380,
          boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
        }}>
          <div style={{
            background: '#D2001B', color: 'white', textAlign: 'center',
            padding: '12px', borderRadius: 8, fontSize: 18, fontWeight: 700,
            marginBottom: 28, letterSpacing: 1,
          }}>
            FUGINI · PAINEL DE VENDAS
          </div>

          <form onSubmit={entrar}>
            <label style={{ fontSize: 13, color: '#555', display: 'block', marginBottom: 4 }}>
              Usuário
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu.usuario@fugini.internal"
              required
              style={inputStyle}
            />

            <label style={{ fontSize: 13, color: '#555', display: 'block', marginBottom: 4 }}>
              Senha
            </label>
            <input
              type="password"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              placeholder="••••••••"
              required
              style={{ ...inputStyle, marginBottom: 20 }}
            />

            {erro && (
              <div style={{
                background: '#fdecea', color: '#c0392b', borderRadius: 8,
                padding: '10px 12px', fontSize: 13, marginBottom: 14, textAlign: 'center',
              }}>
                {erro}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: 14,
                background: loading ? '#aaa' : '#D2001B',
                color: 'white', border: 'none', borderRadius: 8,
                fontSize: 16, fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
        <div style={{ fontSize: 11, color: '#bbb', marginTop: 16 }}>
          Fugini Alimentos · uso interno
        </div>
      </div>
    </>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid #ddd',
  borderRadius: 8, fontSize: 14, marginBottom: 14,
  fontFamily: "'Segoe UI', sans-serif", boxSizing: 'border-box',
}
