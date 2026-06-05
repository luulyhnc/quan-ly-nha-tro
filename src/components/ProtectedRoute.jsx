import { AlertTriangle, Loader2, LogOut, ShieldCheck } from 'lucide-react'

const DENIED_MESSAGE = 'T\u00e0i kho\u1ea3n kh\u00f4ng c\u00f3 quy\u1ec1n qu\u1ea3n tr\u1ecb'
const CHECKING_MESSAGE = '\u0110ang ki\u1ec3m tra quy\u1ec1n qu\u1ea3n tr\u1ecb...'
const CHECK_ERROR_TITLE = 'Kh\u00f4ng th\u1ec3 ki\u1ec3m tra quy\u1ec1n'
const DENIED_DETAIL = 'Li\u00ean h\u1ec7 ng\u01b0\u1eddi qu\u1ea3n tr\u1ecb Supabase \u0111\u1ec3 c\u1ea5p role admin cho email n\u00e0y.'
const SIGN_OUT_LABEL = '\u0110\u0103ng xu\u1ea5t'

export default function ProtectedRoute({ loading, profile, error, onSignOut, children }) {
  if (loading) {
    return (
      <main className="splash">
        <Loader2 className="spin" size={28} />
        <p>{CHECKING_MESSAGE}</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="splash">
        <AlertTriangle size={34} />
        <h2>{CHECK_ERROR_TITLE}</h2>
        <p>{error}</p>
        <button className="primary-button" type="button" onClick={onSignOut}>
          <LogOut size={17} />
          {SIGN_OUT_LABEL}
        </button>
      </main>
    )
  }

  if (profile?.role !== 'admin') {
    return (
      <main className="splash">
        <ShieldCheck size={34} />
        <h2>{DENIED_MESSAGE}</h2>
        <p>{DENIED_DETAIL}</p>
        <button className="primary-button" type="button" onClick={onSignOut}>
          <LogOut size={17} />
          {SIGN_OUT_LABEL}
        </button>
      </main>
    )
  }

  return children
}
