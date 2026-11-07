// 데이터 저장소 (localStorage). 모든 데이터는 이 기기에만 저장됩니다.
const KEY = 'daily_money_v1';

export const DEFAULT_CATEGORIES = [
  { id: 'food', name: '식비', icon: '🍚' },
  { id: 'cafe', name: '카페', icon: '☕' },
  { id: 'transport', name: '교통', icon: '🚌' },
  { id: 'living', name: '생활', icon: '🛒' },
  { id: 'fun', name: '여가', icon: '🎉' },
  { id: 'etc', name: '기타', icon: '📦' },
];

function defaultState() {
  return {
    version: 1,
    settings: {
      monthlyGoal: 800000,
      monthStartDay: 1,
      categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
      favorites: [], // { id, category, amount, label }
    },
    expenses: [], // { id, date: 'YYYY-MM-DD', amount, category, memo, createdAt }
    noSpendDays: [], // ['YYYY-MM-DD']
  };
}

export function normalize(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const settings = { ...base.settings, ...(raw.settings || {}) };
  if (!Array.isArray(settings.categories) || settings.categories.length === 0) {
    settings.categories = base.settings.categories;
  }
  if (!Array.isArray(settings.favorites)) settings.favorites = [];
  settings.monthlyGoal = Math.max(0, Math.round(Number(settings.monthlyGoal) || 0));
  settings.monthStartDay = Math.min(28, Math.max(1, Math.round(Number(settings.monthStartDay) || 1)));
  return {
    version: 1,
    settings,
    expenses: Array.isArray(raw.expenses)
      ? raw.expenses.filter((e) => e && e.id && e.date && Number.isFinite(Number(e.amount)))
          .map((e) => ({ memo: '', ...e, amount: Math.round(Number(e.amount)) }))
      : [],
    noSpendDays: Array.isArray(raw.noSpendDays) ? raw.noSpendDays.filter((d) => typeof d === 'string') : [],
  };
}

export function load() {
  try {
    const text = localStorage.getItem(KEY);
    return normalize(text ? JSON.parse(text) : null);
  } catch {
    return defaultState();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function resetState() {
  return defaultState();
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
