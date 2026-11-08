// 예산 계산: 기간, 일일 가용액, 페이스, 무지출 스트릭

export function toKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

function daysBetween(aKey, bKey) {
  // b - a (일 단위, 서머타임 영향 없도록 UTC로 계산)
  const [ay, am, ad] = aKey.split('-').map(Number);
  const [by, bm, bd] = bKey.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// 예산 기간(월 시작일 기준). startDay는 1~28.
export function getPeriod(todayKey, startDay = 1) {
  const t = parseKey(todayKey);
  let y = t.getFullYear();
  let m = t.getMonth();
  if (t.getDate() < startDay) m -= 1;
  const start = new Date(y, m, startDay);
  const end = new Date(y, m + 1, startDay - 1);
  const startKey = toKey(start);
  const endKey = toKey(end);
  const totalDays = daysBetween(startKey, endKey) + 1;
  const daysElapsed = daysBetween(startKey, todayKey) + 1; // 오늘 포함
  return {
    startKey,
    endKey,
    totalDays,
    daysElapsed,
    daysLeft: totalDays - daysElapsed + 1, // 오늘 포함
    // 표시용: 기간 대부분이 속한 달
    label: `${end.getMonth() + 1}월`,
  };
}

export function summarize(state, todayKey) {
  const { monthlyGoal, monthStartDay } = state.settings;
  const period = getPeriod(todayKey, monthStartDay);
  const inPeriod = state.expenses.filter((e) => e.date >= period.startKey && e.date <= period.endKey);

  let spentBeforeToday = 0;
  let spentToday = 0;
  let spentTotal = 0;
  const byCategory = {};
  for (const e of inPeriod) {
    spentTotal += e.amount;
    if (e.date < todayKey) spentBeforeToday += e.amount;
    if (e.date === todayKey) spentToday += e.amount;
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
  }

  const remainingStartOfToday = monthlyGoal - spentBeforeToday;
  const todayAllowance = Math.floor(remainingStartOfToday / period.daysLeft);
  const todayLeft = todayAllowance - spentToday;
  const remaining = monthlyGoal - spentTotal;
  const projected = Math.round((spentTotal / period.daysElapsed) * period.totalDays);

  return {
    period,
    expenses: inPeriod,
    spentToday,
    spentTotal,
    todayAllowance,
    todayLeft,
    remaining,
    projected,
    usedRatio: monthlyGoal > 0 ? spentTotal / monthlyGoal : 0,
    byCategory,
  };
}

// 기록을 시작한 날 (가장 이른 지출일). 그 전 날짜는 무지출로 보지 않습니다.
export function trackingStart(state) {
  let start = null;
  for (const e of state.expenses) if (!start || e.date < start) start = e.date;
  for (const d of state.noSpendDays) if (!start || d < start) start = d;
  return start;
}

// 지난 날짜(오늘 제외) 중 지출 기록이 하나도 없는 날 = 무지출
export function noSpendChecker(state, todayKey) {
  const start = trackingStart(state);
  const spent = new Set(state.expenses.map((e) => e.date));
  return (k) => !!start && k >= start && k < todayKey && !spent.has(k);
}

// 어제부터 거슬러 올라가며 연속된 무지출 일수
export function noSpendStreak(state, todayKey) {
  const isNoSpend = noSpendChecker(state, todayKey);
  let k = addDays(todayKey, -1);
  let n = 0;
  while (isNoSpend(k)) {
    n += 1;
    k = addDays(k, -1);
  }
  return n;
}
