// 백업: 공유(카톡·메일 등), 파일 저장, 백업 알림, 저장소 보호 요청
import { parseKey } from './budget.js';

export const REMIND_DAYS = 30; // 마지막 백업 후 이 일수가 지나면 알림
export const SNOOZE_DAYS = 3; // '나중에'를 누르면 이 일수 뒤 다시 알림

export function backupFileName(todayKey) {
  return `daily-money-${todayKey}.json`;
}

export function backupJson(state) {
  return JSON.stringify(state, null, 2);
}

// 이 기기에서 파일 공유(카카오톡, 메일 등으로 보내기)가 되는지
export function canShareFiles() {
  try {
    const probe = new File(['{}'], 'probe.json', { type: 'application/json' });
    return typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [probe] });
  } catch {
    return false;
  }
}

// 'shared' | 'cancelled' | 'error'
export async function shareBackup(state, todayKey) {
  try {
    const file = new File([backupJson(state)], backupFileName(todayKey), { type: 'application/json' });
    await navigator.share({ files: [file], title: 'Daily Money 백업' });
    return 'shared';
  } catch (e) {
    return e?.name === 'AbortError' ? 'cancelled' : 'error';
  }
}

// 브라우저가 저장 공간이 부족할 때 이 앱 데이터를 지우지 않도록 요청
// true: 보호됨, false: 거절됨, null: 지원 안 함
export async function requestPersist() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export function daysBetween(fromKey, toKey) {
  return Math.round((parseKey(toKey) - parseKey(fromKey)) / 86400000);
}

// 백업 알림을 띄울지. startKey는 기록을 시작한 날.
export function backupDue(settings, todayKey, startKey) {
  const ref = settings.lastBackupAt || startKey;
  if (!ref) return false;
  if (settings.backupSnoozeUntil && todayKey < settings.backupSnoozeUntil) return false;
  return daysBetween(ref, todayKey) >= REMIND_DAYS;
}
