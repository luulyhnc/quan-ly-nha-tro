import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  Home,
  Loader2,
  LogOut,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  Users,
  WalletCards,
  Zap,
} from 'lucide-react'
import Login from './components/Login'
import ProtectedRoute from './components/ProtectedRoute'
import { DEFAULT_APP_TITLE } from './lib/appSettings'
import { hasSupabaseConfig, isSupabaseConfigured, supabase, supabaseConfigError } from './lib/supabase'
import { sampleData } from './lib/sampleData'
import {
  calculateDashboard,
  createEmptyReading,
  formatCurrency,
  formatNumber,
  getCurrentMonth,
  localId,
  monthToDate,
  toNumber,
} from './lib/calculations'
import {
  deleteHouseRecord,
  deleteMarketSurveyRecord,
  fetchProfiles,
  deleteRoomRecord,
  fetchAppTitle,
  fetchCurrentProfile,
  fetchDashboardData,
  saveAppTitle,
  saveHouseRecord,
  saveInvoiceRecord,
  saveMarketSurveyRecord,
  saveProfileRole,
  saveReadingRecord,
  saveRoomRecord,
} from './lib/supabaseData'

const demoUser = { email: 'demo@nha-tro.local' }
const ALL_HOUSES_ID = 'all'
const SIDEBAR_STORAGE_KEY = 'nha_tro_sidebar_collapsed'
const ROLE_LABELS = { owner: 'Chủ sở hữu', admin: 'Quản lý', viewer: 'Chỉ xem' }
const ROLE_OPTIONS = [
  { value: 'owner', label: 'Chủ sở hữu' },
  { value: 'admin', label: 'Quản lý' },
  { value: 'viewer', label: 'Chỉ xem' },
]
const READ_ONLY_MESSAGE = 'Tài khoản này chỉ có quyền xem'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')

  const loadProfile = useCallback(async (nextSession) => {
    if (!nextSession?.user?.id) {
      setProfile(null)
      setProfileError('')
      return
    }

    setProfileLoading(true)
    setProfileError('')
    try {
      const nextProfile = await fetchCurrentProfile(nextSession.user.id)
      setProfile(nextProfile)
    } catch (error) {
      setProfile(null)
      setProfileError(error.message)
    } finally {
      setProfileLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined
    let mounted = true

    async function applySession(nextSession) {
      if (!mounted) return
      setSession(nextSession)
      await loadProfile(nextSession)
      if (mounted) setAuthLoading(false)
    }

    supabase.auth.getSession().then(({ data }) => applySession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [loadProfile])

  const handleSignOut = useCallback(async () => {
    if (isSupabaseConfigured) await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    setProfileError('')
  }, [])

  if (hasSupabaseConfig && supabaseConfigError) return <ConfigError message={supabaseConfigError} />
  if (!isSupabaseConfigured) return <Dashboard mode="demo" user={demoUser} profile={{ role: 'owner' }} onSignOut={handleSignOut} />
  if (authLoading) return <Splash />
  if (!session) return <Login />

  return (
    <ProtectedRoute loading={profileLoading} profile={profile} error={profileError} onSignOut={handleSignOut}>
      <Dashboard mode="supabase" user={session.user} profile={profile} onSignOut={handleSignOut} />
    </ProtectedRoute>
  )
}

function ConfigError({ message }) {
  return (
    <main className="auth-shell">
      <form className="auth-card">
        <div>
          <p className="eyeline">Cấu hình Supabase</p>
          <h1>Không thể kết nối Supabase Auth</h1>
        </div>
        <p className="form-message">{message}</p>
      </form>
    </main>
  )
}

function Splash() {
  return (
    <main className="splash">
      <div className="brand-mark"><Home size={26} /></div>
      <Loader2 className="spin" size={28} />
      <p>Đang kiểm tra đăng nhập Supabase...</p>
    </main>
  )
}

function Dashboard({ mode, user, profile, onSignOut }) {
  const [data, setData] = useState(sampleData)
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [selectedHouseId, setSelectedHouseId] = useState(ALL_HOUSES_ID)
  const [loading, setLoading] = useState(mode === 'supabase')
  const [savingKey, setSavingKey] = useState('')
  const [saveStatus, setSaveStatus] = useState({ state: 'idle', message: '' })
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [appTitle, setAppTitle] = useState(DEFAULT_APP_TITLE)
  const [activeView, setActiveView] = useState('dashboard')
  const [profiles, setProfiles] = useState([])
  const [profileSearch, setProfileSearch] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY)
    if (saved !== null) return saved === 'true'
    return window.matchMedia?.('(max-width: 767px)').matches ?? false
  })

  const isRemote = mode === 'supabase'
  const permissions = useMemo(() => getPermissions(mode, profile), [mode, profile])

  const refreshData = useCallback(async () => {
    if (!isRemote) {
      setToast('Dữ liệu demo đã được làm mới.')
      setData(sampleData)
      return
    }
    setLoading(true)
    setError('')
    try {
      const [nextData, nextTitle] = await Promise.all([fetchDashboardData(), fetchAppTitle()])
      setData(nextData)
      setAppTitle(nextTitle)
      setSelectedHouseId((current) => current || ALL_HOUSES_ID)
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setLoading(false)
    }
  }, [isRemote])

  const refreshProfiles = useCallback(async () => {
    if (!permissions.canManageUsers) return
    if (!isRemote) {
      setProfiles([{
        id: 'demo-owner',
        email: user?.email ?? demoUser.email,
        full_name: 'Demo owner',
        role: 'owner',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }])
      return
    }
    setError('')
    try {
      const nextProfiles = await fetchProfiles()
      setProfiles(nextProfiles)
    } catch (nextError) {
      setError(nextError.message)
    }
  }, [isRemote, permissions.canManageUsers, user?.email])

  useEffect(() => {
    if (!isRemote) {
      setData(sampleData)
      setSelectedHouseId(ALL_HOUSES_ID)
      return
    }
    refreshData()
  }, [isRemote, refreshData])

  useEffect(() => {
    if (!data.houses.length) {
      setSelectedHouseId(ALL_HOUSES_ID)
      return
    }
    if (selectedHouseId !== ALL_HOUSES_ID && !data.houses.some((house) => house.id === selectedHouseId)) {
      setSelectedHouseId(ALL_HOUSES_ID)
    }
  }, [data.houses, selectedHouseId])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed))
    }
  }, [sidebarCollapsed])

  useEffect(() => {
    if (activeView === 'users' && permissions.canManageUsers) refreshProfiles()
  }, [activeView, permissions.canManageUsers, refreshProfiles])

  useEffect(() => {
    if (activeView === 'users' && !permissions.canManageUsers) setActiveView('dashboard')
  }, [activeView, permissions.canManageUsers])

  const dashboard = useMemo(() => calculateDashboard(data, selectedHouseId, selectedMonth), [data, selectedHouseId, selectedMonth])
  const hasHouses = data.houses.length > 0
  const isAllHouses = selectedHouseId === ALL_HOUSES_ID
  const filteredProfiles = useMemo(() => {
    const query = profileSearch.trim().toLowerCase()
    if (!query) return profiles
    return profiles.filter((item) => [item.email, item.full_name, item.role]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)))
  }, [profileSearch, profiles])

  function showReadOnlyNotice() { setToast(READ_ONLY_MESSAGE) }

  async function runSave(key, action, successMessage, onError) {
    if (!permissions.canEdit) {
      showReadOnlyNotice()
      return false
    }
    setSavingKey(key)
    setSaveStatus({ state: 'saving', message: 'Đang lưu...' })
    setError('')
    try {
      await action()
      setSaveStatus({ state: 'saved', message: 'Đã lưu' })
      setToast(successMessage)
      return true
    } catch (nextError) {
      onError?.()
      setSaveStatus({ state: 'error', message: 'Lỗi lưu' })
      setError(nextError.message)
      return false
    } finally {
      setSavingKey('')
    }
  }

  function patchCollection(collection, id, patch) {
    setData((current) => ({
      ...current,
      [collection]: current[collection].map((item) => item.id === id ? { ...item, ...patch } : item),
    }))
  }

  function replaceCollectionItem(collection, previousId, nextItem) {
    setData((current) => ({
      ...current,
      [collection]: current[collection].some((item) => item.id === previousId)
        ? current[collection].map((item) => item.id === previousId ? nextItem : item)
        : [...current[collection], nextItem],
    }))
  }

  function addCollectionItem(collection, item) {
    setData((current) => ({ ...current, [collection]: [...current[collection], item] }))
  }

  async function commitProfilePatch(profileRow, patch) {
    if (!permissions.canManageUsers) {
      showReadOnlyNotice()
      return
    }

    const nextProfile = { ...profileRow, ...patch }
    const ownerCount = profiles.filter((item) => item.role === 'owner').length
    const isSelf = profileRow.id === user?.id
    const isLastOwnerSelf = isSelf && profileRow.role === 'owner' && nextProfile.role !== 'owner' && ownerCount <= 1

    if (isLastOwnerSelf) {
      setError('Không thể hạ quyền owner cuối cùng.')
      return
    }

    if (profileRow.role !== 'owner' && nextProfile.role === 'owner') {
      const confirmed = window.confirm('Tài khoản này sẽ có toàn quyền hệ thống. Bạn chắc chắn không?')
      if (!confirmed) return
    }

    const previousProfiles = profiles
    setProfiles((current) => current.map((item) => item.id === profileRow.id ? nextProfile : item))
    await runSave('profile-' + profileRow.id, async () => {
      if (isRemote) {
        const saved = await saveProfileRole(nextProfile)
        setProfiles((current) => current.map((item) => item.id === profileRow.id ? saved : item))
      }
    }, 'Đã lưu quyền.', () => setProfiles(previousProfiles))
  }

  async function commitAppTitle(value) {
    if (!permissions.canManageUsers) return showReadOnlyNotice()
    const nextTitle = String(value ?? '').trim() || DEFAULT_APP_TITLE
    const previousTitle = appTitle
    setAppTitle(nextTitle)
    await runSave('app-title', async () => {
      if (isRemote) {
        const savedTitle = await saveAppTitle(nextTitle)
        setAppTitle(savedTitle)
      }
    }, isRemote ? 'Đã lưu tên hệ thống.' : 'Đã lưu tên hệ thống trong demo local.', () => setAppTitle(previousTitle))
  }

  async function addHouse() {
    if (!permissions.canEdit) return showReadOnlyNotice()
    const draft = {
      id: localId('house'),
      name: `Nhà mới ${data.houses.length + 1}`,
      address: '',
      electricity_rate: 4000,
      water_rate: 20000,
      alert_variance_percent: 8,
      sort_order: data.houses.length + 1,
    }
    await runSave('house-new', async () => {
      if (isRemote) {
        const saved = await saveHouseRecord(draft)
        addCollectionItem('houses', saved)
        setSelectedHouseId(saved.id)
        return
      }
      addCollectionItem('houses', draft)
      setSelectedHouseId(draft.id)
    }, 'Đã thêm nhà.')
  }
  async function commitHousePatch(patch) {
    if (!dashboard.house) return
    const previousData = data
    const currentHouse = data.houses.find((house) => house.id === dashboard.house.id) ?? dashboard.house
    const nextHouse = { ...currentHouse, ...patch }
    patchCollection('houses', currentHouse.id, patch)
    await runSave(`house-${currentHouse.id}`, async () => {
      if (isRemote) {
        const saved = await saveHouseRecord(nextHouse)
        replaceCollectionItem('houses', currentHouse.id, saved)
      }
    }, 'Đã lưu thông tin nhà.', () => setData(previousData))
  }

  async function deleteCurrentHouse() {
    if (!dashboard.house) return
    if (!permissions.canDelete) return showReadOnlyNotice()
    const confirmed = window.confirm(`Xóa ${dashboard.house.name} và toàn bộ phòng liên quan?`)
    if (!confirmed) return
    await runSave(`house-delete-${dashboard.house.id}`, async () => {
      if (isRemote) await deleteHouseRecord(dashboard.house.id)
      setData((current) => ({
        houses: current.houses.filter((house) => house.id !== dashboard.house.id),
        rooms: current.rooms.filter((room) => room.house_id !== dashboard.house.id),
        readings: current.readings.filter((reading) => reading.house_id !== dashboard.house.id),
        invoices: current.invoices.filter((invoice) => invoice.house_id !== dashboard.house.id),
      }))
    }, 'Đã xóa nhà.')
  }

  async function addRoom() {
    if (!dashboard.house) return
    if (!permissions.canEdit) return showReadOnlyNotice()
    const nextIndex = dashboard.roomRows.length + 1
    const draft = {
      id: localId('room'),
      house_id: dashboard.house.id,
      name: `P${String(nextIndex).padStart(2, '0')}`,
      floor: '',
      resident_count: 1,
      monthly_rent: 2500000,
      service_fee_per_person: 80000,
      status: 'occupied',
      sort_order: nextIndex,
    }
    await runSave('room-new', async () => {
      if (isRemote) {
        const saved = await saveRoomRecord(draft)
        addCollectionItem('rooms', saved)
        return
      }
      addCollectionItem('rooms', draft)
    }, 'Đã thêm phòng.')
  }

  async function commitRoomPatch(room, patch) {
    const previousData = data
    const currentRoom = data.rooms.find((item) => item.id === room.id) ?? room
    const nextRoom = { ...currentRoom, ...patch }
    patchCollection('rooms', currentRoom.id, patch)
    await runSave(`room-${currentRoom.id}`, async () => {
      if (isRemote) {
        const saved = await saveRoomRecord(nextRoom)
        replaceCollectionItem('rooms', currentRoom.id, saved)
      }
    }, `Đã lưu ${nextRoom.name}.`, () => setData(previousData))
  }

  async function deleteRoom(room) {
    if (!permissions.canDelete) return showReadOnlyNotice()
    const confirmed = window.confirm(`Xóa phòng ${room.name}?`)
    if (!confirmed) return
    await runSave(`room-delete-${room.id}`, async () => {
      if (isRemote) await deleteRoomRecord(room.id)
      setData((current) => ({
        ...current,
        rooms: current.rooms.filter((item) => item.id !== room.id),
        readings: current.readings.filter((item) => item.room_id !== room.id),
      }))
    }, `Đã xóa ${room.name}.`)
  }

  function upsertReadingLocal(previousReadingId, nextReading) {
    setData((current) => {
      const exists = current.readings.some((reading) => reading.id === previousReadingId)
      return {
        ...current,
        readings: exists
          ? current.readings.map((reading) => reading.id === previousReadingId ? nextReading : reading)
          : [...current.readings, nextReading],
      }
    })
  }

  async function commitReadingPatch(row, patch) {
    const previousData = data
    const month = monthToDate(selectedMonth)
    const existing = data.readings.find((reading) => reading.room_id === row.room.id && reading.month === month)
    const baseReading = existing ?? createEmptyReading(row.room, selectedMonth)
    const nextReading = { ...baseReading, ...patch }
    upsertReadingLocal(baseReading.id, nextReading)
    await runSave(`reading-${row.room.id}`, async () => {
      if (isRemote) {
        const saved = await saveReadingRecord(nextReading)
        replaceCollectionItem('readings', baseReading.id, saved)
      }
    }, `Đã lưu chỉ số ${row.room.name}.`, () => setData(previousData))
  }

  function upsertInvoiceLocal(previousInvoiceId, nextInvoice) {
    setData((current) => {
      const exists = current.invoices.some((invoice) => invoice.id === previousInvoiceId)
      return {
        ...current,
        invoices: exists
          ? current.invoices.map((invoice) => invoice.id === previousInvoiceId ? nextInvoice : invoice)
          : [...current.invoices, nextInvoice],
      }
    })
  }

  async function addMarketSurvey() {
    if (!permissions.canManageUsers) return showReadOnlyNotice()
    const draft = {
      id: localId('survey'),
      area: dashboard.house?.address || dashboard.house?.name || '',
      source: '',
      room_type: 'Phong tro',
      room_size_m2: 0,
      monthly_rent: 0,
      electric_price: toNumber(dashboard.house?.electricity_rate),
      water_price: toNumber(dashboard.house?.water_rate),
      service_fee: 0,
      internet_fee: 0,
      note: '',
      survey_date: new Date().toISOString().slice(0, 10),
    }
    await runSave('survey-new', async () => {
      if (isRemote) {
        const saved = await saveMarketSurveyRecord(draft)
        addCollectionItem('marketSurveys', saved)
        return
      }
      addCollectionItem('marketSurveys', draft)
    }, 'Da them khao sat thi truong.')
  }

  async function commitMarketSurveyPatch(survey, patch) {
    if (!permissions.canManageUsers) return showReadOnlyNotice()
    const previousData = data
    const currentSurvey = data.marketSurveys?.find((item) => item.id === survey.id) ?? survey
    const nextSurvey = { ...currentSurvey, ...patch }
    patchCollection('marketSurveys', currentSurvey.id, patch)
    await runSave(`survey-${currentSurvey.id}`, async () => {
      if (isRemote) {
        const saved = await saveMarketSurveyRecord(nextSurvey)
        replaceCollectionItem('marketSurveys', currentSurvey.id, saved)
      }
    }, 'Da luu khao sat thi truong.', () => setData(previousData))
  }

  async function deleteMarketSurvey(survey) {
    if (!permissions.canManageUsers) return showReadOnlyNotice()
    const confirmed = window.confirm(`Xoa khao sat ${survey.area || survey.source || survey.room_type || ''}?`)
    if (!confirmed) return
    await runSave(`survey-delete-${survey.id}`, async () => {
      if (isRemote) await deleteMarketSurveyRecord(survey.id)
      setData((current) => ({
        ...current,
        marketSurveys: (current.marketSurveys ?? []).filter((item) => item.id !== survey.id),
      }))
    }, 'Da xoa khao sat thi truong.')
  }

  async function commitInvoicePatch(patch) {
    if (!dashboard.house || !dashboard.invoice) return
    const previousData = data
    const currentInvoice = dashboard.invoice
    const nextInvoice = { ...currentInvoice, ...patch }
    upsertInvoiceLocal(currentInvoice.id, nextInvoice)
    await runSave(`invoice-${currentInvoice.id}`, async () => {
      if (isRemote) {
        const saved = await saveInvoiceRecord(nextInvoice)
        replaceCollectionItem('invoices', currentInvoice.id, saved)
      }
    }, 'Đã lưu hóa đơn nhà nước.', () => setData(previousData))
  }

  return (
    <div className={'app-shell' + (sidebarCollapsed ? ' sidebar-collapsed' : '')}>
      <Sidebar appTitle={appTitle} mode={mode} user={user} profile={profile} permissions={permissions} activeView={activeView} onViewChange={setActiveView} collapsed={sidebarCollapsed} onToggleCollapsed={() => setSidebarCollapsed((current) => !current)} houseCount={data.houses.length} roomCount={data.rooms.length} onSaveAppTitle={commitAppTitle} onSignOut={onSignOut} />
      <main className="workspace">
        <header className="topbar">
          <div className="title-block">
            <RoleBadge permissions={permissions} />
            <p className="eyeline">Dashboard vận hành</p>
            <InlineEditableField
              value={appTitle}
              canEdit={permissions.canManageUsers}
              onSave={commitAppTitle}
              placeholder={DEFAULT_APP_TITLE}
              className="app-title-inline"
              onBlocked={showReadOnlyNotice}
            />
          </div>
          <div className="topbar-controls">
            <SaveIndicator status={saveStatus} />
            <label className="compact-field">
              <span>Tháng</span>
              <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
            </label>
            <label className="compact-field wide">
              <span>Nhà</span>
              <select value={selectedHouseId} onChange={(event) => setSelectedHouseId(event.target.value)} disabled={!hasHouses}>
                <option value={ALL_HOUSES_ID}>Tất cả</option>
                {data.houses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}
              </select>
            </label>
            <IconButton label="Làm mới" onClick={refreshData} disabled={loading}>{loading ? <Loader2 className="spin" size={17} /> : <RefreshCcw size={17} />}</IconButton>
          </div>
        </header>

        {!isSupabaseConfigured ? (
          <div className="notice-bar"><ShieldCheck size={18} /><span>Đang chạy demo local. Điền <code>VITE_SUPABASE_URL</code> và <code>VITE_SUPABASE_ANON_KEY</code> để bật đăng nhập Supabase Auth.</span></div>
        ) : null}
        {error ? <div className="error-bar"><AlertTriangle size={18} /><span>{error}</span></div> : null}
        {toast ? <button className="toast" type="button" onClick={() => setToast('')}><CheckCircle2 size={17} />{toast}</button> : null}

        {activeView === 'users' && permissions.canManageUsers ? (
          <UserManagementPanel profiles={filteredProfiles} search={profileSearch} onSearch={setProfileSearch} onCommit={commitProfilePatch} currentUserId={user?.id} savingKey={savingKey} />
        ) : !hasHouses ? (
          <EmptyState canEdit={permissions.canEdit} onAddHouse={addHouse} onBlocked={showReadOnlyNotice} saving={savingKey === 'house-new'} />
        ) : (
          <>
            <MetricStrip totals={dashboard.totals} business={dashboard.business} />
            <HouseTabs houses={data.houses} selectedHouseId={selectedHouseId} onSelect={setSelectedHouseId} />
            <section className="content-grid">
              <div className="primary-column">
                {isAllHouses ? <AllHousesPanel houses={data.houses} totals={dashboard.totals} /> : <HouseSettings house={dashboard.house} permissions={permissions} onCommit={commitHousePatch} onAddHouse={addHouse} onDelete={deleteCurrentHouse} onBlocked={showReadOnlyNotice} savingKey={savingKey} />}
                <RoomReadingsPanel rows={dashboard.roomRows} totals={dashboard.totals} permissions={permissions} onCommitRoom={commitRoomPatch} onDeleteRoom={deleteRoom} onCommitReading={commitReadingPatch} onAddRoom={isAllHouses ? null : addRoom} onBlocked={showReadOnlyNotice} savingKey={savingKey} />
                <MarketSurveyPanel surveys={data.marketSurveys ?? []} business={dashboard.business} permissions={{ ...permissions, canEdit: permissions.canManageUsers, canDelete: permissions.canManageUsers }} onAdd={addMarketSurvey} onCommit={commitMarketSurveyPatch} onDelete={deleteMarketSurvey} onBlocked={showReadOnlyNotice} savingKey={savingKey} />
              </div>
              <aside className="side-column">
                <BusinessInsightsPanel business={dashboard.business} />
                {isAllHouses ? <AggregateInvoicePanel invoice={dashboard.invoice} totals={dashboard.totals} houseCount={data.houses.length} /> : <InvoicePanel invoice={dashboard.invoice} totals={dashboard.totals} permissions={permissions} onCommit={commitInvoicePatch} onBlocked={showReadOnlyNotice} saving={savingKey === `invoice-${dashboard.invoice.id}`} />}
                <AlertPanel alerts={dashboard.alerts} />
              </aside>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function getPermissions(mode, profile) {
  const role = mode === 'supabase' ? profile?.role || 'viewer' : 'owner'
  return {
    role,
    label: ROLE_LABELS[role] ?? ROLE_LABELS.viewer,
    canEdit: role === 'owner' || role === 'admin',
    canDelete: role === 'owner',
    canManageUsers: role === 'owner',
  }
}

function Sidebar({ appTitle, mode, user, profile, permissions, activeView, onViewChange, collapsed, onToggleCollapsed, houseCount, roomCount, onSaveAppTitle, onSignOut }) {
  return (
    <aside className="sidebar">
      <button
        className="sidebar-toggle"
        type="button"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
        title={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
      >
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
      <div className="brand-lockup" title={collapsed ? appTitle : undefined}>
        <div className="brand-mark"><Home size={24} /></div>
        <div className="brand-copy">
          {permissions.canManageUsers ? (
            <InlineEditableField
              value={appTitle}
              canEdit={permissions.canManageUsers}
              onSave={onSaveAppTitle}
              placeholder={DEFAULT_APP_TITLE}
              className="sidebar-title-inline"
            />
          ) : (
            <strong className="sidebar-title-text">{appTitle}</strong>
          )}
          <span>{mode === 'supabase' ? 'Supabase Auth' : 'Demo local'}</span>
        </div>
      </div>
      <nav className="nav-list" aria-label="Dashboard">
        <button className={activeView === 'dashboard' ? 'active' : ''} type="button" onClick={() => onViewChange('dashboard')} title="Tổng quan" aria-label="Tổng quan"><Gauge size={17} /><span>Tổng quan</span></button>
        {permissions.canManageUsers ? <button className={activeView === 'users' ? 'active' : ''} type="button" onClick={() => onViewChange('users')} title="Người dùng" aria-label="Người dùng"><Users size={17} /><span>Người dùng</span></button> : null}
        <a href="#readings" onClick={() => onViewChange('dashboard')} title="Chỉ số điện nước" aria-label="Chỉ số điện nước"><Zap size={17} /><span>Chỉ số điện nước</span></a>
        <a href="#invoice" onClick={() => onViewChange('dashboard')} title="Hóa đơn nhà nước" aria-label="Hóa đơn nhà nước"><WalletCards size={17} /><span>Hóa đơn nhà nước</span></a>
        <a href="#alerts" onClick={() => onViewChange('dashboard')} title="Cảnh báo" aria-label="Cảnh báo"><AlertTriangle size={17} /><span>Cảnh báo</span></a>
      </nav>
      <div className="sidebar-stats"><div><span>Nhà</span><strong>{houseCount}</strong></div><div><span>Phòng</span><strong>{roomCount}</strong></div></div>
      <div className="account-box">
        <span>{user?.email}</span>
        {mode === 'supabase' && profile?.role ? <span className={'mode-chip role-' + permissions.role}>{permissions.label}</span> : <span className="mode-chip role-owner">Demo chủ sở hữu</span>}
        {mode === 'supabase' ? <button className="ghost-button" type="button" onClick={onSignOut} title="Đăng xuất" aria-label="Đăng xuất"><LogOut size={16} /><span>Đăng xuất</span></button> : null}
      </div>
    </aside>
  )
}
function RoleBadge({ permissions }) { return <span className={`role-badge role-${permissions.role}`}>{permissions.label}</span> }
function SaveIndicator({ status }) { return status.state === 'idle' ? null : <span className={`save-indicator ${status.state}`}>{status.message}</span> }

function UserManagementPanel({ profiles, search, onSearch, onCommit, currentUserId, savingKey }) {
  const ownerCount = profiles.filter((item) => item.role === 'owner').length
  return (
    <section className="panel user-panel">
      <div className="panel-heading sticky-actions">
        <div>
          <p className="eyeline">Người dùng</p>
          <h2>Quản lý tài khoản và phân quyền</h2>
        </div>
        <label className="compact-field user-search">
          <span>Tìm email</span>
          <input value={search} placeholder="Nhập email hoặc tên" onChange={(event) => onSearch(event.target.value)} />
        </label>
      </div>
      <div className="table-wrap user-table-wrap">
        <table className="data-table spreadsheet-table user-table">
          <thead><tr><th>Email</th><th>Tên hiển thị</th><th>Vai trò</th><th>Ngày tạo</th><th>Trạng thái</th></tr></thead>
          <tbody>{profiles.map((item) => {
            const isLastOwnerSelf = item.id === currentUserId && item.role === 'owner' && ownerCount <= 1
            return (
              <tr key={item.id}>
                <td><strong>{item.email}</strong>{item.id === currentUserId ? <small>Tài khoản của bạn</small> : null}</td>
                <td><InlineEditableField value={item.full_name} canEdit onSave={(value) => onCommit(item, { full_name: value })} placeholder="Tên hiển thị" className="compact-inline-field" /></td>
                <td>
                  <select
                    className="editable-cell select-cell role-select"
                    value={item.role}
                    title={isLastOwnerSelf ? 'Không thể hạ quyền owner cuối cùng' : 'Click để đổi quyền'}
                    onChange={(event) => onCommit(item, { role: event.target.value })}
                  >
                    {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value} disabled={isLastOwnerSelf && option.value !== 'owner'}>{option.label}</option>)}
                  </select>
                </td>
                <td>{formatDate(item.created_at)}</td>
                <td><span className={'mode-chip role-' + item.role}>{ROLE_LABELS[item.role] ?? item.role}</span>{savingKey === 'profile-' + item.id ? <small>Đang lưu...</small> : null}</td>
              </tr>
            )
          })}</tbody>
        </table>
      </div>
      {!profiles.length ? <p className="empty-inline">Chưa có tài khoản phù hợp với từ khóa tìm kiếm.</p> : null}
    </section>
  )
}

function formatDate(value) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('vi-VN').format(new Date(value))
}

function HouseTabs({ houses, selectedHouseId, onSelect }) {
  return (
    <section className="house-tabs" aria-label="Chọn nhanh nhà">
      <button className={selectedHouseId === ALL_HOUSES_ID ? 'active' : ''} type="button" onClick={() => onSelect(ALL_HOUSES_ID)}>Tất cả</button>
      {houses.map((house) => (
        <button className={selectedHouseId === house.id ? 'active' : ''} key={house.id} type="button" onClick={() => onSelect(house.id)} title={house.name}>
          {house.name}
        </button>
      ))}
    </section>
  )
}

function AllHousesPanel({ houses, totals }) {
  return (
    <section className="panel all-houses-panel">
      <div className="panel-heading compact"><div><p className="eyeline">Tất cả nhà</p><h2>Tổng hợp toàn hệ thống</h2></div><Building2 size={20} /></div>
      <div className="all-house-summary">
        <div><span>Nhà</span><strong>{formatNumber(houses.length)}</strong></div>
        <div><span>Phòng</span><strong>{formatNumber(totals.roomCount ?? 0)}</strong></div>
        <div><span>Người ở</span><strong>{formatNumber(totals.residents)}</strong></div>
      </div>
    </section>
  )
}

function AggregateInvoicePanel({ invoice, totals, houseCount }) {
  return (
    <section className="panel" id="invoice">
      <div className="panel-heading compact"><div><p className="eyeline">Hóa đơn nhà nước</p><h2>Tổng hợp {formatNumber(houseCount)} nhà</h2></div><WalletCards size={20} /></div>
      <div className="invoice-grid readonly-summary">
        <div><span>Điện EVN (kWh)</span><strong>{formatNumber(invoice.electricity_kwh)}</strong></div>
        <div><span>Tiền điện</span><strong>{formatCurrency(invoice.electricity_amount)}</strong></div>
        <div><span>Nước nhà nước (m3)</span><strong>{formatNumber(invoice.water_m3)}</strong></div>
        <div><span>Tiền nước</span><strong>{formatCurrency(invoice.water_amount)}</strong></div>
        <div><span>Chi phí khác</span><strong>{formatCurrency(invoice.other_amount)}</strong></div>
      </div>
      <div className="variance-box"><div><span>Lệch điện</span><strong>{formatNumber(totals.electricityVariancePercent)}%</strong></div><div><span>Lệch nước</span><strong>{formatNumber(totals.waterVariancePercent)}%</strong></div></div>
    </section>
  )
}

function MetricStrip({ totals, business }) {
  const metrics = [
    { label: 'Tong thu', value: formatCurrency(totals.totalRevenue), hint: 'Tien phong + dien nuoc + phi', icon: CircleDollarSign, tone: 'green' },
    { label: 'Tong chi', value: formatCurrency(totals.totalCost), hint: 'Hoa don dien nuoc nha nuoc', icon: WalletCards, tone: 'blue' },
    { label: 'Chenh lech', value: formatCurrency(totals.difference), hint: `Dien nuoc: ${formatCurrency(totals.utilityDifference)}`, icon: Gauge, tone: totals.difference >= 0 ? 'teal' : 'red' },
    { label: 'Bien loi nhuan thang', value: `${formatNumber(business.profitMarginPercent)}%`, hint: 'Loi nhuan / tong thu', icon: Gauge, tone: business.profitMarginPercent >= 0 ? 'green' : 'red' },
    { label: 'Lai/lo dien', value: formatCurrency(business.electricityProfit), hint: 'Thu dien tru chi phi dien', icon: Zap, tone: business.electricityProfit >= 0 ? 'teal' : 'red' },
    { label: 'Lai/lo nuoc', value: formatCurrency(business.waterProfit), hint: 'Thu nuoc tru chi phi nuoc', icon: WalletCards, tone: business.waterProfit >= 0 ? 'blue' : 'red' },
    { label: 'Lai/lo phi dich vu', value: formatCurrency(business.serviceProfit), hint: 'Phi dich vu tru chi phi khac', icon: CircleDollarSign, tone: business.serviceProfit >= 0 ? 'green' : 'red' },
    { label: 'Gia thue TB nha', value: formatCurrency(business.houseAverageRent), hint: 'Trung binh cac phong hien co', icon: Home, tone: 'amber' },
    { label: 'Gia thue TB thi truong', value: formatCurrency(business.market.averageRent), hint: `${formatNumber(business.market.count)} mau khao sat`, icon: Building2, tone: 'blue' },
    { label: 'Phong dinh gia thap', value: formatNumber(business.lowPricedRoomCount), hint: 'Thap hon thi truong >10%', icon: AlertTriangle, tone: business.lowPricedRoomCount ? 'red' : 'green' },
    { label: 'Canh bao can xu ly', value: formatNumber(business.actionAlertCount), hint: 'Dinh gia + loi lo van hanh', icon: AlertTriangle, tone: business.actionAlertCount ? 'red' : 'green' },
    { label: 'Chenh lech/ng??i', value: formatCurrency(totals.differencePerResident), hint: `${formatNumber(totals.residents)} nguoi dang o`, icon: Users, tone: 'amber' },
  ]
  return <section className="metric-strip" id="overview">{metrics.map((metric) => { const Icon = metric.icon; return <article className={`metric-card ${metric.tone}`} key={metric.label}><div className="metric-icon"><Icon size={20} /></div><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.hint}</small></article> })}</section>
}

function HouseSettings({ house, permissions, onCommit, onAddHouse, onDelete, onBlocked, savingKey }) {
  if (!house) return null
  return (
    <section className="panel house-panel">
      <div className="panel-heading sticky-actions">
        <div className="house-title-block">
          <p className="eyeline">Quản lý nhà</p>
          <InlineEditableField
            value={house.name}
            canEdit={permissions.canEdit}
            onSave={(value) => onCommit({ name: value })}
            placeholder="Tên nhà"
            className="house-title-inline"
            onBlocked={onBlocked}
          />
        </div>
        <div className="button-row">
          {permissions.canEdit ? <button className="secondary-button" type="button" onClick={onAddHouse}>{savingKey === 'house-new' ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}Thêm nhà</button> : null}
          {permissions.canDelete ? <IconButton label="Xóa nhà" onClick={onDelete}><Trash2 size={17} /></IconButton> : null}
        </div>
      </div>
      <div className="settings-grid sheet-settings">
        <label className="field editable-field"><span>Tên nhà</span><InlineEditableField value={house.name} canEdit={permissions.canEdit} onSave={(value) => onCommit({ name: value })} placeholder="Tên nhà" onBlocked={onBlocked} /></label>
        <label className="field editable-field"><span>Địa chỉ</span><InlineEditableField value={house.address} canEdit={permissions.canEdit} onSave={(value) => onCommit({ address: value })} placeholder="Địa chỉ" onBlocked={onBlocked} /></label>
        <label className="field editable-field"><span>Giá điện thu/kWh</span><InlineEditableField type="number" value={house.electricity_rate} canEdit={permissions.canEdit} onSave={(value) => onCommit({ electricity_rate: value })} placeholder="0" onBlocked={onBlocked} /></label>
        <label className="field editable-field"><span>Giá nước thu/m3</span><InlineEditableField type="number" value={house.water_rate} canEdit={permissions.canEdit} onSave={(value) => onCommit({ water_rate: value })} placeholder="0" onBlocked={onBlocked} /></label>
        <label className="field editable-field"><span>Ngưỡng cảnh báo %</span><InlineEditableField type="number" value={house.alert_variance_percent} canEdit={permissions.canEdit} onSave={(value) => onCommit({ alert_variance_percent: value })} placeholder="8" onBlocked={onBlocked} /></label>
      </div>
    </section>
  )
}

function RoomReadingsPanel({ rows, totals, permissions, onCommitRoom, onDeleteRoom, onCommitReading, onAddRoom, onBlocked, savingKey }) {
  return (
    <section className="panel readings-panel" id="readings">
      <div className="panel-heading sticky-actions">
        <div><p className="eyeline">Chỉ số điện nước</p><h2>Bảng nhập trực tiếp từng phòng</h2></div>
        {permissions.canEdit ? <button className="secondary-button always-visible" type="button" onClick={onAddRoom}>{savingKey === 'room-new' ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}Thêm phòng</button> : null}
      </div>
      <div className="table-wrap spreadsheet-wrap">
        <table className="data-table spreadsheet-table">
          <thead><tr><th>Mã phòng</th><th>Tầng</th><th>Trạng thái</th><th>Số người</th><th>Tiền phòng</th><th>Điện cũ</th><th>Điện mới</th><th>Nước cũ</th><th>Nước mới</th><th>Tổng thu</th>{permissions.canDelete ? <th></th> : null}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row.room.id}>
            <td><EditableCell value={row.room.name} canEdit={permissions.canEdit} strong onBlocked={onBlocked} onCommit={(value) => onCommitRoom(row.room, { name: value })} /></td>
            <td><EditableCell value={row.room.floor ?? ''} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommitRoom(row.room, { floor: value })} /></td>
            <td><EditableSelect value={row.room.status} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommitRoom(row.room, { status: value })} options={[{ value: 'occupied', label: 'Đang ở' }, { value: 'vacant', label: 'Trống' }, { value: 'maintenance', label: 'Sửa chữa' }]} /></td>
            <td><EditableCell type="number" value={row.room.resident_count} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommitRoom(row.room, { resident_count: value })} /></td>
            <td><EditableCell type="number" value={row.room.monthly_rent} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommitRoom(row.room, { monthly_rent: value })} /></td>
            <td><EditableCell type="number" value={row.reading.electricity_previous} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommitReading(row, { electricity_previous: value })} /></td>
            <td><EditableCell type="number" value={row.reading.electricity_current} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommitReading(row, { electricity_current: value })} helper={`${formatNumber(row.electricityUsage)} kWh`} /></td>
            <td><EditableCell type="number" value={row.reading.water_previous} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommitReading(row, { water_previous: value })} /></td>
            <td><EditableCell type="number" value={row.reading.water_current} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommitReading(row, { water_current: value })} helper={`${formatNumber(row.waterUsage)} m3`} /></td>
            <td><strong>{formatCurrency(row.totalRevenue)}</strong><small>Điện nước: {formatCurrency(row.utilityRevenue)}</small></td>
            {permissions.canDelete ? <td className="row-actions"><IconButton label="Xóa phòng" onClick={() => onDeleteRoom(row.room)}><Trash2 size={16} /></IconButton></td> : null}
          </tr>)}</tbody>
          <tfoot><tr><td>Tổng</td><td></td><td></td><td>{formatNumber(totals.residents)}</td><td>{formatCurrency(totals.rentRevenue)}</td><td></td><td>{formatNumber(totals.electricityUsage)} kWh</td><td></td><td>{formatNumber(totals.waterUsage)} m3</td><td>{formatCurrency(totals.totalRevenue)}</td>{permissions.canDelete ? <td></td> : null}</tr></tfoot>
        </table>
      </div>
      <div className="mobile-room-cards">{rows.map((row) => <RoomMobileCard key={`mobile-${row.room.id}`} row={row} permissions={permissions} onCommitRoom={onCommitRoom} onDeleteRoom={onDeleteRoom} onCommitReading={onCommitReading} onBlocked={onBlocked} />)}</div>
    </section>
  )
}

function RoomMobileCard({ row, permissions, onCommitRoom, onDeleteRoom, onCommitReading, onBlocked }) {
  return (
    <article className="room-card">
      <div className="room-card-heading"><strong>Phòng {row.room.name}</strong>{permissions.canDelete ? <IconButton label="Xóa phòng" onClick={() => onDeleteRoom(row.room)}><Trash2 size={16} /></IconButton> : null}</div>
      <div className="mobile-grid">
        <EditableField label="Mã phòng" value={row.room.name} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommitRoom(row.room, { name: value })} />
        <EditableField label="Số người" type="number" value={row.room.resident_count} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommitRoom(row.room, { resident_count: value })} />
        <EditableField label="Tiền phòng" type="number" value={row.room.monthly_rent} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommitRoom(row.room, { monthly_rent: value })} />
        <EditableField label="Điện cũ" type="number" value={row.reading.electricity_previous} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommitReading(row, { electricity_previous: value })} />
        <EditableField label="Điện mới" type="number" value={row.reading.electricity_current} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommitReading(row, { electricity_current: value })} />
        <EditableField label="Nước cũ" type="number" value={row.reading.water_previous} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommitReading(row, { water_previous: value })} />
        <EditableField label="Nước mới" type="number" value={row.reading.water_current} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommitReading(row, { water_current: value })} />
      </div>
      <div className="room-card-total"><span>Tổng thu</span><strong>{formatCurrency(row.totalRevenue)}</strong></div>
    </article>
  )
}
function MarketSurveyPanel({ surveys, business, permissions, onAdd, onCommit, onDelete, onBlocked, savingKey }) {
  return (
    <section className="panel market-panel" id="market">
      <div className="panel-heading sticky-actions">
        <div>
          <p className="eyeline">Khao sat thi truong</p>
          <h2>Mat bang gia khu vuc lan can</h2>
        </div>
        {permissions.canEdit ? <button className="secondary-button always-visible" type="button" onClick={onAdd}>{savingKey === 'survey-new' ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}Them khao sat</button> : null}
      </div>
      <div className="market-summary">
        <div><span>Gia thue TB</span><strong>{formatCurrency(business.market.averageRent)}</strong></div>
        <div><span>Thap nhat / cao nhat</span><strong>{formatCurrency(business.market.minRent)} - {formatCurrency(business.market.maxRent)}</strong></div>
        <div><span>Gia dien TB</span><strong>{formatCurrency(business.market.averageElectricPrice)}</strong></div>
        <div><span>Gia nuoc TB</span><strong>{formatCurrency(business.market.averageWaterPrice)}</strong></div>
        <div><span>Phi dich vu TB</span><strong>{formatCurrency(business.market.averageServiceFee)}</strong></div>
      </div>
      <div className="table-wrap spreadsheet-wrap survey-wrap">
        <table className="data-table spreadsheet-table survey-table">
          <thead><tr><th>Khu vuc</th><th>Nguon</th><th>Loai phong</th><th>Dien tich</th><th>Gia thue</th><th>Gia dien</th><th>Gia nuoc</th><th>Phi DV</th><th>Phi mang</th><th>Ghi chu</th>{permissions.canDelete ? <th></th> : null}</tr></thead>
          <tbody>{surveys.map((survey) => <tr key={survey.id}>
            <td><EditableCell value={survey.area} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommit(survey, { area: value })} /></td>
            <td><EditableCell value={survey.source} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommit(survey, { source: value })} /></td>
            <td><EditableCell value={survey.room_type} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommit(survey, { room_type: value })} /></td>
            <td><EditableCell type="number" value={survey.room_size_m2} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommit(survey, { room_size_m2: value })} helper="m2" /></td>
            <td><EditableCell type="number" value={survey.monthly_rent} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommit(survey, { monthly_rent: value })} /></td>
            <td><EditableCell type="number" value={survey.electric_price} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommit(survey, { electric_price: value })} /></td>
            <td><EditableCell type="number" value={survey.water_price} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommit(survey, { water_price: value })} /></td>
            <td><EditableCell type="number" value={survey.service_fee} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommit(survey, { service_fee: value })} /></td>
            <td><EditableCell type="number" value={survey.internet_fee} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommit(survey, { internet_fee: value })} /></td>
            <td><EditableCell value={survey.note} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommit(survey, { note: value })} /></td>
            {permissions.canDelete ? <td className="row-actions"><IconButton label="Xoa khao sat" onClick={() => onDelete(survey)}><Trash2 size={16} /></IconButton></td> : null}
          </tr>)}</tbody>
        </table>
      </div>
      {!surveys.length ? <p className="empty-inline">Chua co mau khao sat. Them du lieu de bat dau so sanh gia.</p> : null}
    </section>
  )
}

function BusinessInsightsPanel({ business }) {
  return (
    <section className="panel business-panel">
      <div className="panel-heading compact"><div><p className="eyeline">Phan tich kinh doanh</p><h2>De xuat cai thien</h2></div><Gauge size={20} /></div>
      <div className="comparison-list">
        {business.roomComparisons.slice(0, 6).map((item) => (
          <article className={`comparison-item ${item.isLowMarketRent || item.isLowRevenuePerResident ? 'warning' : item.isHighMarketRent ? 'notice' : ''}`} key={item.room.id}>
            <div><strong>{item.room.name}</strong><span>{formatCurrency(item.rent)} / thang</span></div>
            <em>{business.market.averageRent ? `Lech thi truong ${formatNumber(item.marketDeltaPercent)}%` : 'Chua co du lieu thi truong'}</em>
          </article>
        ))}
      </div>
      <div className="recommendation-list">
        {business.recommendations.map((item, index) => <article key={`rec-${index}`}><CheckCircle2 size={16} /><span>{item}</span></article>)}
      </div>
    </section>
  )
}

function InvoicePanel({ invoice, totals, permissions, onCommit, onBlocked, saving }) {
  if (!invoice) return null
  return (
    <section className="panel" id="invoice">
      <div className="panel-heading compact">
        <div><p className="eyeline">Hóa đơn nhà nước</p><h2>Đối soát tháng</h2></div>
        {saving ? <Loader2 className="spin" size={20} /> : <WalletCards size={20} />}
      </div>
      <div className="invoice-grid">
        <EditableField label="Điện EVN (kWh)" type="number" value={invoice.electricity_kwh} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommit({ electricity_kwh: value })} />
        <EditableField label="Tiền điện" type="number" value={invoice.electricity_amount} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommit({ electricity_amount: value })} />
        <EditableField label="Nước nhà nước (m3)" type="number" value={invoice.water_m3} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommit({ water_m3: value })} />
        <EditableField label="Tiền nước" type="number" value={invoice.water_amount} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommit({ water_amount: value })} />
        <EditableField label="Chi phí khác" type="number" value={invoice.other_amount} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommit({ other_amount: value })} />
        <EditableField label="Ghi chú" value={invoice.note} canEdit={permissions.canEdit} onBlocked={onBlocked} onCommit={(value) => onCommit({ note: value })} />
      </div>
      <div className="variance-box"><div><span>Lệch điện</span><strong>{formatNumber(totals.electricityVariancePercent)}%</strong></div><div><span>Lệch nước</span><strong>{formatNumber(totals.waterVariancePercent)}%</strong></div></div>
    </section>
  )
}

function AlertPanel({ alerts }) {
  return (
    <section className="panel" id="alerts">
      <div className="panel-heading compact"><div><p className="eyeline">Cảnh báo bất thường</p><h2>Ưu tiên kiểm tra</h2></div><AlertTriangle size={20} /></div>
      <div className="alert-list">{alerts.map((alert, index) => <article className={`alert-item ${alert.level}`} key={`${alert.title}-${index}`}><div className="alert-icon">{alert.level === 'success' ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}</div><div><strong>{alert.title}</strong><span>{alert.detail}</span></div></article>)}</div>
    </section>
  )
}

function EmptyState({ canEdit, onAddHouse, onBlocked, saving }) {
  return (
    <section className="empty-state">
      <Building2 size={38} />
      <h2>Chưa có nhà nào</h2>
      <p>Tạo nhà đầu tiên để bắt đầu nhập phòng, chỉ số điện nước và hóa đơn tháng.</p>
      {canEdit ? <button className="primary-button" type="button" onClick={onAddHouse}>{saving ? <Loader2 className="spin" size={17} /> : <Plus size={17} />}Thêm nhà đầu tiên</button> : <button className="secondary-button" type="button" onClick={onBlocked}>{READ_ONLY_MESSAGE}</button>}
    </section>
  )
}

function EditableField({ label, value, type = 'text', canEdit, onCommit, onBlocked }) {
  return (
    <label className="field editable-field">
      <span>{label}</span>
      <InlineEditableField
        value={value}
        type={type}
        canEdit={canEdit}
        onSave={onCommit}
        placeholder={label}
        className="compact-inline-field"
        onBlocked={onBlocked}
      />
    </label>
  )
}

function InlineEditableField({
  value,
  type = 'text',
  canEdit,
  onSave,
  placeholder,
  className = '',
  onBlocked,
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(formatDraftValue(value, type))
  const inputRef = useRef(null)
  const cancelRef = useRef(false)

  useEffect(() => {
    if (!isEditing) setDraft(formatDraftValue(value, type))
  }, [isEditing, type, value])

  useEffect(() => {
    if (isEditing) inputRef.current?.focus()
  }, [isEditing])

  const displayValue = type === 'number' ? formatNumber(value) : value || placeholder || '-'
  const tooltip = canEdit ? 'Click để sửa' : 'Chỉ chủ sở hữu được sửa'

  function beginEdit() {
    if (!canEdit) {
      onBlocked?.()
      return
    }
    cancelRef.current = false
    setDraft(formatDraftValue(value, type))
    setIsEditing(true)
  }

  function commit() {
    if (cancelRef.current) {
      cancelRef.current = false
      setDraft(formatDraftValue(value, type))
      setIsEditing(false)
      return
    }

    const nextValue = type === 'number' ? toNumber(draft) : draft.trim()
    const currentValue = type === 'number' ? toNumber(value) : String(value ?? '')
    const changed = type === 'number' ? nextValue !== currentValue : nextValue !== currentValue

    setIsEditing(false)
    if (changed) onSave(nextValue)
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        className={`inline-edit-input ${className}`}
        type={type === 'number' ? 'number' : 'text'}
        inputMode={type === 'number' ? 'decimal' : undefined}
        min={type === 'number' ? '0' : undefined}
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            cancelRef.current = true
            event.currentTarget.blur()
          }
        }}
      />
    )
  }

  return (
    <button
      className={`inline-edit-display ${className} ${canEdit ? 'can-edit' : 'read-only'}`}
      type="button"
      title={tooltip}
      onClick={beginEdit}
    >
      {displayValue}
    </button>
  )
}

function EditableCell({ value, type = 'text', canEdit, onCommit, onBlocked, helper, strong }) {
  const [draft, setDraft] = useState(formatDraftValue(value, type))
  const [focused, setFocused] = useState(false)
  const cancelRef = useRef(false)

  useEffect(() => {
    if (!focused) setDraft(formatDraftValue(value, type))
  }, [focused, type, value])

  const displayValue = type === 'number' ? formatNumber(value) : value || '—'
  if (!canEdit) {
    return <button className={`read-only-cell ${strong ? 'strong' : ''}`} type="button" onClick={onBlocked}><span>{displayValue}</span>{helper ? <small>{helper}</small> : null}</button>
  }

  function commit() {
    if (cancelRef.current) {
      cancelRef.current = false
      setDraft(formatDraftValue(value, type))
      return
    }
    const nextValue = type === 'number' ? toNumber(draft) : draft
    const hasChanged = type === 'number' ? toNumber(value) !== nextValue : String(value ?? '') !== String(nextValue ?? '')
    if (hasChanged) onCommit(nextValue)
  }

  return (
    <div className="editable-cell-wrap">
      <input
        className={`editable-cell ${strong ? 'strong' : ''}`}
        type={type === 'number' ? 'number' : 'text'}
        inputMode={type === 'number' ? 'decimal' : undefined}
        min={type === 'number' ? '0' : undefined}
        value={draft}
        onFocus={() => setFocused(true)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => { setFocused(false); commit() }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
          if (event.key === 'Escape') { event.preventDefault(); cancelRef.current = true; event.currentTarget.blur() }
        }}
      />
      {helper ? <small>{helper}</small> : null}
    </div>
  )
}

function EditableSelect({ value, canEdit, onCommit, onBlocked, options }) {
  if (!canEdit) {
    const selected = options.find((option) => option.value === value)
    return <button className="read-only-cell" type="button" onClick={onBlocked}><span>{selected?.label ?? value}</span></button>
  }
  return <select className="editable-cell select-cell" value={value} onChange={(event) => onCommit(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
}

function formatDraftValue(value, type) {
  if (type === 'number') return Number.isFinite(Number(value)) ? String(value) : '0'
  return value ?? ''
}

function IconButton({ label, children, onClick, disabled }) {
  return <button className="icon-button" type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}>{children}</button>
}
