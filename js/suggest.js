// 최근 기록에서 자주 쓰는 (카테고리, 금액) 조합을 추천합니다.
// 지금 시간대(±2시간)에 기록된 조합에 가중치를 줍니다.
import { addDays } from './budget.js';

export function suggestions(state, todayKey, now = new Date(), limit = 4) {
  const since = addDays(todayKey, -60);
  const hour = now.getHours();
  const favKeys = new Set(state.settings.favorites.map((f) => `${f.category}|${f.amount}`));
  const validCats = new Set(state.settings.categories.map((c) => c.id));
  const scores = new Map();

  for (const e of state.expenses) {
    if (e.date < since || !validCats.has(e.category)) continue;
    const key = `${e.category}|${e.amount}`;
    if (favKeys.has(key)) continue;
    const h = new Date(e.createdAt || 0).getHours();
    const diff = Math.min(Math.abs(h - hour), 24 - Math.abs(h - hour));
    const s = scores.get(key) || { category: e.category, amount: e.amount, count: 0, score: 0, memo: '' };
    s.count += 1;
    s.score += 1 + (diff <= 2 ? 2 : 0);
    if (e.memo) s.memo = e.memo;
    scores.set(key, s);
  }

  return [...scores.values()]
    .filter((s) => s.count >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
