// Redireciona para o dashboard (o auth-check do /dash manda para /login se preciso)
import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function Home() {
  const router = useRouter()
  useEffect(() => { router.replace('/dash') }, [router])
  return null
}
