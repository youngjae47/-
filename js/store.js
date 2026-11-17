// 저장소 (일정 · 목표)
// - Firebase 설정(js/firebase-config.js)과 가족 코드가 있으면: Firestore에 저장하고 가족 모두와 실시간 공유
// - 없으면: 이 브라우저(localStorage)에만 저장
// app.js는 Store.start / save / remove / saveGoal / removeGoal 만 사용한다.

const MEMBERS = [
  { id: "family", name: "가족" },
  { id: "dad", name: "아빠" },
  { id: "mom", name: "엄마" },
  { id: "suhyun", name: "수현" },
];

// 목표 대분류
const GOAL_CATEGORIES = [
  { id: "health", name: "건강", icon: "💪" },
  { id: "family", name: "가족 관계", icon: "👨‍👩‍👧" },
  { id: "self", name: "자아실현", icon: "🌱" },
];

const Store = (function () {
  const CODE_KEY = "familySchedule.familyCode";
  const SDK_VERSION = "10.12.2";
  const SDK_BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
  const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // 헷갈리는 글자(i, l, o, 0, 1) 제외
  const CODE_LENGTH = 24;
  const REPEATS = ["daily", "weekly", "monthly", "yearly"];

  // ---------- 저장할 모양 정리 ----------
  function cleanEvent(e) {
    const repeat = REPEATS.includes(e.repeat) ? e.repeat : "";
    return {
      title: String(e.title || "").slice(0, 40),
      member: e.member,
      start: e.start,
      end: repeat ? "" : e.end || "", // 반복 일정은 하루짜리만
      time: e.time || "",
      memo: String(e.memo || "").slice(0, 200),
      repeat,
      repeatDays: repeat === "weekly" && Array.isArray(e.repeatDays)
        ? [...new Set(e.repeatDays)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort()
        : [],
      repeatUntil: repeat ? e.repeatUntil || "" : "",
      exdates: repeat && Array.isArray(e.exdates) ? [...new Set(e.exdates)].sort().slice(-366) : [],
    };
  }

  function cleanGoal(g) {
    const progress = Math.round(Number(g.progress) || 0);
    return {
      title: String(g.title || "").slice(0, 40),
      member: g.member,
      category: g.category,
      start: g.start,
      end: g.end,
      progress: Math.min(100, Math.max(0, progress)),
      memo: String(g.memo || "").slice(0, 200),
    };
  }

  // 일정과 목표를 같은 방식으로 다룬다
  const KINDS = {
    events: { localKey: "familySchedule.events.v1", clean: cleanEvent, label: "일정" },
    goals: { localKey: "familySchedule.goals.v1", clean: cleanGoal, label: "목표" },
  };
  const data = { events: [], goals: [] };
  const listeners = { events: () => {}, goals: () => {} };
  const cols = { events: null, goals: null };
  const unsubscribes = [];

  let onStatus = () => {};
  let status = "local"; // local | need-code | connecting | online | offline | error
  let errorMessage = "";
  let db = null;

  // ---------- 브라우저 저장 도우미 ----------
  function readLS(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch {
      return fallback;
    }
  }
  function writeLS(key, value) {
    try {
      value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
    } catch {
      /* 저장 공간을 쓸 수 없는 브라우저(사생활 보호 모드 등) */
    }
  }
  function readLocal(kind) {
    try {
      const list = JSON.parse(readLS(KINDS[kind].localKey, "[]"));
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }
  function writeLocal(kind, list) {
    writeLS(KINDS[kind].localKey, JSON.stringify(list));
  }

  function setStatus(next, message = "") {
    status = next;
    errorMessage = message;
    onStatus(status, errorMessage);
  }
  function emit(kind, list) {
    data[kind] = list;
    listeners[kind](list);
  }

  // ---------- 가족 코드 ----------
  function newCode() {
    const bytes = new Uint8Array(CODE_LENGTH);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  }
  function normalizeCode(input) {
    // 초대 링크 전체를 붙여넣어도 코드만 뽑아낸다
    const text = String(input || "").trim();
    const fromLink = text.match(/family=([a-z0-9]+)/i);
    const code = (fromLink ? fromLink[1] : text).toLowerCase().replace(/[^a-z0-9]/g, "");
    return code.length >= 20 ? code : null;
  }
  function codeFromUrl() {
    const m = location.hash.match(/family=([a-z0-9]+)/i);
    if (!m) return null;
    history.replaceState(null, "", location.pathname + location.search); // 주소창에서 코드 지우기
    return normalizeCode(m[1]);
  }

  // ---------- Firebase 불러오기 ----------
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("load failed: " + src));
      document.head.append(s);
    });
  }
  async function initFirebase() {
    if (db) return db;
    if (!window.firebase) {
      await loadScript(`${SDK_BASE}/firebase-app-compat.js`);
      await loadScript(`${SDK_BASE}/firebase-firestore-compat.js`);
    }
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(FIREBASE_CONFIG);
    db = app.firestore();
    if (window.__FIRESTORE_EMULATOR__) {
      // 테스트용: 로컬 Firestore 에뮬레이터에 연결
      const [host, port] = window.__FIRESTORE_EMULATOR__.split(":");
      db.useEmulator(host, Number(port));
    }
    // 인터넷이 끊겨도 마지막 내용을 보여주고, 입력한 것은 다시 연결되면 올린다
    await db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    return db;
  }

  async function connect(code) {
    unsubscribes.splice(0).forEach((u) => u());
    setStatus("connecting");
    try {
      await initFirebase();
    } catch {
      setStatus("error", "공유 저장소에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
      return;
    }
    const family = db.collection("families").doc(code);
    Object.keys(KINDS).forEach((kind) => {
      cols[kind] = family.collection(kind);
      const unsub = cols[kind].onSnapshot(
        { includeMetadataChanges: true },
        (snap) => {
          emit(kind, snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          if (kind === "events") setStatus(snap.metadata.fromCache ? "offline" : "online");
        },
        (err) => {
          const msg =
            err.code === "permission-denied"
              ? "가족 코드가 올바르지 않거나 저장소 보안 규칙이 최신이 아니에요."
              : "공유 저장소와 연결이 끊겼어요. 새로고침해 보세요.";
          setStatus("error", msg);
        }
      );
      unsubscribes.push(unsub);
    });
  }

  // ---------- 저장 · 삭제 (공통) ----------
  function saveItem(kind, item) {
    const { clean, label } = KINDS[kind];
    const cleaned = clean(item);
    if (cols[kind]) {
      const ref = item.id ? cols[kind].doc(item.id) : cols[kind].doc();
      // 인터넷이 끊겨 있어도 바로 화면에 반영되고, 연결되면 서버에 올라간다
      ref
        .set({ ...cleaned, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
        .catch(() => setStatus("error", `${label}을(를) 저장하지 못했어요. 다시 시도해 주세요.`));
      return;
    }
    const list = readLocal(kind);
    const next = item.id
      ? list.map((x) => (x.id === item.id ? { ...cleaned, id: x.id } : x))
      : [...list, { ...cleaned, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }];
    writeLocal(kind, next);
    emit(kind, next);
  }

  function removeItem(kind, id) {
    if (cols[kind]) {
      cols[kind]
        .doc(id)
        .delete()
        .catch(() => setStatus("error", `${KINDS[kind].label}을(를) 지우지 못했어요. 다시 시도해 주세요.`));
      return;
    }
    const next = readLocal(kind).filter((x) => x.id !== id);
    writeLocal(kind, next);
    emit(kind, next);
  }

  // ---------- 바깥에서 쓰는 기능 ----------
  function start(handlers) {
    listeners.events = handlers.onEvents || listeners.events;
    listeners.goals = handlers.onGoals || listeners.goals;
    onStatus = handlers.onStatus || onStatus;

    if (!FIREBASE_CONFIG) {
      Object.keys(KINDS).forEach((kind) => emit(kind, readLocal(kind)));
      setStatus("local");
      return;
    }
    const linkCode = codeFromUrl();
    if (linkCode) writeLS(CODE_KEY, linkCode);
    const code = readLS(CODE_KEY, null);
    if (!code) {
      Object.keys(KINDS).forEach((kind) => emit(kind, []));
      setStatus("need-code");
      return;
    }
    connect(code);
  }

  /** 새 가족 달력 만들기 → 새 코드로 연결 */
  function createFamily() {
    const code = newCode();
    writeLS(CODE_KEY, code);
    connect(code);
    return code;
  }

  /** 초대 링크나 코드로 가족 달력에 들어가기. 성공하면 true */
  function joinFamily(input) {
    const code = normalizeCode(input);
    if (!code) return false;
    writeLS(CODE_KEY, code);
    connect(code);
    return true;
  }

  function inviteLink() {
    const code = readLS(CODE_KEY, null);
    if (!code) return "";
    return `${location.origin}${location.pathname}#family=${code}`;
  }

  /** 공유 전에 이 기기에만 저장해 둔 일정 · 목표 수 */
  function localOnlyCount() {
    if (!cols.events) return 0;
    return Object.keys(KINDS).reduce((n, kind) => n + readLocal(kind).length, 0);
  }

  /** 이 기기에만 있던 일정 · 목표를 가족 달력으로 옮기고 기기에서는 지운다 */
  function moveLocalToShared() {
    if (!cols.events) return 0;
    const batch = db.batch();
    let count = 0;
    Object.keys(KINDS).forEach((kind) => {
      const list = readLocal(kind);
      list.forEach((x) =>
        batch.set(cols[kind].doc(), {
          ...KINDS[kind].clean(x),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        })
      );
      count += list.length;
      writeLocal(kind, []);
    });
    batch.commit().catch(() => setStatus("error", "옮기지 못했어요. 다시 시도해 주세요."));
    return count;
  }

  return {
    start,
    save: (event) => saveItem("events", event),
    remove: (id) => removeItem("events", id),
    saveGoal: (goal) => saveItem("goals", goal),
    removeGoal: (id) => removeItem("goals", id),
    createFamily,
    joinFamily,
    inviteLink,
    localOnlyCount,
    moveLocalToShared,
    get status() {
      return status;
    },
    get errorMessage() {
      return errorMessage;
    },
    get isConfigured() {
      return Boolean(FIREBASE_CONFIG);
    },
  };
})();
