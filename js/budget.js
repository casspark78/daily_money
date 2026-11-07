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

// 지출이 없고 '무지출'로 체크된 날이 연속된 일수.
// 오늘이 아직 체크되지 않았다면 어제부터 셉니다.
export function noSpendStreak(state, todayKey) {
  const spentDays = new Set(state.expenses.map((e) => e.date));
  const marked = new Set(state.noSpendDays);
  const ok = (k) => marked.has(k) && !spentDays.has(k);
  let k = ok(todayKey) ? todayKey : addDays(todayKey, -1);
  let n = 0;
  while (ok(k)) {
    n += 1;
    k = addDays(k, -1);
  }
  return n;
}
