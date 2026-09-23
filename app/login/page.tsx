'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Mail } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [logoFailed, setLogoFailed] = useState(false)

  useEffect(() => {
    let active = true

    void Promise.resolve().then(async () => {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' })
        if (active && response.ok) router.replace('/')
      } finally {
        if (active) setCheckingSession(false)
      }
    })

    return () => {
      active = false
    }
  }, [router])

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Escribe correo y contrasena')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const result = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) {
        setErrorMessage(result?.error || 'No pude iniciar sesion. Intenta nuevamente.')
        return
      }

      router.replace('/')
      router.refresh()
    } catch {
      setErrorMessage('No pude iniciar sesion. Intenta nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
        <p className="text-zinc-500">Verificando sesion...</p>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 text-zinc-950">
      <section className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <div>
          {logoFailed ? (
            <h1 className="text-3xl font-black text-emerald-700">CastelNova</h1>
          ) : (
            <img
              src="/logo/logo-castelnova-os.png"
              alt="CastelNova OS"
              className="mx-auto h-24 w-64 object-contain"
              onError={() => setLogoFailed(true)}
            />
          )}
          <h2 className="mt-4 text-xl font-bold text-zinc-800">
            Bienvenido a ShopDesk OS
          </h2>
        </div>

        <form onSubmit={signIn} className="mt-7 space-y-4 text-left">
          <label className="block">
            <span className="text-sm font-semibold text-zinc-600">Correo</span>
            <div className="mt-2 flex items-center gap-3 rounded-xl border border-zinc-300 px-4 py-3 focus-within:border-emerald-500">
              <Mail className="text-emerald-500" size={20} />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full outline-none"
                placeholder="usuario@tienda.com"
                autoFocus
              />
            </div>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-zinc-600">Contrasena</span>
            <div className="mt-2 flex items-center gap-3 rounded-xl border border-zinc-300 px-4 py-3 focus-within:border-emerald-500">
              <Lock className="text-emerald-500" size={20} />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full outline-none"
                placeholder="********"
              />
            </div>
          </label>

          {errorMessage && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-500 py-4 font-black text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

      </section>
    </main>
  )
}
