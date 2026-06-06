import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
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
  deleteRoomRecord,
  fetchAppTitle,
  fetchCurrentProfile,
  fetchDashboardData,
  saveAppTitle,
  saveHouseRecord,
  saveInvoiceRecord,
  saveReadingRecord,
  saveRoomRecord,
} from './lib/supabaseData'

const demoUser = { email: 'demo@nha-tro.local' }
const ROLE_LABELS = { owner: 'Chủ sở hữu', admin: 'Admin', viewer: 'Chỉ xem' }
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
  const [selectedHouseId, setSelectedHouseId] = useState(sampleData.houses[0]?.id ?? '')
  const [loading, setLoading] = useState(mode === 'supabase')
  const [savingKey, setSavingKey] = useState('')
  const [saveStatus, setSaveStatus] = useState({ state: 'idle', message: '' })
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [appTitle, setAppTitle] = useState(DEFAULT_APP_TITLE)

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
      setSelectedHouseId((current) => current || nextData.houses[0]?.id || '')
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setLoading(false)
    }
  }, [isRemote])

  useEffect(() => {
    if (!isRemote) {
      setData(sampleData)
      setSelectedHouseId(sampleData.houses[0]?.id ?? '')
      return
    }
    refreshData()
  }, [isRemote, refreshData])

  useEffect(() => {
    if (!data.houses.length) {
      setSelectedHouseId('')
      return
    }
    if (!data.houses.some((house) => house.id === selectedHouseId)) setSelectedHouseId(data.houses[0].id)
  }, [data.houses, selectedHouseId])

  const dashboard = useMemo(() => calculateDashboard(data, selectedHouseId, selectedMonth), [data, selectedHouseId, selectedMonth])
  const hasHouses = data.houses.length > 0

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

  async function commitAppTitle(value) {
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
    <div className="app-shell">
      <Sidebar appTitle={appTitle} mode={mode} user={user} profile={profile} permissions={permissions} houseCount={data.houses.length} roomCount={data.rooms.length} onSignOut={onSignOut} />
      <main className="workspace">
        <header className="topbar">
          <div className="title-block">
            <RoleBadge permissions={permissions} />
            <p className="eyeline">Dashboard vận hành</p>
            <InlineEditableField
              value={appTitle}
              canEdit={permissions.canEdit}
              onSave={commitAppTitle}
              placeholder={DEFAULT_APP_TITLE}
              className="app-title-inline"
              onBlocked={showReadOnlyNotice}
            />
            {permissions.canEdit ? <span className="sheet-hint">Click vào tiêu đề để sửa</span> : null}
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

        {!hasHouses ? (
          <EmptyState canEdit={permissions.canEdit} onAddHouse={addHouse} onBlocked={showReadOnlyNotice} saving={savingKey === 'house-new'} />
        ) : (
          <>
            <MetricStrip totals={dashboard.totals} />
            <section className="content-grid">
              <div className="primary-column">
                <HouseSettings house={dashboard.house} permissions={permissions} onCommit={commitHousePatch} onAddHouse={addHouse} onDelete={deleteCurrentHouse} onBlocked={showReadOnlyNotice} savingKey={savingKey} />
                <RoomReadingsPanel rows={dashboard.roomRows} totals={dashboard.totals} permissions={permissions} onCommitRoom={commitRoomPatch} onDeleteRoom={deleteRoom} onCommitReading={commitReadingPatch} onAddRoom={addRoom} onBlocked={showReadOnlyNotice} savingKey={savingKey} />
              </div>
              <aside className="side-column">
                <InvoicePanel invoice={dashboard.invoice} totals={dashboard.totals} permissions={permissions} onCommit={commitInvoicePatch} onBlocked={showReadOnlyNotice} saving={savingKey === `invoice-${dashboard.invoice.id}`} />
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
  return { role, label: ROLE_LABELS[role] ?? 'Chỉ xem', canEdit: role === 'owner', canDelete: role === 'owner' }
}
function Sidebar({ appTitle, mode, user, profile, permissions, houseCount, roomCount, onSignOut }) {
  return (
    <aside className="sidebar">
      <div className="brand-lockup"><div className="brand-mark"><Home size={24} /></div><div><strong>{appTitle}</strong><span>{mode === 'supabase' ? 'Supabase Auth' : 'Demo local'}</span></div></div>
      <nav className="nav-list" aria-label="Dashboard">
        <a className="active" href="#overview"><Gauge size={17} />Tổng quan</a>
        <a href="#readings"><Zap size={17} />Chỉ số điện nước</a>
        <a href="#invoice"><WalletCards size={17} />Hóa đơn nhà nước</a>
        <a href="#alerts"><AlertTriangle size={17} />Cảnh báo</a>
      </nav>
      <div className="sidebar-stats"><div><span>Nhà</span><strong>{houseCount}</strong></div><div><span>Phòng</span><strong>{roomCount}</strong></div></div>
      <div className="account-box">
        <span>{user?.email}</span>
        {mode === 'supabase' && profile?.role ? <span className={`mode-chip role-${permissions.role}`}>{permissions.label}</span> : <span className="mode-chip role-owner">Demo chủ sở hữu</span>}
        {mode === 'supabase' ? <button className="ghost-button" type="button" onClick={onSignOut}><LogOut size={16} />Đăng xuất</button> : null}
      </div>
    </aside>
  )
}

function RoleBadge({ permissions }) { return <span className={`role-badge role-${permissions.role}`}>{permissions.label}</span> }
function SaveIndicator({ status }) { return status.state === 'idle' ? null : <span className={`save-indicator ${status.state}`}>{status.message}</span> }

function MetricStrip({ totals }) {
  const metrics = [
    { label: 'Tổng thu', value: formatCurrency(totals.totalRevenue), hint: 'Tiền phòng + điện nước + phí', icon: CircleDollarSign, tone: 'green' },
    { label: 'Tổng chi', value: formatCurrency(totals.totalCost), hint: 'Hóa đơn điện nước nhà nước', icon: WalletCards, tone: 'blue' },
    { label: 'Chênh lệch', value: formatCurrency(totals.difference), hint: `Điện nước: ${formatCurrency(totals.utilityDifference)}`, icon: Gauge, tone: totals.difference >= 0 ? 'teal' : 'red' },
    { label: 'Chênh lệch/người', value: formatCurrency(totals.differencePerResident), hint: `${formatNumber(totals.residents)} người đang ở`, icon: Users, tone: 'amber' },
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
          <span className="sheet-hint">Click vào ô để sửa, Enter để lưu, Esc để hủy</span>
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
        <div><p className="eyeline">Chỉ số điện nước</p><h2>Bảng nhập trực tiếp từng phòng</h2><span className="sheet-hint">Click vào ô để sửa</span></div>
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
function InvoicePanel({ invoice, totals, permissions, onCommit, onBlocked, saving }) {
  if (!invoice) return null
  return (
    <section className="panel" id="invoice">
      <div className="panel-heading compact">
        <div><p className="eyeline">Hóa đơn nhà nước</p><h2>Đối soát tháng</h2><span className="sheet-hint">Autosave khi rời ô</span></div>
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
