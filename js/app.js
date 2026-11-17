// 가족 일정 달력 화면
(function () {
  const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
  const MAX_PILLS = 3; // 칸 하나에 보여줄 일정 수 (넘치면 "+N")

  const $ = (sel) => document.querySelector(sel);
  const memberById = Object.fromEntries(MEMBERS.map((m) => [m.id, m]));
  const colorOf = (id) => `var(--c-${id})`;

  const today = new Date();
  const state = {
    year: today.getFullYear(),
    month: today.getMonth(), // 0~11
    events: [],
    visible: new Set(MEMBERS.map((m) => m.id)),
    openDay: null, // 일정 목록 팝업에 열려 있는 날짜
    editingId: null, // 고치는 중인 일정 id (새 일정이면 null)
    editMode: "new", // new | edit | all(반복 전체) | one(반복 중 이 날만)
    occurrence: null, // 반복 일정에서 고른 날짜
    scopeEvent: null, // 이 날만 / 모든 반복 창에 열린 일정
    tab: "calendar", // calendar | dad | mom | suhyun
  };

  // ---------- 날짜 도우미 ----------
  const pad = (n) => String(n).padStart(2, "0");
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayKey = keyOf(today);
  function parseKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function labelOf(key) {
    const d = parseKey(key);
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY[d.getDay()]})`;
  }

  /** 그날 보여줄 일정 (여러 날 일정, 반복 일정 포함, 시간 순) */
  function eventsOn(key) {
    return state.events
      .filter((e) => state.visible.has(e.member))
      .filter((e) => occursOn(e, key))
      .map((e) => (e.repeat ? { ...e, occurrence: key } : e))
      .sort((a, b) => (a.time || "").localeCompare(b.time || "") || a.title.localeCompare(b.title));
  }
  const seriesOf = (e) => state.events.find((x) => x.id === e.id) || e;

  // ---------- 필터 ----------
  function renderFilters() {
    const box = $(".filters");
    box.replaceChildren(
      ...MEMBERS.map((m) => {
        const b = document.createElement("button");
        b.className = "chip";
        b.style.setProperty("--c", colorOf(m.id));
        b.setAttribute("aria-pressed", state.visible.has(m.id));
        b.innerHTML = '<span class="dot"></span>';
        b.append(m.name);
        b.addEventListener("click", () => {
          state.visible.has(m.id) ? state.visible.delete(m.id) : state.visible.add(m.id);
          b.setAttribute("aria-pressed", state.visible.has(m.id));
          renderGrid();
        });
        return b;
      })
    );
  }

  // ---------- 달력 ----------
  function renderGrid() {
    const { year, month } = state;
    $("#monthTitle").textContent = `${year}년 ${month + 1}월`;

    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - first.getDay()); // 그 주 일요일부터
    const lastDate = new Date(year, month + 1, 0).getDate();
    const weeks = Math.ceil((first.getDay() + lastDate) / 7);

    const cells = [];
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      cells.push(renderDay(d, d.getMonth() === month));
    }
    $("#grid").replaceChildren(...cells);

    const note = $("#holidayNote");
    note.hidden = hasHolidayData(year);
    note.textContent = `${year}년 공휴일 정보는 아직 없어요. 새해 공휴일이 발표되면 추가할게요.`;
  }

  function renderDay(d, inMonth) {
    const key = keyOf(d);
    const holiday = getHoliday(key);
    const list = eventsOn(key);

    const cell = document.createElement("button");
    cell.className = "day";
    cell.setAttribute("role", "gridcell");
    if (!inMonth) cell.classList.add("other-month");
    if (key === todayKey) cell.classList.add("is-today");
    if (d.getDay() === 0) cell.classList.add("sun");
    if (d.getDay() === 6) cell.classList.add("sat");
    if (holiday) cell.classList.add("holiday");
    cell.setAttribute(
      "aria-label",
      `${labelOf(key)}${holiday ? `, ${holiday}` : ""}, 일정 ${list.length}개`
    );

    const head = document.createElement("div");
    head.className = "day-head";
    const num = document.createElement("span");
    num.className = "date-num";
    num.textContent = d.getDate();
    head.append(num);
    if (holiday) {
      const h = document.createElement("span");
      h.className = "holiday-label";
      h.textContent = holiday;
      head.append(h);
    }
    cell.append(head);

    list.slice(0, MAX_PILLS).forEach((e) => {
      const p = document.createElement("span");
      p.className = "pill";
      p.style.setProperty("--c", colorOf(e.member));
      if (e.time) {
        const t = document.createElement("span");
        t.className = "time";
        t.textContent = e.time;
        p.append(t);
      }
      if (e.repeat) {
        const r = document.createElement("span");
        r.className = "repeat-icon";
        r.textContent = "↻";
        r.setAttribute("aria-label", "반복");
        p.append(r);
      }
      p.append(e.title);
      cell.append(p);
    });
    if (list.length > MAX_PILLS) {
      const more = document.createElement("span");
      more.className = "more";
      more.textContent = `+${list.length - MAX_PILLS}개 더`;
      cell.append(more);
    }

    cell.addEventListener("click", () => openDay(key));
    return cell;
  }

  function moveMonth(delta) {
    const d = new Date(state.year, state.month + delta, 1);
    state.year = d.getFullYear();
    state.month = d.getMonth();
    renderGrid();
  }

  // ---------- 날짜 팝업 ----------
  function openDay(key) {
    state.openDay = key;
    $("#dayTitle").textContent = labelOf(key);
    $("#dayHoliday").textContent = getHoliday(key) || "";
    renderDayList();
    $("#dayDialog").showModal();
  }

  function renderDayList() {
    const list = eventsOn(state.openDay);
    $("#dayEmpty").hidden = list.length > 0;
    $("#dayList").replaceChildren(
      ...list.map((e) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.style.setProperty("--c", colorOf(e.member));
        const who = document.createElement("span");
        who.className = "who";
        who.textContent = memberById[e.member]?.name || "";
        b.append(who, e.title);
        const metaParts = [];
        if (e.time) metaParts.push(e.time);
        if (e.repeat) metaParts.push(`↻ ${describeRepeat(e)}`);
        if (e.end && e.end !== e.start) metaParts.push(`${labelOf(e.start)} ~ ${labelOf(e.end)}`);
        if (e.memo) metaParts.push(e.memo);
        if (metaParts.length) {
          const meta = document.createElement("span");
          meta.className = "meta";
          meta.textContent = metaParts.join(" · ");
          b.append(meta);
        }
        b.addEventListener("click", () => (e.repeat ? openScope(e) : openForm(e, { mode: "edit" })));
        li.append(b);
        return li;
      })
    );
  }

  // ---------- 입력 팝업 ----------
  function renderMemberPick() {
    $("#memberPick").replaceChildren(
      ...MEMBERS.map((m) => {
        const label = document.createElement("label");
        label.style.setProperty("--c", colorOf(m.id));
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "member";
        input.value = m.id;
        input.required = true;
        const dot = document.createElement("span");
        dot.className = "dot";
        label.append(input, dot, m.name);
        return label;
      })
    );
  }

  function renderWeekdayPick() {
    const order = [1, 2, 3, 4, 5, 6, 0]; // 월요일부터
    $("#weekdayPick").replaceChildren(
      ...order.map((d) => {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.name = "repeatDays";
        input.value = d;
        const text = document.createElement("span");
        text.textContent = WEEKDAY[d];
        if (d === 0) text.className = "sun";
        if (d === 6) text.className = "sat";
        label.append(input, text);
        return label;
      })
    );
  }

  /** 반복 선택에 따라 요일 · 끝나는 날 · 끝 날짜 칸을 보이거나 숨긴다 */
  function syncRepeatFields() {
    const form = $("#eventForm");
    const repeat = form.repeat.value;
    $("#repeatDaysField").hidden = repeat !== "weekly";
    $("#repeatUntilField").hidden = !repeat;
    $("#endField").hidden = Boolean(repeat); // 반복 일정은 하루짜리만
    if (repeat) form.end.value = "";
    // 매주를 고르면 시작 날짜의 요일을 미리 골라 둔다
    const boxes = [...form.querySelectorAll('input[name="repeatDays"]')];
    if (repeat === "weekly" && !boxes.some((b) => b.checked) && form.start.value) {
      const dow = parseKey(form.start.value).getDay();
      boxes.find((b) => Number(b.value) === dow).checked = true;
    }
  }

  /**
   * 일정 입력 창 열기
   * opts.mode: new(새 일정) | edit(일반 일정 고치기) | all(반복 전체 고치기) | one(반복 중 이 날만 고치기)
   */
  function openForm(event, opts = {}) {
    const form = $("#eventForm");
    const mode = opts.mode || "new";
    form.reset();
    $("#formError").textContent = "";
    state.editMode = mode;
    state.editingId = mode === "edit" || mode === "all" ? event.id : null;
    state.occurrence = opts.occurrence || null;

    $("#formTitle").textContent = {
      new: "일정 추가",
      edit: "일정 고치기",
      all: "모든 반복 일정 고치기",
      one: "이 날 일정만 고치기",
    }[mode];
    $("#deleteBtn").hidden = !(mode === "edit" || mode === "all");
    $("#repeatBox").hidden = mode === "one";
    $("#occurrenceNote").hidden = mode !== "one";
    if (mode === "one") {
      $("#occurrenceNote").textContent = `${labelOf(opts.occurrence)} 하루만 바꿔요. 다른 날 반복은 그대로예요.`;
    }

    const e = event || { member: "family", start: opts.dateKey || todayKey };
    form.title.value = e.title || "";
    form.start.value = mode === "one" ? opts.occurrence : e.start;
    form.end.value = mode !== "one" && e.end && e.end !== e.start ? e.end : "";
    form.time.value = e.time || "";
    form.memo.value = e.memo || "";
    form.querySelector(`input[name="member"][value="${e.member}"]`).checked = true;
    form.repeat.value = mode === "one" ? "" : e.repeat || "";
    form.repeatUntil.value = e.repeatUntil || "";
    (e.repeatDays || []).forEach((d) => {
      const box = form.querySelector(`input[name="repeatDays"][value="${d}"]`);
      if (box) box.checked = true;
    });
    syncRepeatFields();

    $("#eventDialog").showModal();
    form.title.focus();
  }

  function onSubmit(ev) {
    ev.preventDefault();
    const form = ev.target;
    const repeat = state.editMode === "one" ? "" : form.repeat.value;
    const data = {
      title: form.title.value.trim(),
      member: form.member.value,
      start: form.start.value,
      end: repeat ? "" : form.end.value || "",
      time: form.time.value || "",
      memo: form.memo.value.trim(),
      repeat,
      repeatDays: [...form.querySelectorAll('input[name="repeatDays"]:checked')].map((b) => Number(b.value)),
      repeatUntil: repeat ? form.repeatUntil.value || "" : "",
    };
    if (!data.title) return showError("일정 이름을 적어주세요.");
    if (!data.start) return showError("시작 날짜를 골라주세요.");
    if (data.end && data.end < data.start) return showError("끝 날짜가 시작 날짜보다 빨라요.");
    if (data.repeatUntil && data.repeatUntil < data.start) return showError("반복 끝나는 날이 시작 날짜보다 빨라요.");
    if (data.end === data.start) data.end = "";
    if (repeat === "weekly" && data.repeatDays.length === 0) data.repeatDays = [parseKey(data.start).getDay()];

    if (state.editMode === "one") {
      // 반복에서 이 날을 빼고, 이 날만 따로 일반 일정으로 저장
      const series = state.events.find((x) => x.id === state.scopeEvent.id);
      Store.save(data);
      if (series) Store.save({ ...series, exdates: [...(series.exdates || []), state.occurrence] });
    } else {
      if (state.editingId) {
        data.id = state.editingId;
        data.exdates = state.events.find((x) => x.id === state.editingId)?.exdates || [];
      }
      Store.save(data); // 저장되면 Store가 onEvents로 새 목록을 알려준다
    }
    afterChange(data.start);
  }

  function onDelete() {
    if (!state.editingId) return;
    const msg = state.editMode === "all" ? "모든 반복 일정을 지울까요?" : "이 일정을 지울까요?";
    if (!confirm(msg)) return;
    Store.remove(state.editingId);
    afterChange();
  }

  // ---------- 반복 일정: 이 날만 / 모든 반복 ----------
  function openScope(e) {
    state.scopeEvent = e;
    $("#scopeTitle").textContent = e.title;
    $("#scopeRepeat").textContent = `↻ ${describeRepeat(e)}`;
    const day = labelOf(e.occurrence);
    $("#editOneBtn").textContent = `${day} 일정만 고치기`;
    $("#deleteOneBtn").textContent = `${day}만 지우기`;
    $("#scopeDialog").showModal();
  }

  function scopeAction(action) {
    const e = state.scopeEvent;
    const series = seriesOf(e);
    $("#scopeDialog").close();
    if (action === "editOne") openForm(series, { mode: "one", occurrence: e.occurrence });
    if (action === "editAll") openForm(series, { mode: "all" });
    if (action === "deleteOne") {
      Store.save({ ...series, exdates: [...(series.exdates || []), e.occurrence] });
      toast(`${labelOf(e.occurrence)} 일정을 지웠어요.`);
    }
    if (action === "deleteAll") {
      if (!confirm("모든 반복 일정을 지울까요?")) return;
      Store.remove(series.id);
      toast("반복 일정을 모두 지웠어요.");
    }
  }

  function afterChange(jumpTo) {
    $("#eventDialog").close();
    // 다른 달 날짜로 저장했으면 그 달로 이동
    if (jumpTo) {
      const d = parseKey(jumpTo);
      if (!state.openDay) {
        state.year = d.getFullYear();
        state.month = d.getMonth();
      }
    }
    renderGrid();
    if ($("#dayDialog").open) renderDayList();
  }

  function showError(msg) {
    $("#formError").textContent = msg;
  }

  // ---------- 가족 공유 ----------
  const STATUS_TEXT = {
    local: "이 기기에만 저장",
    "need-code": "가족 달력 연결하기",
    connecting: "연결 중…",
    online: "가족과 공유 중",
    offline: "오프라인",
    error: "연결 문제",
  };

  function renderStatus(status, message) {
    const badge = $("#syncBtn");
    badge.dataset.status = status;
    $("#syncText").textContent = STATUS_TEXT[status] || "";
    badge.title = message || "";
    if ($("#shareDialog").open) renderShare();
  }

  function renderShare() {
    const status = Store.status;
    const view = status === "local" || status === "need-code" ? status : "connected";
    document.querySelectorAll("#shareDialog [data-when]").forEach((s) => {
      s.hidden = s.dataset.when !== view;
    });
    if (view !== "connected") return;

    const text = {
      online: "✅ 가족과 실시간으로 공유되고 있어요.",
      offline: "⚠️ 인터넷이 끊겼어요. 입력한 일정은 다시 연결되면 자동으로 올라가요.",
      connecting: "연결하는 중이에요…",
      error: `⚠️ ${Store.errorMessage}`,
    }[status];
    $("#shareStatus").textContent = text || "";
    $("#inviteLink").value = Store.inviteLink();
    const count = Store.localOnlyCount();
    $("#moveLocalBox").hidden = count === 0;
    $("#localCount").textContent = count;
  }

  function openShare() {
    renderShare();
    $("#joinError").textContent = "";
    $("#switchError").textContent = "";
    if (!$("#shareDialog").open) $("#shareDialog").showModal();
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  function onJoin(ev, errorEl) {
    ev.preventDefault();
    const ok = Store.joinFamily(ev.target.code.value);
    if (!ok) {
      $(errorEl).textContent = "링크나 코드가 올바르지 않아요. 받은 링크 전체를 붙여넣어 보세요.";
      return;
    }
    ev.target.reset();
    $("#shareDialog").close();
    toast("가족 달력에 연결했어요.");
  }

  async function copyInvite() {
    const link = Store.inviteLink();
    try {
      await navigator.clipboard.writeText(link);
      toast("초대 링크를 복사했어요. 가족에게 보내 주세요.");
    } catch {
      // 복사 권한이 없으면 직접 복사할 수 있게 선택해 둔다
      $("#inviteLink").select();
      toast("링크를 길게 눌러 복사해 주세요.");
    }
  }

  // ---------- 연결 ----------
  $("#prevMonth").addEventListener("click", () => moveMonth(-1));
  $("#nextMonth").addEventListener("click", () => moveMonth(1));
  $("#todayBtn").addEventListener("click", () => {
    state.year = today.getFullYear();
    state.month = today.getMonth();
    renderGrid();
  });
  $("#addBtn").addEventListener("click", () =>
    state.tab === "calendar" ? openForm(null, { dateKey: todayKey }) : GoalsPage.openNew()
  );
  $("#dayAddBtn").addEventListener("click", () => openForm(null, { dateKey: state.openDay }));
  $("#eventForm").repeat.addEventListener("change", syncRepeatFields);
  $("#eventForm").start.addEventListener("change", syncRepeatFields);
  $("#editOneBtn").addEventListener("click", () => scopeAction("editOne"));
  $("#editAllBtn").addEventListener("click", () => scopeAction("editAll"));
  $("#deleteOneBtn").addEventListener("click", () => scopeAction("deleteOne"));
  $("#deleteAllBtn").addEventListener("click", () => scopeAction("deleteAll"));
  $("#eventForm").addEventListener("submit", onSubmit);
  $("#deleteBtn").addEventListener("click", onDelete);

  document.querySelectorAll("dialog").forEach((dlg) => {
    dlg.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => dlg.close()));
    // 바깥(어두운 부분)을 누르면 닫기
    dlg.addEventListener("click", (e) => {
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) dlg.close();
    });
  });
  $("#dayDialog").addEventListener("close", () => { state.openDay = null; });

  // 왼쪽·오른쪽 화살표 키로 달 이동 (목표 탭에서는 해 이동)
  document.addEventListener("keydown", (e) => {
    if (document.querySelector("dialog[open]")) return;
    if (e.target.closest("input, textarea, select")) return;
    const onGoals = state.tab !== "calendar";
    if (e.key === "ArrowLeft") onGoals ? $("#prevYear").click() : moveMonth(-1);
    if (e.key === "ArrowRight") onGoals ? $("#nextYear").click() : moveMonth(1);
  });

  // ---------- 탭: 가족 일정 / 아빠 / 엄마 / 수현 ----------
  const TAB_KEY = "familySchedule.tab";
  function showTab(tab) {
    state.tab = tab;
    document.querySelectorAll(".tab").forEach((t) => {
      const on = t.dataset.tab === tab;
      t.classList.toggle("is-active", on);
      if (on) t.setAttribute("aria-current", "page");
      else t.removeAttribute("aria-current");
    });
    const onGoals = tab !== "calendar";
    $(".calendar-page").hidden = onGoals;
    $("#goalsPage").hidden = !onGoals;
    $("#addBtn").setAttribute("aria-label", onGoals ? "목표 추가" : "일정 추가");
    if (onGoals) GoalsPage.show(tab);
    try { localStorage.setItem(TAB_KEY, tab); } catch { /* 저장 못 해도 괜찮음 */ }
  }
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));

  $("#syncBtn").addEventListener("click", openShare);
  $("#createFamilyBtn").addEventListener("click", () => {
    Store.createFamily();
    renderShare(); // 같은 창에서 바로 초대 링크를 보여준다
    toast("새 가족 달력을 만들었어요. 초대 링크를 가족에게 보내 주세요.");
  });
  $("#joinForm").addEventListener("submit", (e) => onJoin(e, "#joinError"));
  $("#switchForm").addEventListener("submit", (e) => onJoin(e, "#switchError"));
  $("#copyLinkBtn").addEventListener("click", copyInvite);
  $("#moveLocalBtn").addEventListener("click", () => {
    const n = Store.moveLocalToShared();
    renderShare();
    toast(`${n}개를 가족 달력으로 옮겼어요.`);
  });

  renderFilters();
  renderMemberPick();
  renderWeekdayPick();
  renderGrid();
  GoalsPage.init({ toast });
  let savedTab = "calendar";
  try { savedTab = localStorage.getItem(TAB_KEY) || "calendar"; } catch { /* 기본은 가족 일정 */ }
  showTab(document.querySelector(`.tab[data-tab="${savedTab}"]`) ? savedTab : "calendar");

  let offeredMove = false;
  Store.start({
    onEvents(list) {
      state.events = list;
      renderGrid();
      if ($("#dayDialog").open) renderDayList();
    },
    onGoals(list) {
      GoalsPage.setGoals(list);
    },
    onStatus(status, message) {
      renderStatus(status, message);
      // 처음 여는 기기라면 가족 달력 연결 창을 바로 띄운다
      if (status === "need-code" && !$("#shareDialog").open) openShare();
      // 이 기기에만 있던 일정이 있으면 옮길지 한 번만 물어본다
      if (status === "online" && !offeredMove && Store.localOnlyCount() > 0) {
        offeredMove = true;
        openShare();
      }
    },
  });
})();
