import { load, save, uid, normalize, resetState } from './store.js';
import { toKey, parseKey, summarize, noSpendStreak } from './budget.js';
import { suggestions } from './suggest.js';

const MAX_DIGITS = 9; // 최대 999,999,999원
const WEEK = '일월화수목금토';

let state = load();
const ui = {
  tab: 'today',
  amount: '',
  date: toKey(new Date()),
  memo: '',
  showMemo: false,
  editingId: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');

// ---------- 유틸 ----------
const won = (n) => '₩' + Math.abs(Math.round(n)).toLocaleString('ko-KR');
const signedWon = (n) => (n < 0 ? '-' : '') + won(n);
const today = () => toKey(new Date());
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function dayLabel(key) {
  const d = parseKey(key);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})`;
}

function cat(id) {
  return state.settings.categories.find((c) => c.id === id) || { id, name: '삭제된 카테고리', icon: '❔' };
}

function persist() {
  if (!save(state)) toast('저장 공간이 부족해 저장하지 못했어요');
}

function vibrate(ms = 12) {
  try { navigator.vibrate?.(ms); } catch { /* 지원 안 함 */ }
}

// ---------- 토스트 (되돌리기) ----------
let toastTimer = null;
function toast(message, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(message)}</span>${undo ? '<button type="button" data-action="undo">되돌리기</button>' : ''}`;
  el.classList.add('show');
  toast.undo = undo || null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    toast.undo = null;
  }, 4000);
}

// ---------- 지출 조작 ----------
function addExpense({ amount, category, memo = '', date = ui.date }) {
  const e = { id: uid(), date, amount, category, memo, createdAt: Date.now() };
  state.expenses.push(e);
  state.noSpendDays = state.noSpendDays.filter((d) => d !== date);
  persist();
  vibrate();
  toast(`${cat(category).icon} ${won(amount)} 기록했어요`, () => {
    state.expenses = state.expenses.filter((x) => x.id !== e.id);
    persist();
    render();
  });
}

function updateExpense(id, patch) {
  const e = state.expenses.find((x) => x.id === id);
  if (!e) return;
  const before = { ...e };
  Object.assign(e, patch);
  persist();
  vibrate();
  toast('수정했어요', () => {
    Object.assign(e, before);
    persist();
    render();
  });
}

function deleteExpense(id) {
  const idx = state.expenses.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const [removed] = state.expenses.splice(idx, 1);
  persist();
  vibrate(20);
  toast('삭제했어요', () => {
    state.expenses.push(removed);
    persist();
    render();
  });
}

function resetEntry() {
  ui.amount = '';
  ui.memo = '';
  ui.showMemo = false;
  ui.editingId = null;
}

function startEdit(id) {
  const e = state.expenses.find((x) => x.id === id);
  if (!e) return;
  ui.tab = 'today';
  ui.editingId = id;
  ui.amount = String(e.amount);
  ui.date = e.date;
  ui.memo = e.memo || '';
  ui.showMemo = !!e.memo;
  render();
  window.scrollTo({ top: $('.entry')?.offsetTop - 8 || 0, behavior: 'smooth' });
}

// ---------- 렌더링 ----------
function render() {
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.tab));
  if (ui.tab === 'today') view.innerHTML = renderToday();
  else if (ui.tab === 'history') view.innerHTML = renderHistory();
  else view.innerHTML = renderSettings();
}

function renderSummary(s) {
  const goal = state.settings.monthlyGoal;
  const pct = Math.min(100, Math.round(s.usedRatio * 100));
  const over = s.todayLeft < 0;
  let pace = '';
  if (goal > 0 && s.period.daysElapsed >= 3 && s.spentTotal > 0) {
    const diff = goal - s.projected;
    pace = diff < 0
      ? `<p class="pace warn">⚠️ 이 속도면 월말에 ${won(diff)} 초과 예상</p>`
      : `<p class="pace good">👍 이 속도면 월말에 ${won(diff)} 남아요</p>`;
  }
  const streak = noSpendStreak(state, today());
  return `
  <section class="summary card">
    <div class="sum-row muted"><span class="period">${s.period.label} · 남은 ${s.period.daysLeft}일</span>
      ${streak > 0 ? `<span class="streak">🔥 무지출 ${streak}일</span>` : ''}</div>
    <div class="sum-row main">
      <span class="label">${over ? '오늘 예산 초과' : '오늘 쓸 수 있는 돈'}</span>
      <span class="big ${over ? 'neg' : ''}">${over ? '-' : ''}${won(s.todayLeft)}</span>
    </div>
    <div class="bar ${s.usedRatio > 1 ? 'over' : ''}" role="progressbar" aria-label="이번 달 사용률" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
      <span style="width:${pct}%"></span>
    </div>
    <div class="sum-row muted sub"><span>이번 달 ${won(s.spentTotal)} / ${won(goal)}</span><span>${Math.round(s.usedRatio * 100)}%</span></div>
    ${pace}
  </section>`;
}

function renderChips() {
  const favs = state.settings.favorites.map((f) => ({ ...f, fav: true }));
  const recs = suggestions(state, today(), new Date(), Math.max(0, 6 - favs.length));
  const all = [...favs, ...recs];
  if (all.length === 0) return '';
  return `<div class="chips">${all
    .map((c) => `<button type="button" class="chip quick" data-action="quick" data-cat="${esc(c.category)}" data-amount="${c.amount}" data-memo="${esc(c.label || c.memo || '')}">
        ${c.fav ? '⭐' : ''}${cat(c.category).icon} ${esc(c.label || c.memo || cat(c.category).name)} <b>${c.amount.toLocaleString('ko-KR')}</b>
      </button>`)
    .join('')}</div>`;
}

function renderEntry() {
  const editing = ui.editingId ? state.expenses.find((x) => x.id === ui.editingId) : null;
  const isToday = ui.date === today();
  const cats = state.settings.categories
    .map((c) => `<button type="button" class="cat ${editing && editing.category === c.id ? 'selected' : ''}" data-action="save" data-cat="${esc(c.id)}">
        <span class="ico">${esc(c.icon)}</span><span>${esc(c.name)}</span></button>`)
    .join('');
  const keys = ['1', '2', '3', '+1000', '4', '5', '6', '+5000', '7', '8', '9', '+10000', '00', '0', 'back', 'clear'];
  const keyLabel = { '+1000': '+1천', '+5000': '+5천', '+10000': '+1만', back: '⌫', clear: 'C' };
  return `
  <section class="entry card ${editing ? 'editing' : ''}">
    ${editing ? `<div class="edit-bar"><span>✏️ 수정 중</span>
      <button type="button" data-action="fav-from-edit">⭐ 즐겨찾기</button>
      <button type="button" data-action="delete-editing" class="danger">🗑 삭제</button>
      <button type="button" data-action="cancel-edit">취소</button></div>` : ''}
    <output id="amount" class="amount ${ui.amount ? '' : 'empty'}">${ui.amount ? won(Number(ui.amount)) : '₩0'}</output>
    <div class="meta">
      <button type="button" class="chip ${isToday ? '' : 'accent'}" data-action="pick-date">📅 ${isToday ? '오늘' : dayLabel(ui.date)}</button>
      <input type="date" id="date-input" class="visually-hidden" value="${ui.date}" max="${today()}" tabindex="-1" aria-label="날짜 선택">
      <button type="button" class="chip ${ui.memo ? 'accent' : ''}" data-action="toggle-memo">✏️ ${ui.memo ? esc(ui.memo) : '메모'}</button>
    </div>
    ${ui.showMemo ? `<input id="memo" class="memo" type="text" maxlength="40" placeholder="메모 (예: 점심 김밥)" value="${esc(ui.memo)}" enterkeyhint="done">` : ''}
    ${editing ? '' : renderChips()}
    <p class="cat-title">${editing ? '카테고리를 누르면 수정이 저장돼요' : '금액 입력 후 카테고리를 누르면 저장돼요'}</p>
    <div class="cats">${cats}</div>
    <div class="keypad">${keys
      .map((k) => `<button type="button" class="key ${k.startsWith('+') ? 'inc' : ''} ${k === 'clear' ? 'muted' : ''}" data-key="${k}" aria-label="${keyLabel[k] || k}">${keyLabel[k] || k}</button>`)
      .join('')}</div>
  </section>`;
}

function renderItems(list) {
  return list
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map((e) => {
      const c = cat(e.category);
      return `<li class="item" data-id="${esc(e.id)}">
        <div class="item-inner">
          <span class="ico">${esc(c.icon)}</span>
          <span class="desc"><b>${esc(e.memo || c.name)}</b>${e.memo ? `<small>${esc(c.name)}</small>` : ''}</span>
          <span class="amt">${won(e.amount)}</span>
        </div>
        <div class="item-del">삭제</div>
      </li>`;
    })
    .join('');
}

function renderDayList() {
  const list = state.expenses.filter((e) => e.date === ui.date);
  const total = list.reduce((s, e) => s + e.amount, 0);
  const isToday = ui.date === today();
  const marked = state.noSpendDays.includes(ui.date);
  return `
  <section class="card">
    <div class="list-head"><h2>${isToday ? '오늘' : dayLabel(ui.date)} 내역</h2><span>${total ? '-' + won(total) : ''}</span></div>
    ${list.length
      ? `<ul class="items">${renderItems(list)}</ul><p class="hint">항목을 누르면 수정·⭐즐겨찾기, 왼쪽으로 밀면 삭제</p>`
      : `<button type="button" class="nospend ${marked ? 'on' : ''}" data-action="nospend">${marked ? '✅ 무지출 데이 완료!' : '🙌 오늘은 지출 없음'}</button>`}
  </section>`;
}

function renderToday() {
  const s = summarize(state, today());
  return renderSummary(s) + renderEntry() + renderDayList();
}

function renderHistory() {
  const s = summarize(state, today());
  const cats = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]);
  const max = cats[0]?.[1] || 1;
  const byDate = {};
  for (const e of s.expenses) (byDate[e.date] ||= []).push(e);
  const dates = Object.keys(byDate).sort().reverse();
  const allowance = state.settings.monthlyGoal / s.period.totalDays;

  return `
  <section class="card">
    <div class="list-head"><h2>${s.period.label} 카테고리</h2><span>-${won(s.spentTotal)}</span></div>
    ${cats.length ? `<ul class="bars">${cats
      .map(([id, v]) => `<li><span>${esc(cat(id).icon)} ${esc(cat(id).name)}</span>
        <div class="hbar"><span style="width:${Math.round((v / max) * 100)}%"></span></div><b>${won(v)}</b></li>`)
      .join('')}</ul>` : '<p class="hint">아직 이번 달 기록이 없어요</p>'}
  </section>
  ${dates
    .map((d) => {
      const total = byDate[d].reduce((a, e) => a + e.amount, 0);
      return `<section class="card">
        <div class="list-head"><h2>${dayLabel(d)}</h2><span class="${total > allowance ? 'neg' : 'pos'}">-${won(total)}</span></div>
        <ul class="items">${renderItems(byDate[d])}</ul>
      </section>`;
    })
    .join('')}`;
}

function renderSettings() {
  const st = state.settings;
  const days = Array.from({ length: 28 }, (_, i) => i + 1)
    .map((d) => `<option value="${d}" ${d === st.monthStartDay ? 'selected' : ''}>매월 ${d}일</option>`)
    .join('');
  return `
  <section class="card form">
    <h2>화면</h2>
    <div class="seg" role="radiogroup" aria-label="화면 모드">${[['auto', '📱 자동'], ['light', '☀️ 라이트'], ['dark', '🌙 다크']]
      .map(([v, l]) => `<button type="button" role="radio" aria-checked="${st.theme === v}" class="${st.theme === v ? 'on' : ''}" data-action="theme" data-theme="${v}">${l}</button>`)
      .join('')}</div>
    <p class="hint">자동은 휴대폰의 다크 모드 설정을 따라가요</p>
  </section>
  <section class="card form">
    <h2>예산</h2>
    <label>월 목표 지출
      <input id="goal" type="text" inputmode="numeric" value="${st.monthlyGoal.toLocaleString('ko-KR')}">
    </label>
    <label>한 달 시작일 (월급날 등)
      <select id="start-day">${days}</select>
    </label>
  </section>
  <section class="card form">
    <h2>카테고리</h2>
    <ul class="cat-edit">${st.categories
      .map((c, i) => `<li data-i="${i}">
        <input class="icon-in" data-field="icon" value="${esc(c.icon)}" aria-label="아이콘">
        <input data-field="name" value="${esc(c.name)}" aria-label="이름" maxlength="8">
        <button type="button" data-action="cat-up" ${i === 0 ? 'disabled' : ''} aria-label="위로">↑</button>
        <button type="button" data-action="cat-del" class="danger" ${st.categories.length <= 1 ? 'disabled' : ''} aria-label="삭제">✕</button>
      </li>`)
      .join('')}</ul>
    <button type="button" class="btn" data-action="cat-add">＋ 카테고리 추가</button>
  </section>
  <section class="card form">
    <h2>⭐ 즐겨찾기</h2>
    ${st.favorites.length ? `<ul class="fav-edit">${st.favorites
      .map((f) => `<li><span>${esc(cat(f.category).icon)} ${esc(f.label || cat(f.category).name)} · ${won(f.amount)}</span>
        <button type="button" data-action="fav-del" data-id="${esc(f.id)}" class="danger" aria-label="삭제">✕</button></li>`)
      .join('')}</ul>` : '<p class="hint">내역에서 항목을 눌러 수정 화면의 ⭐ 버튼으로 추가할 수 있어요</p>'}
  </section>
  <section class="card form">
    <h2>백업</h2>
    <div class="row">
      <button type="button" class="btn" data-action="export-json">JSON 백업</button>
      <button type="button" class="btn" data-action="export-csv">CSV 내보내기</button>
    </div>
    <label class="btn file">백업 파일 불러오기<input id="import" type="file" accept="application/json,.json" class="visually-hidden"></label>
    <button type="button" class="btn danger" data-action="reset">모든 데이터 삭제</button>
    <p class="hint">데이터는 이 기기의 브라우저에만 저장돼요. 기기를 바꾸기 전에 백업해 주세요.</p>
  </section>`;
}

// ---------- 키패드 ----------
function pressKey(k) {
  let a = ui.amount;
  if (k === 'back') a = a.slice(0, -1);
  else if (k === 'clear') a = '';
  else if (k.startsWith('+')) a = String(Math.min(10 ** MAX_DIGITS - 1, Number(a || 0) + Number(k.slice(1))));
  else if (a.length + k.length <= MAX_DIGITS) a = (a + k).replace(/^0+/, '');
  ui.amount = a;
  const out = $('#amount');
  if (out) {
    out.textContent = a ? won(Number(a)) : '₩0';
    out.classList.toggle('empty', !a);
  }
  vibrate(6);
}

function shakeAmount() {
  const out = $('#amount');
  if (!out) return;
  out.classList.remove('shake');
  void out.offsetWidth;
  out.classList.add('shake');
  toast('금액을 먼저 입력해 주세요');
}

// ---------- 이벤트 ----------
document.addEventListener('click', (ev) => {
  const t = ev.target.closest('button, [data-tab]');
  if (!t) return;

  if (t.dataset.tab) {
    ui.tab = t.dataset.tab;
    if (ui.tab !== 'today') resetEntry();
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (t.dataset.key) return pressKey(t.dataset.key);

  const action = t.dataset.action;
  switch (action) {
    case 'save': {
      const amount = Number(ui.amount);
      if (!amount) return shakeAmount();
      if (ui.editingId) {
        updateExpense(ui.editingId, { amount, category: t.dataset.cat, memo: ui.memo.trim(), date: ui.date });
      } else {
        addExpense({ amount, category: t.dataset.cat, memo: ui.memo.trim() });
      }
      resetEntry();
      render();
      break;
    }
    case 'quick':
      addExpense({ amount: Number(t.dataset.amount), category: t.dataset.cat, memo: t.dataset.memo || '' });
      render();
      break;
    case 'undo':
      toast.undo?.();
      toast.undo = null;
      $('#toast').classList.remove('show');
      break;
    case 'pick-date': {
      const input = $('#date-input');
      try { input.showPicker(); } catch { input.focus(); input.click(); }
      break;
    }
    case 'toggle-memo':
      ui.showMemo = !ui.showMemo;
      render();
      if (ui.showMemo) $('#memo')?.focus();
      break;
    case 'cancel-edit':
      resetEntry();
      ui.date = today();
      render();
      break;
    case 'delete-editing':
      deleteExpense(ui.editingId);
      resetEntry();
      render();
      break;
    case 'fav-from-edit': {
      const e = state.expenses.find((x) => x.id === ui.editingId);
      if (!e) break;
      const amount = Number(ui.amount) || e.amount;
      const exists = state.settings.favorites.some((f) => f.category === e.category && f.amount === amount);
      if (!exists) {
        state.settings.favorites.push({ id: uid(), category: e.category, amount, label: ui.memo.trim() || e.memo || '' });
        persist();
      }
      toast(exists ? '이미 즐겨찾기에 있어요' : '⭐ 즐겨찾기에 추가했어요');
      resetEntry();
      ui.date = today();
      render();
      break;
    }
    case 'nospend': {
      const d = ui.date;
      const marked = state.noSpendDays.includes(d);
      state.noSpendDays = marked ? state.noSpendDays.filter((x) => x !== d) : [...state.noSpendDays, d];
      persist();
      vibrate(30);
      if (!marked) toast('🙌 무지출 데이! 잘하고 있어요');
      render();
      break;
    }
    case 'theme':
      state.settings.theme = t.dataset.theme;
      persist();
      applyTheme();
      render();
      break;
    case 'cat-add':
      state.settings.categories.push({ id: uid(), name: '새 항목', icon: '🏷️' });
      persist();
      render();
      break;
    case 'cat-up': {
      const i = Number(t.closest('li').dataset.i);
      const c = state.settings.categories;
      [c[i - 1], c[i]] = [c[i], c[i - 1]];
      persist();
      render();
      break;
    }
    case 'cat-del': {
      const i = Number(t.closest('li').dataset.i);
      const c = state.settings.categories[i];
      const used = state.expenses.some((e) => e.category === c.id);
      if (used && !confirm(`'${c.name}'에 기록된 내역이 있어요. 카테고리를 삭제할까요? (내역은 남아요)`)) break;
      state.settings.categories.splice(i, 1);
      state.settings.favorites = state.settings.favorites.filter((f) => f.category !== c.id);
      persist();
      render();
      break;
    }
    case 'fav-del':
      state.settings.favorites = state.settings.favorites.filter((f) => f.id !== t.dataset.id);
      persist();
      render();
      break;
    case 'export-json':
      download(`daily-money-${today()}.json`, JSON.stringify(state, null, 2), 'application/json');
      break;
    case 'export-csv': {
      const rows = [['날짜', '카테고리', '금액', '메모']];
      for (const e of [...state.expenses].sort((a, b) => a.date.localeCompare(b.date))) {
        rows.push([e.date, cat(e.category).name, e.amount, e.memo || '']);
      }
      const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
      download(`daily-money-${today()}.csv`, '﻿' + csv, 'text/csv');
      break;
    }
    case 'reset':
      if (confirm('모든 지출 기록과 설정을 삭제할까요? 되돌릴 수 없어요.')) {
        state = resetState();
        persist();
        applyTheme();
        resetEntry();
        render();
        toast('초기화했어요');
      }
      break;
  }
});

document.addEventListener('input', (ev) => {
  if (ev.target.id === 'memo') ui.memo = ev.target.value;
});

document.addEventListener('keydown', (ev) => {
  if (ev.target.id === 'memo' && ev.key === 'Enter') ev.target.blur();
});

document.addEventListener('change', async (ev) => {
  const t = ev.target;
  if (t.id === 'date-input') {
    if (t.value && t.value <= today()) ui.date = t.value;
    render();
  } else if (t.id === 'goal') {
    state.settings.monthlyGoal = Number(t.value.replace(/\D/g, '')) || 0;
    t.value = state.settings.monthlyGoal.toLocaleString('ko-KR');
    persist();
    toast('월 목표를 저장했어요');
  } else if (t.id === 'start-day') {
    state.settings.monthStartDay = Number(t.value);
    persist();
    toast('시작일을 저장했어요');
  } else if (t.dataset.field) {
    const i = Number(t.closest('li').dataset.i);
    const v = t.value.trim();
    if (v) state.settings.categories[i][t.dataset.field] = v;
    persist();
  } else if (t.id === 'import' && t.files?.[0]) {
    try {
      const data = normalize(JSON.parse(await t.files[0].text()));
      if (!confirm(`지출 ${data.expenses.length}건을 불러와 현재 데이터를 덮어쓸까요?`)) return;
      state = data;
      persist();
      applyTheme();
      render();
      toast('백업을 불러왔어요');
    } catch {
      toast('백업 파일을 읽지 못했어요');
    }
  }
});

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- 스와이프 삭제 / 탭 수정 ----------
let swipe = null;
view.addEventListener('pointerdown', (ev) => {
  const li = ev.target.closest('.item');
  if (!li) return;
  swipe = { li, inner: $('.item-inner', li), x: ev.clientX, y: ev.clientY, dx: 0, moved: false, id: ev.pointerId };
});
view.addEventListener('pointermove', (ev) => {
  if (!swipe || ev.pointerId !== swipe.id) return;
  const dx = ev.clientX - swipe.x;
  const dy = ev.clientY - swipe.y;
  if (!swipe.moved && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; }
  if (Math.abs(dx) > 8) swipe.moved = true;
  if (swipe.moved) {
    swipe.dx = Math.min(0, dx);
    swipe.inner.style.transform = `translateX(${swipe.dx}px)`;
    swipe.li.classList.toggle('arm', swipe.dx < -80);
  }
});
function endSwipe(ev) {
  if (!swipe || (ev && ev.pointerId !== swipe.id)) return;
  const s = swipe;
  swipe = null;
  if (!s.moved) {
    if (ev?.type === 'pointerup') startEdit(s.li.dataset.id);
    return;
  }
  if (s.dx < -80) {
    s.inner.style.transform = 'translateX(-100%)';
    setTimeout(() => { deleteExpense(s.li.dataset.id); render(); }, 150);
  } else {
    s.inner.style.transform = '';
    s.li.classList.remove('arm');
  }
}
view.addEventListener('pointerup', endSwipe);
view.addEventListener('pointercancel', endSwipe);

// 날짜가 바뀐 뒤 앱으로 돌아오면 오늘 기준으로 다시 계산
let lastDay = today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && today() !== lastDay) {
    if (ui.date === lastDay && !ui.editingId) ui.date = today();
    lastDay = today();
    render();
  }
});

// ---------- 화면 모드 ----------
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const theme = state.settings.theme;
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
  const dark = theme === 'dark' || (theme === 'auto' && darkQuery.matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b0f14' : '#f4f6f8');
}
darkQuery.addEventListener?.('change', applyTheme);

// ---------- 시작 ----------
const params = new URLSearchParams(location.search);
if (params.get('action') === 'add') ui.tab = 'today';
applyTheme();
render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
