export const currencyFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})

export const numberFormatter = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 1,
})

export function formatCurrency(value) {
  return currencyFormatter.format(toNumber(value))
}

export function formatNumber(value) {
  return numberFormatter.format(toNumber(value))
}

export function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function localId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `local-${prefix}-${crypto.randomUUID()}`
  }
  return `local-${prefix}-${Date.now()}-${Math.round(Math.random() * 10000)}`
}

export function monthToDate(month) {
  return `${month}-01`
}

export function dateToMonth(date) {
  return date?.slice(0, 7)
}

export function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7)
}

export function getPreviousMonth(month) {
  const [year, monthIndex] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthIndex - 2, 1))
  return date.toISOString().slice(0, 7)
}

export function createEmptyReading(room, month) {
  return {
    id: localId('reading'),
    house_id: room.house_id,
    room_id: room.id,
    month: monthToDate(month),
    electricity_previous: 0,
    electricity_current: 0,
    water_previous: 0,
    water_current: 0,
    note: '',
  }
}

export function createEmptyInvoice(houseId, month) {
  return {
    id: localId('invoice'),
    house_id: houseId,
    month: monthToDate(month),
    electricity_kwh: 0,
    electricity_amount: 0,
    water_m3: 0,
    water_amount: 0,
    other_amount: 0,
    note: '',
  }
}

export function calculateDashboard(data, selectedHouseId, selectedMonth) {
  const houses = data.houses ?? []
  const rooms = data.rooms ?? []
  const readings = data.readings ?? []
  const invoices = data.invoices ?? []
  const house = houses.find((item) => item.id === selectedHouseId) ?? houses[0]

  if (!house) {
    return {
      house: null,
      roomRows: [],
      invoice: null,
      alerts: [],
      totals: emptyTotals(),
    }
  }

  const monthDate = monthToDate(selectedMonth)
  const previousMonthDate = monthToDate(getPreviousMonth(selectedMonth))
  const houseRooms = rooms
    .filter((room) => room.house_id === house.id)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
  const invoice =
    invoices.find((item) => item.house_id === house.id && item.month === monthDate) ??
    createEmptyInvoice(house.id, selectedMonth)

  const roomRows = houseRooms.map((room) => {
    const reading =
      readings.find((item) => item.room_id === room.id && item.month === monthDate) ??
      createEmptyReading(room, selectedMonth)
    const previousReading = readings.find(
      (item) => item.room_id === room.id && item.month === previousMonthDate,
    )

    const electricityRaw =
      toNumber(reading.electricity_current) - toNumber(reading.electricity_previous)
    const waterRaw = toNumber(reading.water_current) - toNumber(reading.water_previous)
    const electricityUsage = Math.max(0, electricityRaw)
    const waterUsage = Math.max(0, waterRaw)
    const electricityCharge = electricityUsage * toNumber(house.electricity_rate)
    const waterCharge = waterUsage * toNumber(house.water_rate)
    const utilityRevenue = electricityCharge + waterCharge
    const serviceRevenue = toNumber(room.resident_count) * toNumber(room.service_fee_per_person)
    const rentRevenue = toNumber(room.monthly_rent)
    const totalRevenue = utilityRevenue + serviceRevenue + rentRevenue

    const previousElectricityUsage = previousReading
      ? Math.max(
          0,
          toNumber(previousReading.electricity_current) -
            toNumber(previousReading.electricity_previous),
        )
      : null
    const previousWaterUsage = previousReading
      ? Math.max(0, toNumber(previousReading.water_current) - toNumber(previousReading.water_previous))
      : null

    return {
      room,
      reading,
      electricityRaw,
      waterRaw,
      electricityUsage,
      waterUsage,
      electricityCharge,
      waterCharge,
      utilityRevenue,
      serviceRevenue,
      rentRevenue,
      totalRevenue,
      previousElectricityUsage,
      previousWaterUsage,
    }
  })

  const totals = roomRows.reduce(
    (acc, row) => {
      acc.residents += toNumber(row.room.resident_count)
      acc.electricityUsage += row.electricityUsage
      acc.waterUsage += row.waterUsage
      acc.electricityRevenue += row.electricityCharge
      acc.waterRevenue += row.waterCharge
      acc.utilityRevenue += row.utilityRevenue
      acc.rentRevenue += row.rentRevenue
      acc.serviceRevenue += row.serviceRevenue
      acc.totalRevenue += row.totalRevenue
      return acc
    },
    {
      residents: 0,
      electricityUsage: 0,
      waterUsage: 0,
      electricityRevenue: 0,
      waterRevenue: 0,
      utilityRevenue: 0,
      rentRevenue: 0,
      serviceRevenue: 0,
      totalRevenue: 0,
    },
  )

  totals.electricityCost = toNumber(invoice.electricity_amount)
  totals.waterCost = toNumber(invoice.water_amount)
  totals.otherCost = toNumber(invoice.other_amount)
  totals.totalCost = totals.electricityCost + totals.waterCost + totals.otherCost
  totals.utilityDifference = totals.utilityRevenue - totals.electricityCost - totals.waterCost
  totals.difference = totals.totalRevenue - totals.totalCost
  totals.differencePerResident = totals.residents > 0 ? totals.difference / totals.residents : 0
  totals.invoiceElectricityKwh = toNumber(invoice.electricity_kwh)
  totals.invoiceWaterM3 = toNumber(invoice.water_m3)
  totals.electricityVariancePercent = percentageVariance(
    totals.electricityUsage,
    totals.invoiceElectricityKwh,
  )
  totals.waterVariancePercent = percentageVariance(totals.waterUsage, totals.invoiceWaterM3)

  return {
    house,
    roomRows,
    invoice,
    totals,
    alerts: buildAlerts({ house, roomRows, invoice, totals }),
  }
}

function emptyTotals() {
  return {
    residents: 0,
    electricityUsage: 0,
    waterUsage: 0,
    electricityRevenue: 0,
    waterRevenue: 0,
    utilityRevenue: 0,
    rentRevenue: 0,
    serviceRevenue: 0,
    totalRevenue: 0,
    totalCost: 0,
    difference: 0,
    differencePerResident: 0,
    utilityDifference: 0,
    electricityVariancePercent: 0,
    waterVariancePercent: 0,
  }
}

function percentageVariance(actual, expected) {
  if (!expected) {
    return actual ? 100 : 0
  }
  return ((actual - expected) / expected) * 100
}

function buildAlerts({ house, roomRows, invoice, totals }) {
  const alerts = []
  const threshold = toNumber(house.alert_variance_percent || 8)

  if (!invoice.id || String(invoice.id).startsWith('local-invoice')) {
    const hasInvoiceValue =
      toNumber(invoice.electricity_amount) + toNumber(invoice.water_amount) + toNumber(invoice.other_amount)
    if (!hasInvoiceValue) {
      alerts.push({
        level: 'warning',
        title: 'Thieu hoa don nha nuoc',
        detail: 'Chua co chi phi dien/nuoc de doi soat tong chi thang nay.',
      })
    }
  }

  if (Math.abs(totals.electricityVariancePercent) > threshold && totals.invoiceElectricityKwh > 0) {
    alerts.push({
      level: Math.abs(totals.electricityVariancePercent) > threshold * 1.8 ? 'danger' : 'warning',
      title: 'Lech san luong dien',
      detail: `Tong phong ${formatNumber(totals.electricityUsage)} kWh, hoa don ${formatNumber(
        totals.invoiceElectricityKwh,
      )} kWh (${formatNumber(totals.electricityVariancePercent)}%).`,
    })
  }

  if (Math.abs(totals.waterVariancePercent) > threshold && totals.invoiceWaterM3 > 0) {
    alerts.push({
      level: Math.abs(totals.waterVariancePercent) > threshold * 1.8 ? 'danger' : 'warning',
      title: 'Lech san luong nuoc',
      detail: `Tong phong ${formatNumber(totals.waterUsage)} m3, hoa don ${formatNumber(
        totals.invoiceWaterM3,
      )} m3 (${formatNumber(totals.waterVariancePercent)}%).`,
    })
  }

  if (totals.utilityDifference < 0) {
    alerts.push({
      level: 'danger',
      title: 'Thu dien nuoc thap hon chi',
      detail: `Chenh lech tien dien/nuoc dang am ${formatCurrency(Math.abs(totals.utilityDifference))}.`,
    })
  }

  for (const row of roomRows) {
    const residents = toNumber(row.room.resident_count)
    if (row.electricityRaw < 0 || row.waterRaw < 0) {
      alerts.push({
        level: 'danger',
        title: `${row.room.name}: chi so bi giam`,
        detail: 'Chi so moi thap hon chi so cu, can kiem tra lai dong ho.',
      })
    }

    if (row.room.status === 'vacant' && (row.electricityUsage > 3 || row.waterUsage > 1)) {
      alerts.push({
        level: 'warning',
        title: `${row.room.name}: phong trong co su dung`,
        detail: `${formatNumber(row.electricityUsage)} kWh va ${formatNumber(row.waterUsage)} m3.`,
      })
    }

    if (residents > 0 && row.electricityUsage / residents > 120) {
      alerts.push({
        level: 'warning',
        title: `${row.room.name}: điện/người cao`,
        detail: `${formatNumber(row.electricityUsage / residents)} kWh mỗi người.`,
      })
    }

    if (residents > 0 && row.waterUsage / residents > 8) {
      alerts.push({
        level: 'warning',
        title: `${row.room.name}: nước/người cao`,
        detail: `${formatNumber(row.waterUsage / residents)} m3 mỗi người.`,
      })
    }

    if (row.previousElectricityUsage && row.electricityUsage > row.previousElectricityUsage * 1.8) {
      alerts.push({
        level: 'warning',
        title: `${row.room.name}: dien tang manh`,
        detail: `Tu ${formatNumber(row.previousElectricityUsage)} len ${formatNumber(
          row.electricityUsage,
        )} kWh so voi thang truoc.`,
      })
    }

    if (row.previousWaterUsage && row.waterUsage > row.previousWaterUsage * 1.8) {
      alerts.push({
        level: 'warning',
        title: `${row.room.name}: nuoc tang manh`,
        detail: `Tu ${formatNumber(row.previousWaterUsage)} len ${formatNumber(row.waterUsage)} m3.`,
      })
    }
  }

  if (!alerts.length) {
    alerts.push({
      level: 'success',
      title: 'Khong co bat thuong lon',
      detail: 'San luong va dong tien nam trong nguong canh bao cua nha.',
    })
  }

  return alerts
}
