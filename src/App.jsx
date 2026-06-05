import { useCallback, useEffect, useMemo, useState } from 'react'
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
  Save,
  ShieldCheck,
  Trash2,
  Users,
  WalletCards,
  Zap,
} from 'lucide-react'
import Login from './components/Login'
import ProtectedRoute from './components/ProtectedRoute'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { sampleData } from './lib/sampleData'
import {
  calculateDashboard,
  createEmptyInvoice,
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
  fetchCurrentProfile,
  fetchDashboardData,
  saveHouseRecord,
  saveInvoiceRecord,
  saveReadingRecord,
  saveRoomRecord,
} from './lib/supabaseData'

const demoUser = {
  email: 'demo@nha-tro.local',
}

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
    if (!isSupabaseConfigured) {
      return undefined
    }

    let mounted = true

    async function applySession(nextSession) {
      if (!mounted) return
      setSession(nextSession)
      await loadProfile(nextSession)
      if (mounted) {
        setAuthLoading(false)
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      applySession(data.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [loadProfile])

  const handleSignOut = useCallback(async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut()
    }
    setSession(null)
    setProfile(null)
    setProfileError('')
  }, [])

  if (!isSupabaseConfigured) {
    return <Dashboard mode="demo" user={demoUser} profile={{ role: 'admin' }} onSignOut={handleSignOut} />
  }

  if (authLoading) {
    return <Splash />
  }

  if (!session) {
    return <Login />
  }

  return (
    <ProtectedRoute
      loading={profileLoading}
      profile={profile}
      error={profileError}
      onSignOut={handleSignOut}
    >
      <Dashboard
        mode="supabase"
        user={session.user}
        profile={profile}
        onSignOut={handleSignOut}
      />
    </ProtectedRoute>
  )
}

function Splash() {
  return (
    <main className="splash">
      <div className="brand-mark">
        <Home size={26} />
      </div>
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
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')

  const isRemote = mode === 'supabase'

  const refreshData = useCallback(async () => {
    if (!isRemote) {
      setToast('Dữ liệu demo đã được làm mới.')
      setData(sampleData)
      return
    }

    setLoading(true)
    setError('')
    try {
      const nextData = await fetchDashboardData()
      setData(nextData)
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
    if (!data.houses.some((house) => house.id === selectedHouseId)) {
      setSelectedHouseId(data.houses[0].id)
    }
  }, [data.houses, selectedHouseId])

  const dashboard = useMemo(
    () => calculateDashboard(data, selectedHouseId, selectedMonth),
    [data, selectedHouseId, selectedMonth],
  )

  async function runSave(key, action, successMessage) {
    setSavingKey(key)
    setError('')
    try {
      await action()
      setToast(successMessage)
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setSavingKey('')
    }
  }

  function patchCollection(collection, id, patch) {
    setData((current) => ({
      ...current,
      [collection]: current[collection].map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }))
  }

  function replaceCollectionItem(collection, previousId, nextItem) {
    setData((current) => ({
      ...current,
      [collection]: current[collection].some((item) => item.id === previousId)
        ? current[collection].map((item) => (item.id === previousId ? nextItem : item))
        : [...current[collection], nextItem],
    }))
  }

  function addCollectionItem(collection, item) {
    setData((current) => ({
      ...current,
      [collection]: [...current[collection], item],
    }))
  }

  async function addHouse() {
    const draft = {
      id: localId('house'),
      name: `Nhà mới ${data.houses.length + 1}`,
      address: '',
      electricity_rate: 4000,
      water_rate: 20000,
      alert_variance_percent: 8,
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

  async function saveCurrentHouse() {
    if (!dashboard.house) return
    const house = dashboard.house
    await runSave(`house-${house.id}`, async () => {
      if (isRemote) {
        const saved = await saveHouseRecord(house)
        replaceCollectionItem('houses', house.id, saved)
      }
    }, isRemote ? 'Đã lưu thông tin nhà.' : 'Đã lưu trong phiên demo.')
  }

  async function deleteCurrentHouse() {
    if (!dashboard.house) return
    const confirmed = window.confirm(`Xóa ${dashboard.house.name} và toàn bộ phòng liên quan?`)
    if (!confirmed) return

    await runSave(`house-delete-${dashboard.house.id}`, async () => {
      if (isRemote) {
        await deleteHouseRecord(dashboard.house.id)
      }
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

  async function saveRoom(room) {
    await runSave(`room-${room.id}`, async () => {
      if (isRemote) {
        const saved = await saveRoomRecord(room)
        replaceCollectionItem('rooms', room.id, saved)
      }
    }, isRemote ? `Đã lưu ${room.name}.` : `Đã lưu ${room.name} trong demo.`)
  }

  async function deleteRoom(room) {
    const confirmed = window.confirm(`Xóa phòng ${room.name}?`)
    if (!confirmed) return

    await runSave(`room-delete-${room.id}`, async () => {
      if (isRemote) {
        await deleteRoomRecord(room.id)
      }
      setData((current) => ({
        ...current,
        rooms: current.rooms.filter((item) => item.id !== room.id),
        readings: current.readings.filter((item) => item.room_id !== room.id),
      }))
    }, `Đã xóa ${room.name}.`)
  }

  function patchReading(room, patch) {
    const month = monthToDate(selectedMonth)
    setData((current) => {
      const existing = current.readings.find(
        (reading) => reading.room_id === room.id && reading.month === month,
      )
      const nextReading = {
        ...(existing ?? createEmptyReading(room, selectedMonth)),
        ...patch,
      }

      return {
        ...current,
        readings: existing
          ? current.readings.map((reading) => (reading.id === existing.id ? nextReading : reading))
          : [...current.readings, nextReading],
      }
    })
  }

  async function saveReading(row) {
    await runSave(`reading-${row.room.id}`, async () => {
      if (isRemote) {
        const saved = await saveReadingRecord(row.reading)
        replaceCollectionItem('readings', row.reading.id, saved)
      }
    }, isRemote ? `Đã lưu chỉ số ${row.room.name}.` : `Đã lưu chỉ số ${row.room.name} trong demo.`)
  }

  function patchInvoice(patch) {
    if (!dashboard.house) return
    const month = monthToDate(selectedMonth)
    setData((current) => {
      const existing = current.invoices.find(
        (invoice) => invoice.house_id === dashboard.house.id && invoice.month === month,
      )
      const nextInvoice = {
        ...(existing ?? createEmptyInvoice(dashboard.house.id, selectedMonth)),
        ...patch,
      }

      return {
        ...current,
        invoices: existing
          ? current.invoices.map((invoice) => (invoice.id === existing.id ? nextInvoice : invoice))
          : [...current.invoices, nextInvoice],
      }
    })
  }

  async function saveInvoice() {
    await runSave(`invoice-${dashboard.invoice.id}`, async () => {
      if (isRemote) {
        const saved = await saveInvoiceRecord(dashboard.invoice)
        replaceCollectionItem('invoices', dashboard.invoice.id, saved)
      }
    }, isRemote ? 'Đã lưu hóa đơn nhà nước.' : 'Đã lưu hóa đơn trong demo.')
  }

  const hasHouses = data.houses.length > 0

  return (
    <div className="app-shell">
      <Sidebar
        mode={mode}
        user={user}
        profile={profile}
        houseCount={data.houses.length}
        roomCount={data.rooms.length}
        onSignOut={onSignOut}
      />

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyeline">Dashboard vận hành</p>
            <h1>Nhà trọ Manager</h1>
          </div>

          <div className="topbar-controls">
            <label className="compact-field">
              <span>Tháng</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
              />
            </label>
            <label className="compact-field wide">
              <span>Nhà</span>
              <select
                value={selectedHouseId}
                onChange={(event) => setSelectedHouseId(event.target.value)}
                disabled={!hasHouses}
              >
                {data.houses.map((house) => (
                  <option key={house.id} value={house.id}>
                    {house.name}
                  </option>
                ))}
              </select>
            </label>
            <IconButton label="Làm mới" onClick={refreshData} disabled={loading}>
              {loading ? <Loader2 className="spin" size={17} /> : <RefreshCcw size={17} />}
            </IconButton>
          </div>
        </header>

        {!isSupabaseConfigured ? (
          <div className="notice-bar">
            <ShieldCheck size={18} />
            <span>
              Đang chạy demo local. Điền <code>VITE_SUPABASE_URL</code> và{' '}
              <code>VITE_SUPABASE_ANON_KEY</code> để bật đăng nhập Supabase Auth.
            </span>
          </div>
        ) : null}

        {error ? (
          <div className="error-bar">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        ) : null}

        {toast ? (
          <button className="toast" type="button" onClick={() => setToast('')}>
            <CheckCircle2 size={17} />
            {toast}
          </button>
        ) : null}

        {!hasHouses ? (
          <EmptyState onAddHouse={addHouse} saving={savingKey === 'house-new'} />
        ) : (
          <>
            <MetricStrip totals={dashboard.totals} />

            <section className="content-grid">
              <div className="primary-column">
                <HouseSettings
                  house={dashboard.house}
                  onPatch={(patch) => patchCollection('houses', dashboard.house.id, patch)}
                  onAddHouse={addHouse}
                  onSave={saveCurrentHouse}
                  onDelete={deleteCurrentHouse}
                  savingKey={savingKey}
                />

                <RoomReadingsPanel
                  rows={dashboard.roomRows}
                  totals={dashboard.totals}
                  onPatchRoom={(roomId, patch) => patchCollection('rooms', roomId, patch)}
                  onSaveRoom={saveRoom}
                  onDeleteRoom={deleteRoom}
                  onPatchReading={patchReading}
                  onSaveReading={saveReading}
                  onAddRoom={addRoom}
                  savingKey={savingKey}
                />
              </div>

              <aside className="side-column">
                <InvoicePanel
                  invoice={dashboard.invoice}
                  totals={dashboard.totals}
                  onPatch={patchInvoice}
                  onSave={saveInvoice}
                  saving={savingKey === `invoice-${dashboard.invoice.id}`}
                />

                <AlertPanel alerts={dashboard.alerts} />
              </aside>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function Sidebar({ mode, user, profile, houseCount, roomCount, onSignOut }) {
  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <div className="brand-mark">
          <Home size={24} />
        </div>
        <div>
          <strong>Nhà trọ Manager</strong>
          <span>{mode === 'supabase' ? 'Supabase Auth' : 'Demo local'}</span>
        </div>
      </div>

      <nav className="nav-list" aria-label="Dashboard">
        <a className="active" href="#overview">
          <Gauge size={17} />
          Tổng quan
        </a>
        <a href="#readings">
          <Zap size={17} />
          Chỉ số điện nước
        </a>
        <a href="#invoice">
          <WalletCards size={17} />
          Hóa đơn nhà nước
        </a>
        <a href="#alerts">
          <AlertTriangle size={17} />
          Cảnh báo
        </a>
      </nav>

      <div className="sidebar-stats">
        <div>
          <span>Nhà</span>
          <strong>{houseCount}</strong>
        </div>
        <div>
          <span>Phòng</span>
          <strong>{roomCount}</strong>
        </div>
      </div>

      <div className="account-box">
        <span>{user?.email}</span>
        {mode === 'supabase' && profile?.role ? (
          <span className="mode-chip">{profile.role === 'admin' ? 'Admin' : profile.role}</span>
        ) : null}
        {mode === 'supabase' ? (
          <button className="ghost-button" type="button" onClick={onSignOut}>
            <LogOut size={16} />
            Đăng xuất
          </button>
        ) : (
          <span className="mode-chip">Demo</span>
        )}
      </div>
    </aside>
  )
}

function MetricStrip({ totals }) {
  const metrics = [
    {
      label: 'Tổng thu',
      value: formatCurrency(totals.totalRevenue),
      hint: 'Tiền phòng + điện nước + phí',
      icon: CircleDollarSign,
      tone: 'green',
    },
    {
      label: 'Tổng chi',
      value: formatCurrency(totals.totalCost),
      hint: 'Hóa đơn điện nước nhà nước',
      icon: WalletCards,
      tone: 'blue',
    },
    {
      label: 'Chênh lệch',
      value: formatCurrency(totals.difference),
      hint: `Điện nước: ${formatCurrency(totals.utilityDifference)}`,
      icon: Gauge,
      tone: totals.difference >= 0 ? 'teal' : 'red',
    },
    {
      label: 'Chênh lệch/người',
      value: formatCurrency(totals.differencePerResident),
      hint: `${formatNumber(totals.residents)} người đang ở`,
      icon: Users,
      tone: 'amber',
    },
  ]

  return (
    <section className="metric-strip" id="overview">
      {metrics.map((metric) => {
        const Icon = metric.icon
        return (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <div className="metric-icon">
              <Icon size={20} />
            </div>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.hint}</small>
          </article>
        )
      })}
    </section>
  )
}

function HouseSettings({ house, onPatch, onAddHouse, onSave, onDelete, savingKey }) {
  if (!house) return null

  return (
    <section className="panel house-panel">
      <div className="panel-heading">
        <div>
          <p className="eyeline">Quản lý nhà</p>
          <h2>{house.name}</h2>
        </div>
        <div className="button-row">
          <button className="secondary-button" type="button" onClick={onAddHouse}>
            {savingKey === 'house-new' ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
            Thêm nhà
          </button>
          <IconButton label="Xóa nhà" onClick={onDelete}>
            <Trash2 size={17} />
          </IconButton>
        </div>
      </div>

      <div className="settings-grid">
        <TextField
          label="Tên nhà"
          value={house.name}
          onChange={(value) => onPatch({ name: value })}
        />
        <TextField
          label="Địa chỉ"
          value={house.address}
          onChange={(value) => onPatch({ address: value })}
        />
        <NumberField
          label="Giá điện thu/kWh"
          value={house.electricity_rate}
          onChange={(value) => onPatch({ electricity_rate: value })}
        />
        <NumberField
          label="Giá nước thu/m3"
          value={house.water_rate}
          onChange={(value) => onPatch({ water_rate: value })}
        />
        <NumberField
          label="Ngưỡng cảnh báo %"
          value={house.alert_variance_percent}
          onChange={(value) => onPatch({ alert_variance_percent: value })}
        />
        <button className="primary-button align-end" type="button" onClick={onSave}>
          {savingKey === `house-${house.id}` ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
          Lưu nhà
        </button>
      </div>
    </section>
  )
}

function RoomReadingsPanel({
  rows,
  totals,
  onPatchRoom,
  onSaveRoom,
  onDeleteRoom,
  onPatchReading,
  onSaveReading,
  onAddRoom,
  savingKey,
}) {
  return (
    <section className="panel readings-panel" id="readings">
      <div className="panel-heading">
        <div>
          <p className="eyeline">Chỉ số điện nước</p>
          <h2>Theo từng phòng trong tháng</h2>
        </div>
        <button className="secondary-button" type="button" onClick={onAddRoom}>
          {savingKey === 'room-new' ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
          Thêm phòng
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Phòng</th>
              <th>Người</th>
              <th>Tiền phòng</th>
              <th>Điện cũ</th>
              <th>Điện mới</th>
              <th>Nước cũ</th>
              <th>Nước mới</th>
              <th>Thu điện nước</th>
              <th>Tổng thu</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.room.id}>
                <td className="room-cell">
                  <input
                    className="table-input strong"
                    value={row.room.name}
                    onChange={(event) => onPatchRoom(row.room.id, { name: event.target.value })}
                  />
                  <div className="row-meta">
                    <input
                      className="table-input small"
                      value={row.room.floor ?? ''}
                      placeholder="Tầng"
                      onChange={(event) => onPatchRoom(row.room.id, { floor: event.target.value })}
                    />
                    <select
                      value={row.room.status}
                      onChange={(event) => onPatchRoom(row.room.id, { status: event.target.value })}
                    >
                      <option value="occupied">Đang ở</option>
                      <option value="vacant">Trống</option>
                      <option value="maintenance">Sửa chữa</option>
                    </select>
                  </div>
                </td>
                <td>
                  <TableNumber
                    value={row.room.resident_count}
                    onChange={(value) => onPatchRoom(row.room.id, { resident_count: value })}
                  />
                </td>
                <td>
                  <TableNumber
                    value={row.room.monthly_rent}
                    onChange={(value) => onPatchRoom(row.room.id, { monthly_rent: value })}
                  />
                  <small>Phí/ng: {formatCurrency(row.room.service_fee_per_person)}</small>
                </td>
                <td>
                  <TableNumber
                    value={row.reading.electricity_previous}
                    onChange={(value) => onPatchReading(row.room, { electricity_previous: value })}
                  />
                </td>
                <td>
                  <TableNumber
                    value={row.reading.electricity_current}
                    onChange={(value) => onPatchReading(row.room, { electricity_current: value })}
                  />
                  <small>{formatNumber(row.electricityUsage)} kWh</small>
                </td>
                <td>
                  <TableNumber
                    value={row.reading.water_previous}
                    onChange={(value) => onPatchReading(row.room, { water_previous: value })}
                  />
                </td>
                <td>
                  <TableNumber
                    value={row.reading.water_current}
                    onChange={(value) => onPatchReading(row.room, { water_current: value })}
                  />
                  <small>{formatNumber(row.waterUsage)} m3</small>
                </td>
                <td>
                  <strong>{formatCurrency(row.utilityRevenue)}</strong>
                  <small>
                    {formatCurrency(row.electricityCharge)} + {formatCurrency(row.waterCharge)}
                  </small>
                </td>
                <td>
                  <strong>{formatCurrency(row.totalRevenue)}</strong>
                  <small>Gồm phí DV</small>
                </td>
                <td className="row-actions">
                  <IconButton label="Lưu phòng" onClick={() => onSaveRoom(row.room)}>
                    {savingKey === `room-${row.room.id}` ? (
                      <Loader2 className="spin" size={16} />
                    ) : (
                      <Save size={16} />
                    )}
                  </IconButton>
                  <IconButton label="Lưu chỉ số" onClick={() => onSaveReading(row)}>
                    {savingKey === `reading-${row.room.id}` ? (
                      <Loader2 className="spin" size={16} />
                    ) : (
                      <Gauge size={16} />
                    )}
                  </IconButton>
                  <IconButton label="Xóa phòng" onClick={() => onDeleteRoom(row.room)}>
                    <Trash2 size={16} />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Tổng</td>
              <td>{formatNumber(totals.residents)}</td>
              <td>{formatCurrency(totals.rentRevenue)}</td>
              <td></td>
              <td>{formatNumber(totals.electricityUsage)} kWh</td>
              <td></td>
              <td>{formatNumber(totals.waterUsage)} m3</td>
              <td>{formatCurrency(totals.utilityRevenue)}</td>
              <td>{formatCurrency(totals.totalRevenue)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

function InvoicePanel({ invoice, totals, onPatch, onSave, saving }) {
  return (
    <section className="panel" id="invoice">
      <div className="panel-heading compact">
        <div>
          <p className="eyeline">Hóa đơn nhà nước</p>
          <h2>Đối soát tháng</h2>
        </div>
        <WalletCards size={20} />
      </div>

      <div className="invoice-grid">
        <NumberField
          label="Điện EVN (kWh)"
          value={invoice.electricity_kwh}
          onChange={(value) => onPatch({ electricity_kwh: value })}
        />
        <NumberField
          label="Tiền điện"
          value={invoice.electricity_amount}
          onChange={(value) => onPatch({ electricity_amount: value })}
        />
        <NumberField
          label="Nước nhà nước (m3)"
          value={invoice.water_m3}
          onChange={(value) => onPatch({ water_m3: value })}
        />
        <NumberField
          label="Tiền nước"
          value={invoice.water_amount}
          onChange={(value) => onPatch({ water_amount: value })}
        />
        <NumberField
          label="Chi phí khác"
          value={invoice.other_amount}
          onChange={(value) => onPatch({ other_amount: value })}
        />
        <TextField label="Ghi chú" value={invoice.note} onChange={(value) => onPatch({ note: value })} />
      </div>

      <div className="variance-box">
        <div>
          <span>Lệch điện</span>
          <strong>{formatNumber(totals.electricityVariancePercent)}%</strong>
        </div>
        <div>
          <span>Lệch nước</span>
          <strong>{formatNumber(totals.waterVariancePercent)}%</strong>
        </div>
      </div>

      <button className="primary-button full" type="button" onClick={onSave}>
        {saving ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
        Lưu hóa đơn
      </button>
    </section>
  )
}

function AlertPanel({ alerts }) {
  return (
    <section className="panel" id="alerts">
      <div className="panel-heading compact">
        <div>
          <p className="eyeline">Cảnh báo bất thường</p>
          <h2>Ưu tiên kiểm tra</h2>
        </div>
        <AlertTriangle size={20} />
      </div>

      <div className="alert-list">
        {alerts.map((alert, index) => (
          <article className={`alert-item ${alert.level}`} key={`${alert.title}-${index}`}>
            <div className="alert-icon">
              {alert.level === 'success' ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
            </div>
            <div>
              <strong>{alert.title}</strong>
              <span>{alert.detail}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function EmptyState({ onAddHouse, saving }) {
  return (
    <section className="empty-state">
      <Building2 size={38} />
      <h2>Chưa có nhà nào</h2>
      <p>Tạo nhà đầu tiên để bắt đầu nhập phòng, chỉ số điện nước và hóa đơn tháng.</p>
      <button className="primary-button" type="button" onClick={onAddHouse}>
        {saving ? <Loader2 className="spin" size={17} /> : <Plus size={17} />}
        Thêm nhà đầu tiên
      </button>
    </section>
  )
}

function TextField({ label, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="text" value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function NumberField({ label, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        value={value ?? 0}
        onChange={(event) => onChange(toNumber(event.target.value))}
      />
    </label>
  )
}

function TableNumber({ value, onChange }) {
  return (
    <input
      className="table-input number"
      type="number"
      inputMode="decimal"
      min="0"
      value={value ?? 0}
      onChange={(event) => onChange(toNumber(event.target.value))}
    />
  )
}

function IconButton({ label, children, onClick, disabled }) {
  return (
    <button className="icon-button" type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}
