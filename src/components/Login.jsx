import { useState } from 'react'
import { Home, Loader2, ShieldCheck } from 'lucide-react'
import { DEFAULT_APP_TITLE } from '../lib/appSettings'
import { supabase, supabaseUrlHost } from '../lib/supabase'

const COPY = {
  brand: DEFAULT_APP_TITLE,
  subtitle: 'Static React + Supabase Free',
  heading: 'Qu\u1ea3n l\u00fd \u0111i\u1ec7n n\u01b0\u1edbc v\u00e0 d\u00f2ng ti\u1ec1n nh\u00e0 tr\u1ecd',
  loginLabel: '\u0110\u0103ng nh\u1eadp qu\u1ea3n tr\u1ecb',
  signIn: '\u0110\u0103ng nh\u1eadp',
  signUp: 'T\u1ea1o t\u00e0i kho\u1ea3n',
  password: 'M\u1eadt kh\u1ea9u',
  created: 'T\u00e0i kho\u1ea3n \u0111\u00e3 \u0111\u01b0\u1ee3c t\u1ea1o. Vui l\u00f2ng ch\u1edd ch\u1ee7 s\u1edf h\u1eefu c\u1ea5p quy\u1ec1n.',
  forgotPassword: 'Qu\u00ean m\u1eadt kh\u1ea9u?',
  resetSent: 'Đã gửi email đặt lại mật khẩu. Hãy mở email mới nhất từ Supabase.',
}

function authRedirectUrl() {
  return new URL(import.meta.env.BASE_URL || '/', window.location.origin).toString()
}

function friendlyAuthError(error) {
  const message = String(error?.message || error || '')
  if (message === 'Failed to fetch' || /fetch/i.test(message)) {
    const hostText = supabaseUrlHost ? ` (${supabaseUrlHost})` : ''
    return `Không kết nối được Supabase Auth${hostText}. Kiểm tra GitHub Actions secret VITE_SUPABASE_URL phải đúng dạng https://xxxx.supabase.co, anon key đúng project, Supabase project đang hoạt động và không bị mạng/trình duyệt chặn.`
  }
  if (message === 'Invalid login credentials') {
    return 'Email hoặc mật khẩu chưa đúng. Nếu quên mật khẩu, bấm Quên mật khẩu để nhận email đặt lại.'
  }
  return message || 'Không thể đăng nhập. Vui lòng thử lại.'
}

export default function Login() {
  const [mode, setMode] = useState('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')

    try {
      const credentials = { email: email.trim(), password }
      const { error } =
        mode === 'sign-in'
          ? await supabase.auth.signInWithPassword(credentials)
          : await supabase.auth.signUp({ ...credentials, options: { emailRedirectTo: authRedirectUrl() } })

      if (error) {
        setMessage(friendlyAuthError(error))
      } else if (mode === 'sign-up') {
        await supabase.auth.signOut()
        setMode('sign-in')
        setPassword('')
        setMessage(COPY.created)
      }
    } catch (error) {
      setMessage(friendlyAuthError(error))
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePasswordReset() {
    if (!email.trim()) {
      setMessage('Nhập email trước khi gửi yêu cầu đặt lại mật khẩu.')
      return
    }

    setSubmitting(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: authRedirectUrl(),
      })
      setMessage(error ? friendlyAuthError(error) : COPY.resetSent)
    } catch (error) {
      setMessage(friendlyAuthError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-visual">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Home size={26} />
          </div>
          <div>
            <strong>{COPY.brand}</strong>
            <span>{COPY.subtitle}</span>
          </div>
        </div>
        <div className="auth-ledger">
          <div>
            <span>Auth</span>
            <strong>RLS</strong>
          </div>
          <div>
            <span>Role</span>
            <strong>owner</strong>
          </div>
          <div>
            <span>Deploy</span>
            <strong>Pages</strong>
          </div>
        </div>
      </section>

      <form className="auth-card" onSubmit={handleSubmit}>
        <div>
          <p className="eyeline">{COPY.loginLabel}</p>
          <h1>{COPY.heading}</h1>
        </div>

        <div className="segmented">
          <button
            type="button"
            className={mode === 'sign-in' ? 'active' : ''}
            onClick={() => setMode('sign-in')}
          >
            {COPY.signIn}
          </button>
          <button
            type="button"
            className={mode === 'sign-up' ? 'active' : ''}
            onClick={() => setMode('sign-up')}
          >
            {COPY.signUp}
          </button>
        </div>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            autoComplete="email"
            required
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="field">
          <span>{COPY.password}</span>
          <input
            type="password"
            value={password}
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            minLength={6}
            required
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {message ? <p className="form-message">{message}</p> : null}

        <button className="primary-button" type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="spin" size={17} /> : <ShieldCheck size={17} />}
          {mode === 'sign-in' ? COPY.signIn : COPY.signUp}
        </button>
        {mode === 'sign-in' ? (
          <button className="ghost-button full" type="button" disabled={submitting} onClick={handlePasswordReset}>
            {COPY.forgotPassword}
          </button>
        ) : null}
      </form>
    </main>
  )
}
