import { AlertTriangle, Loader2, LogOut, ShieldCheck } from 'lucide-react'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'viewer'])
const DENIED_MESSAGE = 'Tài khoản không có quyền truy cập'
const CHECKING_MESSAGE = 'Đang kiểm tra quyền truy cập...'
const CHECK_ERROR_TITLE = 'Không thể kiểm tra quyền'
const DENIED_DETAIL = 'Tài khoản cần có role owner, admin hoặc viewer trong bảng profiles.'
const SIGN_OUT_LABEL = 'Đăng xuất'

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

  if (!ALLOWED_ROLES.has(profile?.role)) {
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