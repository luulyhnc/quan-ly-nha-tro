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
  const marketSurveys = data.marketSurveys ?? []
  const isAllHouses = !selectedHouseId || selectedHouseId === 'all'
  const selectedHouse = isAllHouses ? null : houses.find((item) => item.id === selectedHouseId)

  if (!houses.length || (!isAllHouses && !selectedHouse)) {
    return {
      house: null,
      roomRows: [],
      invoice: createEmptyInvoice('all', selectedMonth),
      alerts: [],
      totals: emptyTotals(),
      business: emptyBusiness(),
      isAllHouses,
    }
  }

  const monthDate = monthToDate(selectedMonth)
  const previousMonth = getPreviousMonth(selectedMonth)
  const previousMonthDate = monthToDate(previousMonth)

  if (isAllHouses) {
    const housesById = new Map(houses.map((house) => [house.id, house]))
    const houseOrder = new Map(houses.map((house, index) => [house.id, index]))
    const scopedRooms = rooms
      .filter((room) => housesById.has(room.house_id))
      .sort((a, b) =>
        (houseOrder.get(a.house_id) ?? 0) - (houseOrder.get(b.house_id) ?? 0) ||
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        a.name.localeCompare(b.name),
      )
    const aggregateHouse = buildAggregateHouse(houses)
    const invoice = buildAggregateInvoice({ houses, invoices, month: selectedMonth })
    const roomRows = buildRoomRows({ house: aggregateHouse, housesById, rooms: scopedRooms, readings, selectedMonth, previousMonthDate })
    const totals = buildTotals(roomRows, invoice)
    totals.roomCount = scopedRooms.length
    const previousTotals = buildMonthTotals({ houses, rooms: scopedRooms, readings, invoices, month: previousMonth })
    const business = buildBusinessAnalysis({ marketSurveys, roomRows, totals, previousTotals, house: aggregateHouse })

    return {
      house: null,
      roomRows,
      invoice,
      totals,
      business,
      alerts: buildAlerts({ house: aggregateHouse, roomRows, invoice, totals, business }),
      isAllHouses: true,
    }
  }

  const house = selectedHouse
  const houseRooms = rooms
    .filter((room) => room.house_id === house.id)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
  const invoice =
    invoices.find((item) => item.house_id === house.id && item.month === monthDate) ??
    createEmptyInvoice(house.id, selectedMonth)

  const roomRows = buildRoomRows({ house, rooms: houseRooms, readings, selectedMonth, previousMonthDate })
  const totals = buildTotals(roomRows, invoice)
  totals.roomCount = houseRooms.length
  const previousTotals = buildMonthTotals({ house, rooms: houseRooms, readings, invoices, month: previousMonth })
  const business = buildBusinessAnalysis({ marketSurveys, roomRows, totals, previousTotals, house })

  return {
    house,
    roomRows,
    invoice,
    totals,
    business,
    alerts: buildAlerts({ house, roomRows, invoice, totals, business }),
    isAllHouses: false,
  }
}

function buildAggregateHouse(houses) {
  return {
    id: 'all',
    name: 'Tất cả',
    electricity_rate: average(houses.map((house) => house.electricity_rate)),
    water_rate: average(houses.map((house) => house.water_rate)),
    alert_variance_percent: average(houses.map((house) => house.alert_variance_percent)) || 8,
  }
}

function buildAggregateInvoice({ houses, invoices, month }) {
  const houseIds = new Set(houses.map((house) => house.id))
  const monthDate = monthToDate(month)
  const scopedInvoices = invoices.filter((invoice) => houseIds.has(invoice.house_id) && invoice.month === monthDate)
  return {
    id: 'aggregate-invoice-' + month,
    house_id: 'all',
    month: monthDate,
    electricity_kwh: sumBy(scopedInvoices, 'electricity_kwh'),
    electricity_amount: sumBy(scopedInvoices, 'electricity_amount'),
    water_m3: sumBy(scopedInvoices, 'water_m3'),
    water_amount: sumBy(scopedInvoices, 'water_amount'),
    other_amount: sumBy(scopedInvoices, 'other_amount'),
    note: '',
  }
}

function sumBy(items, key) {
  return items.reduce((sum, item) => sum + toNumber(item[key]), 0)
}
function buildRoomRows({ house, housesById, rooms, readings, selectedMonth, previousMonthDate }) {
  const monthDate = monthToDate(selectedMonth)

  return rooms.map((room) => {
    const roomHouse = housesById?.get(room.house_id) ?? house
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
    const electricityCharge = electricityUsage * toNumber(roomHouse?.electricity_rate)
    const waterCharge = waterUsage * toNumber(roomHouse?.water_rate)
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
}

function buildTotals(roomRows, invoice) {
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
    emptyTotals(),
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

  return totals
}

function buildMonthTotals({ house, houses, rooms, readings, invoices, month }) {
  if (houses?.length) {
    const housesById = new Map(houses.map((item) => [item.id, item]))
    const aggregateHouse = buildAggregateHouse(houses)
    const rows = buildRoomRows({
      house: aggregateHouse,
      housesById,
      rooms,
      readings,
      selectedMonth: month,
      previousMonthDate: monthToDate(getPreviousMonth(month)),
    })
    return buildTotals(rows, buildAggregateInvoice({ houses, invoices, month }))
  }

  const invoice =
    invoices.find((item) => item.house_id === house.id && item.month === monthToDate(month)) ??
    createEmptyInvoice(house.id, month)
  const rows = buildRoomRows({
    house,
    rooms,
    readings,
    selectedMonth: month,
    previousMonthDate: monthToDate(getPreviousMonth(month)),
  })
  return buildTotals(rows, invoice)
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
    electricityCost: 0,
    waterCost: 0,
    otherCost: 0,
    totalCost: 0,
    difference: 0,
    differencePerResident: 0,
    utilityDifference: 0,
    invoiceElectricityKwh: 0,
    invoiceWaterM3: 0,
    electricityVariancePercent: 0,
    waterVariancePercent: 0,
  }
}

function emptyBusiness() {
  return {
    market: emptyMarketStats(),
    roomComparisons: [],
    recommendations: [],
    electricityProfit: 0,
    waterProfit: 0,
    serviceProfit: 0,
    profitMarginPercent: 0,
    houseAverageRent: 0,
    lowPricedRoomCount: 0,
    highPricedRoomCount: 0,
    actionAlertCount: 0,
    previousElectricityProfit: 0,
    previousWaterProfit: 0,
    previousServiceProfit: 0,
    actualElectricUnitCost: 0,
    actualWaterUnitCost: 0,
  }
}

function emptyMarketStats() {
  return {
    count: 0,
    averageRent: 0,
    minRent: 0,
    maxRent: 0,
    averageElectricPrice: 0,
    averageWaterPrice: 0,
    averageServiceFee: 0,
    averageInternetFee: 0,
  }
}

function buildBusinessAnalysis({ marketSurveys, roomRows, totals, previousTotals, house }) {
  const market = calculateMarketStats(marketSurveys)
  const roomsWithRent = roomRows.filter((row) => toNumber(row.room.monthly_rent) > 0)
  const houseAverageRent = average(roomsWithRent.map((row) => row.room.monthly_rent))
  const activeRevenuePerResident = roomRows
    .filter((row) => toNumber(row.room.resident_count) > 0)
    .map((row) => row.totalRevenue / toNumber(row.room.resident_count))
  const averageRevenuePerResident = average(activeRevenuePerResident)
  const electricityProfit = totals.electricityRevenue - totals.electricityCost
  const waterProfit = totals.waterRevenue - totals.waterCost
  const serviceProfit = totals.serviceRevenue - totals.otherCost
  const profitMarginPercent = totals.totalRevenue > 0 ? (totals.difference / totals.totalRevenue) * 100 : 0
  const actualElectricUnitCost = totals.invoiceElectricityKwh > 0 ? totals.electricityCost / totals.invoiceElectricityKwh : 0
  const actualWaterUnitCost = totals.invoiceWaterM3 > 0 ? totals.waterCost / totals.invoiceWaterM3 : 0

  const roomComparisons = roomRows.map((row) => {
    const roomRent = toNumber(row.room.monthly_rent)
    const marketDeltaPercent = market.averageRent > 0 ? ((roomRent - market.averageRent) / market.averageRent) * 100 : 0
    const residents = toNumber(row.room.resident_count)
    const revenuePerResident = residents > 0 ? row.totalRevenue / residents : 0
    const revenuePerResidentDeltaPercent =
      averageRevenuePerResident > 0 && residents > 0
        ? ((revenuePerResident - averageRevenuePerResident) / averageRevenuePerResident) * 100
        : 0

    return {
      room: row.room,
      rent: roomRent,
      marketDeltaPercent,
      revenuePerResident,
      revenuePerResidentDeltaPercent,
      isLowMarketRent: market.averageRent > 0 && roomRent < market.averageRent * 0.9,
      isHighMarketRent: market.averageRent > 0 && roomRent > market.averageRent * 1.15,
      isLowRevenuePerResident: residents > 0 && averageRevenuePerResident > 0 && revenuePerResident < averageRevenuePerResident * 0.85,
    }
  })

  const lowPricedRoomCount = roomComparisons.filter((item) => item.isLowMarketRent).length
  const highPricedRoomCount = roomComparisons.filter((item) => item.isHighMarketRent).length
  const actionAlertCount =
    lowPricedRoomCount +
    highPricedRoomCount +
    roomComparisons.filter((item) => item.isLowRevenuePerResident).length +
    (electricityProfit < 0 ? 1 : 0) +
    (waterProfit < 0 ? 1 : 0) +
    (serviceProfit < 0 ? 1 : 0)

  const business = {
    market,
    roomComparisons,
    electricityProfit,
    waterProfit,
    serviceProfit,
    profitMarginPercent,
    houseAverageRent,
    lowPricedRoomCount,
    highPricedRoomCount,
    actionAlertCount,
    previousElectricityProfit: previousTotals.electricityRevenue - previousTotals.electricityCost,
    previousWaterProfit: previousTotals.waterRevenue - previousTotals.waterCost,
    previousServiceProfit: previousTotals.serviceRevenue - previousTotals.otherCost,
    actualElectricUnitCost,
    actualWaterUnitCost,
  }

  business.recommendations = buildRecommendations({ business, totals, roomRows, house })
  return business
}

function calculateMarketStats(marketSurveys) {
  const validSurveys = (marketSurveys ?? []).filter((survey) => toNumber(survey.monthly_rent) > 0)
  const rents = validSurveys.map((survey) => toNumber(survey.monthly_rent))
  return {
    count: validSurveys.length,
    averageRent: average(rents),
    minRent: rents.length ? Math.min(...rents) : 0,
    maxRent: rents.length ? Math.max(...rents) : 0,
    averageElectricPrice: average(validSurveys.map((survey) => survey.electric_price)),
    averageWaterPrice: average(validSurveys.map((survey) => survey.water_price)),
    averageServiceFee: average(validSurveys.map((survey) => survey.service_fee)),
    averageInternetFee: average(validSurveys.map((survey) => survey.internet_fee)),
  }
}

function average(values) {
  const numbers = values.map(toNumber).filter((value) => value > 0)
  if (!numbers.length) return 0
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
}

function percentageVariance(actual, expected) {
  if (!expected) {
    return actual ? 100 : 0
  }
  return ((actual - expected) / expected) * 100
}

function buildAlerts({ house, roomRows, invoice, totals, business }) {
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

  if (business.lowPricedRoomCount > 0) {
    alerts.push({
      level: 'warning',
      title: 'Gia thue dang thap hon thi truong',
      detail: `${business.lowPricedRoomCount} phong thap hon trung binh khao sat tren 10%.`,
    })
  }

  if (business.highPricedRoomCount > 0) {
    alerts.push({
      level: 'warning',
      title: 'Gia thue dang cao hon thi truong',
      detail: `${business.highPricedRoomCount} phong cao hon trung binh khao sat tren 15%, can kiem tra ty le trong.`,
    })
  }

  if (business.actualElectricUnitCost > 0 && toNumber(house.electricity_rate) < business.actualElectricUnitCost) {
    alerts.push({
      level: 'danger',
      title: 'Dang lo dien',
      detail: `Gia thu ${formatCurrency(house.electricity_rate)}/kWh thap hon chi phi thuc te ${formatCurrency(business.actualElectricUnitCost)}/kWh.`,
    })
  } else if (business.electricityProfit < 0) {
    alerts.push({
      level: 'danger',
      title: 'Dang lo dien',
      detail: `Tien dien dang am ${formatCurrency(Math.abs(business.electricityProfit))}.`,
    })
  }

  if (business.actualWaterUnitCost > 0 && toNumber(house.water_rate) < business.actualWaterUnitCost) {
    alerts.push({
      level: 'danger',
      title: 'Dang lo nuoc',
      detail: `Gia thu ${formatCurrency(house.water_rate)}/m3 thap hon chi phi thuc te ${formatCurrency(business.actualWaterUnitCost)}/m3.`,
    })
  } else if (business.waterProfit < 0) {
    alerts.push({
      level: 'danger',
      title: 'Dang lo nuoc',
      detail: `Tien nuoc dang am ${formatCurrency(Math.abs(business.waterProfit))}.`,
    })
  }

  if (business.serviceProfit < 0) {
    alerts.push({
      level: 'warning',
      title: 'Phi dich vu chua du bu chi phi',
      detail: `Chi phi khac vuot phi dich vu thu ${formatCurrency(Math.abs(business.serviceProfit))}.`,
    })
  }

  if (business.electricityProfit < 0 && business.previousElectricityProfit < 0) {
    alerts.push({ level: 'danger', title: 'Xu huong lo dien lien tiep', detail: 'Dien dang lo 2 thang lien tiep.' })
  }
  if (business.waterProfit < 0 && business.previousWaterProfit < 0) {
    alerts.push({ level: 'danger', title: 'Xu huong lo nuoc lien tiep', detail: 'Nuoc dang lo 2 thang lien tiep.' })
  }
  if (business.serviceProfit < 0 && business.previousServiceProfit < 0) {
    alerts.push({ level: 'warning', title: 'Xu huong lo phi lien tiep', detail: 'Phi dich vu khong du bu chi phi 2 thang lien tiep.' })
  }

  for (const comparison of business.roomComparisons) {
    if (comparison.isLowRevenuePerResident) {
      alerts.push({
        level: 'warning',
        title: `${comparison.room.name}: phong dinh gia thap`,
        detail: 'Doanh thu tren moi nguoi thap hon trung binh nha tren 15%.',
      })
    }
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
        title: `${row.room.name}: dien/ng??i cao`,
        detail: `${formatNumber(row.electricityUsage / residents)} kWh moi nguoi.`,
      })
    }

    if (residents > 0 && row.waterUsage / residents > 8) {
      alerts.push({
        level: 'warning',
        title: `${row.room.name}: nuoc/ng??i cao`,
        detail: `${formatNumber(row.waterUsage / residents)} m3 moi nguoi.`,
      })
    }

    if (row.previousElectricityUsage && row.electricityUsage > row.previousElectricityUsage * 1.3) {
      alerts.push({
        level: 'warning',
        title: `${row.room.name}: tieu thu dien bat thuong`,
        detail: `Tu ${formatNumber(row.previousElectricityUsage)} len ${formatNumber(
          row.electricityUsage,
        )} kWh so voi thang truoc.`,
      })
    }

    if (row.previousWaterUsage && row.waterUsage > row.previousWaterUsage * 1.3) {
      alerts.push({
        level: 'warning',
        title: `${row.room.name}: tieu thu nuoc bat thuong`,
        detail: `Tu ${formatNumber(row.previousWaterUsage)} len ${formatNumber(row.waterUsage)} m3.`,
      })
    }
  }

  if (!alerts.length) {
    alerts.push({
      level: 'success',
      title: 'Khong co bat thuong lon',
      detail: 'San luong, dong tien va dinh gia nam trong nguong canh bao cua nha.',
    })
  }

  return alerts
}

function buildRecommendations({ business, totals, roomRows, house }) {
  const recommendations = []

  if (!business.market.count) {
    recommendations.push('Nhap them khao sat thi truong de co mat bang gia thu? khu vuc va canh bao dinh gia chinh xac hon.')
  }

  if (business.lowPricedRoomCount > 0 && business.market.averageRent > 0) {
    recommendations.push(`Xem tang gia cac phong dang thap hon thi truong, muc tham chieu hien tai khoang ${formatCurrency(business.market.averageRent)}/thang.`)
  }

  if (business.highPricedRoomCount > 0) {
    recommendations.push('Kiem tra ty le phong trong va chat luong phong truoc khi giu muc gia cao hon thi truong.')
  }

  if (business.waterProfit < 0) {
    recommendations.push('Dieu chinh phi nuoc hoac kiem tra lai hoa don nuoc tong vi tien nuoc dang am.')
  }

  if (business.serviceProfit < 0) {
    recommendations.push('Xem tang phi dich vu/phu phi mang-ve sinh neu chi phi khac vuot tong phi dich vu thu duoc.')
  }

  if (business.electricityProfit < 0) {
    recommendations.push('Canh bao lo dien: kiem tra don gia, cong to va quy dinh dia phuong; khong tu dong tang gia dien neu co rui ro phap ly.')
  }

  const abnormalRooms = roomRows.filter(
    (row) =>
      (row.previousElectricityUsage && row.electricityUsage > row.previousElectricityUsage * 1.3) ||
      (row.previousWaterUsage && row.waterUsage > row.previousWaterUsage * 1.3),
  )
  if (abnormalRooms.length) {
    recommendations.push(`Kiem tra phong tieu thu bat thuong: ${abnormalRooms.map((row) => row.room.name).join(', ')}.`)
  }

  const threshold = toNumber(house.alert_variance_percent || 8)
  if (
    (Math.abs(totals.electricityVariancePercent) > threshold && totals.invoiceElectricityKwh > 0) ||
    (Math.abs(totals.waterVariancePercent) > threshold && totals.invoiceWaterM3 > 0)
  ) {
    recommendations.push('Kiem tra lai dong ho tong va cach ghi chi so neu tong phong lech xa hoa don nha nuoc.')
  }

  if (!recommendations.length) {
    recommendations.push('Gia phong, phi dich vu va chi phi van hanh dang on dinh. Tiep tuc cap nhat khao sat moi moi thang.')
  }

  return recommendations
}
