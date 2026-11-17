// 일정 저장소
// 지금은 이 브라우저의 localStorage에 저장한다.
// 가족이 여러 기기에서 같이 보려면 이 파일만 서버 저장 방식으로 바꾸면 된다.

const KEY = "familySchedule.events.v1";

const MEMBERS = [
  { id: "family", name: "가족" },
  { id: "dad", name: "아빠" },
  { id: "mom", name: "엄마" },
  { id: "suhyun", name: "수현" },
];

function loadEvents() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveEvents(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** 일정 추가 또는 수정. 저장된 전체 목록을 돌려준다. */
function upsertEvent(list, event) {
  const next = event.id
    ? list.map((e) => (e.id === event.id ? { ...e, ...event } : e))
    : [...list, { ...event, id: newId() }];
  saveEvents(next);
  return next;
}

function deleteEvent(list, id) {
  const next = list.filter((e) => e.id !== id);
  saveEvents(next);
  return next;
}
