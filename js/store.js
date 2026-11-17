// 일정 저장소
// - Firebase 설정(js/firebase-config.js)과 가족 코드가 있으면: Firestore에 저장하고 가족 모두와 실시간 공유
// - 없으면: 이 브라우저(localStorage)에만 저장
// app.js는 Store.start / save / remove 만 사용한다.

const MEMBERS = [
  { id: "family", name: "가족" },
  { id: "dad", name: "아빠" },
  { id: "mom", name: "엄마" },
  { id: "suhyun", name: "수현" },
];

const Store = (function () {
  const LOCAL_KEY = "familySchedule.events.v1";
  const CODE_KEY = "familySchedule.familyCode";
  const SDK_VERSION = "10.12.2";
  const SDK_BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
  const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // 헷갈리는 글자(i, l, o, 0, 1) 제외
  const CODE_LENGTH = 24;

  let onEvents = () => {};
  let onStatus = () => {};
  let status = "local"; // local | need-code | connecting | online | offline | error
  let errorMessage = "";
  let events = [];
  let db = null;
  let col = null;
  let unsubscribe = null;

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
  function readLocalEvents() {
    try {
      const list = JSON.parse(readLS(LOCAL_KEY, "[]"));
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }
  function writeLocalEvents(list) {
    writeLS(LOCAL_KEY, JSON.stringify(list));
  }

  function setStatus(next, message = "") {
    status = next;
    errorMessage = message;
    onStatus(status, errorMessage);
  }
  function emit(list) {
    events = list;
    onEvents(events);
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
    // 인터넷이 끊겨도 마지막 일정을 보여주고, 입력한 일정은 다시 연결되면 올린다
    await db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    return db;
  }

  async function connect(code) {
    if (unsubscribe) unsubscribe();
    setStatus("connecting");
    try {
      await initFirebase();
    } catch {
      setStatus("error", "공유 저장소에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
      return;
    }
    col = db.collection("families").doc(code).collection("events");
    unsubscribe = col.onSnapshot(
      { includeMetadataChanges: true },
      (snap) => {
        emit(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setStatus(snap.metadata.fromCache ? "offline" : "online");
      },
      (err) => {
        const msg =
          err.code === "permission-denied"
            ? "가족 코드가 올바르지 않거나 저장소 보안 규칙이 설정되지 않았어요."
            : "공유 저장소와 연결이 끊겼어요. 새로고침해 보세요.";
        setStatus("error", msg);
      }
    );
  }

  // ---------- 바깥에서 쓰는 기능 ----------
  function start(handlers) {
    onEvents = handlers.onEvents || onEvents;
    onStatus = handlers.onStatus || onStatus;

    if (!FIREBASE_CONFIG) {
      emit(readLocalEvents());
      setStatus("local");
      return;
    }
    const linkCode = codeFromUrl();
    if (linkCode) writeLS(CODE_KEY, linkCode);
    const code = readLS(CODE_KEY, null);
    if (!code) {
      emit([]);
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

  function clean(e) {
    return {
      title: String(e.title || "").slice(0, 40),
      member: e.member,
      start: e.start,
      end: e.end || "",
      time: e.time || "",
      memo: String(e.memo || "").slice(0, 200),
    };
  }

  /** 일정 추가(id 없음) 또는 수정(id 있음) */
  function save(event) {
    const data = clean(event);
    if (col) {
      const ref = event.id ? col.doc(event.id) : col.doc();
      // 인터넷이 끊겨 있어도 바로 화면에 반영되고, 연결되면 서버에 올라간다
      ref
        .set({ ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
        .catch(() => setStatus("error", "일정을 저장하지 못했어요. 다시 시도해 주세요."));
      return;
    }
    const list = readLocalEvents();
    const next = event.id
      ? list.map((e) => (e.id === event.id ? { ...data, id: e.id } : e))
      : [...list, { ...data, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }];
    writeLocalEvents(next);
    emit(next);
  }

  function remove(id) {
    if (col) {
      col.doc(id).delete().catch(() => setStatus("error", "일정을 지우지 못했어요. 다시 시도해 주세요."));
      return;
    }
    const next = readLocalEvents().filter((e) => e.id !== id);
    writeLocalEvents(next);
    emit(next);
  }

  /** 공유 전에 이 기기에만 저장해 둔 일정 수 */
  function localOnlyCount() {
    return col ? readLocalEvents().length : 0;
  }

  /** 이 기기에만 있던 일정을 가족 달력으로 옮기고 기기에서는 지운다 */
  function moveLocalToShared() {
    if (!col) return 0;
    const list = readLocalEvents();
    const batch = db.batch();
    list.forEach((e) =>
      batch.set(col.doc(), { ...clean(e), updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
    );
    batch.commit().catch(() => setStatus("error", "일정을 옮기지 못했어요. 다시 시도해 주세요."));
    writeLocalEvents([]);
    return list.length;
  }

  return {
    start,
    save,
    remove,
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
