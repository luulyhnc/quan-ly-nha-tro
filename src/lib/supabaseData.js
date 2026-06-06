import { DEFAULT_APP_TITLE, APP_TITLE_KEY } from './appSettings'
import { supabase } from './supabase'

const TABLES = {
  houses: 'houses',
  rooms: 'rooms',
  readings: 'room_meter_readings',
  invoices: 'state_invoices',
  settings: 'app_settings',
}

export async function fetchCurrentProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,full_name,role,created_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function fetchDashboardData() {
  const [houses, rooms, readings, invoices] = await Promise.all([
    supabase.from(TABLES.houses).select('*').order('created_at', { ascending: true }),
    supabase
      .from(TABLES.rooms)
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from(TABLES.readings)
      .select('*')
      .order('month', { ascending: false })
      .limit(5000),
    supabase
      .from(TABLES.invoices)
      .select('*')
      .order('month', { ascending: false })
      .limit(1000),
  ])

  for (const response of [houses, rooms, readings, invoices]) {
    if (response.error) {
      throw response.error
    }
  }

  return {
    houses: houses.data ?? [],
    rooms: rooms.data ?? [],
    readings: readings.data ?? [],
    invoices: invoices.data ?? [],
  }
}

export async function fetchAppTitle() {
  const { data, error } = await supabase
    .from(TABLES.settings)
    .select('value')
    .eq('key', APP_TITLE_KEY)
    .maybeSingle()

  if (error) throw error
  return data?.value || DEFAULT_APP_TITLE
}

export async function saveAppTitle(value) {
  const nextTitle = String(value ?? '').trim() || DEFAULT_APP_TITLE
  const { data, error } = await supabase
    .from(TABLES.settings)
    .upsert({ key: APP_TITLE_KEY, value: nextTitle }, { onConflict: 'key' })
    .select('value')
    .single()

  if (error) throw error
  return data?.value || nextTitle
}

export async function saveHouseRecord(house) {
  const payload = stripLocalId({
    id: house.id,
    name: house.name,
    address: house.address,
    electricity_rate: numberOrZero(house.electricity_rate),
    water_rate: numberOrZero(house.water_rate),
    alert_variance_percent: numberOrZero(house.alert_variance_percent || 8),
    electric_unit_price: numberOrZero(house.electricity_rate),
    water_unit_price: numberOrZero(house.water_rate),
    warning_threshold_percent: numberOrZero(house.alert_variance_percent || 8),
    sort_order: numberOrZero(house.sort_order),
  })

  const { data, error } = await supabase.from(TABLES.houses).upsert(payload).select().single()
  if (error) throw error
  return data
}

export async function deleteHouseRecord(id) {
  const { error } = await supabase.from(TABLES.houses).delete().eq('id', id)
  if (error) throw error
}

export async function saveRoomRecord(room) {
  const payload = stripLocalId({
    id: room.id,
    house_id: room.house_id,
    name: room.name,
    room_code: room.name,
    room_name: room.name,
    floor: room.floor,
    resident_count: numberOrZero(room.resident_count),
    occupants: numberOrZero(room.resident_count),
    monthly_rent: numberOrZero(room.monthly_rent),
    room_price: numberOrZero(room.monthly_rent),
    service_fee_per_person: numberOrZero(room.service_fee_per_person),
    status: room.status,
    sort_order: numberOrZero(room.sort_order),
  })

  const { data, error } = await supabase.from(TABLES.rooms).upsert(payload).select().single()
  if (error) throw error
  return data
}

export async function deleteRoomRecord(id) {
  const { error } = await supabase.from(TABLES.rooms).delete().eq('id', id)
  if (error) throw error
}

export async function saveReadingRecord(reading) {
  const payload = stripLocalId({
    id: reading.id,
    house_id: reading.house_id,
    room_id: reading.room_id,
    month: reading.month,
    electricity_previous: numberOrZero(reading.electricity_previous),
    electricity_current: numberOrZero(reading.electricity_current),
    water_previous: numberOrZero(reading.water_previous),
    water_current: numberOrZero(reading.water_current),
    electric_old: numberOrZero(reading.electricity_previous),
    electric_new: numberOrZero(reading.electricity_current),
    water_old: numberOrZero(reading.water_previous),
    water_new: numberOrZero(reading.water_current),
    note: reading.note ?? '',
  })

  const { data, error } = await supabase
    .from(TABLES.readings)
    .upsert(payload, { onConflict: 'room_id,month' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function saveInvoiceRecord(invoice) {
  const payload = stripLocalId({
    id: invoice.id,
    house_id: invoice.house_id,
    month: invoice.month,
    electricity_kwh: numberOrZero(invoice.electricity_kwh),
    electricity_amount: numberOrZero(invoice.electricity_amount),
    water_m3: numberOrZero(invoice.water_m3),
    water_amount: numberOrZero(invoice.water_amount),
    other_amount: numberOrZero(invoice.other_amount),
    state_electric_kwh: numberOrZero(invoice.electricity_kwh),
    state_electric_amount: numberOrZero(invoice.electricity_amount),
    state_water_m3: numberOrZero(invoice.water_m3),
    state_water_amount: numberOrZero(invoice.water_amount),
    other_fee: numberOrZero(invoice.other_amount),
    note: invoice.note ?? '',
  })

  const { data, error } = await supabase
    .from(TABLES.invoices)
    .upsert(payload, { onConflict: 'house_id,month' })
    .select()
    .single()
  if (error) throw error
  return data
}

function stripLocalId(payload) {
  if (String(payload.id ?? '').startsWith('local-')) {
    const rest = { ...payload }
    delete rest.id
    return rest
  }
  return payload
}

function numberOrZero(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}
