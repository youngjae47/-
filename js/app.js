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
    events: loadEvents(),
    visible: new Set(MEMBERS.map((m) => m.id)),
    openDay: null, // 일정 목록 팝업에 열려 있는 날짜
    editingId: null,
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

  /** 그날 보여줄 일정 (여러 날 일정 포함, 시간 순) */
  function eventsOn(key) {
    return state.events
      .filter((e) => state.visible.has(e.member))
      .filter((e) => e.start <= key && key <= (e.end || e.start))
      .sort((a, b) => (a.time || "").localeCompare(b.time || "") || a.title.localeCompare(b.title));
  }

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
        if (e.end && e.end !== e.start) metaParts.push(`${labelOf(e.start)} ~ ${labelOf(e.end)}`);
        if (e.memo) metaParts.push(e.memo);
        if (metaParts.length) {
          const meta = document.createElement("span");
          meta.className = "meta";
          meta.textContent = metaParts.join(" · ");
          b.append(meta);
        }
        b.addEventListener("click", () => openForm(e));
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

  function openForm(event, dateKey) {
    const form = $("#eventForm");
    form.reset();
    $("#formError").textContent = "";
    state.editingId = event?.id || null;
    $("#formTitle").textContent = event ? "일정 고치기" : "일정 추가";
    $("#deleteBtn").hidden = !event;

    const e = event || { member: "family", start: dateKey || todayKey };
    form.title.value = e.title || "";
    form.start.value = e.start;
    form.end.value = e.end && e.end !== e.start ? e.end : "";
    form.time.value = e.time || "";
    form.memo.value = e.memo || "";
    form.querySelector(`input[name="member"][value="${e.member}"]`).checked = true;

    $("#eventDialog").showModal();
    form.title.focus();
  }

  function onSubmit(ev) {
    ev.preventDefault();
    const form = ev.target;
    const data = {
      title: form.title.value.trim(),
      member: form.member.value,
      start: form.start.value,
      end: form.end.value || "",
      time: form.time.value || "",
      memo: form.memo.value.trim(),
    };
    if (!data.title) return showError("일정 이름을 적어주세요.");
    if (!data.start) return showError("시작 날짜를 골라주세요.");
    if (data.end && data.end < data.start) return showError("끝 날짜가 시작 날짜보다 빨라요.");
    if (data.end === data.start) data.end = "";
    if (state.editingId) data.id = state.editingId;

    state.events = upsertEvent(state.events, data);
    afterChange(data.start);
  }

  function onDelete() {
    if (!state.editingId) return;
    if (!confirm("이 일정을 지울까요?")) return;
    state.events = deleteEvent(state.events, state.editingId);
    afterChange();
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

  // ---------- 연결 ----------
  $("#prevMonth").addEventListener("click", () => moveMonth(-1));
  $("#nextMonth").addEventListener("click", () => moveMonth(1));
  $("#todayBtn").addEventListener("click", () => {
    state.year = today.getFullYear();
    state.month = today.getMonth();
    renderGrid();
  });
  $("#addBtn").addEventListener("click", () => openForm(null, todayKey));
  $("#dayAddBtn").addEventListener("click", () => openForm(null, state.openDay));
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

  // 왼쪽·오른쪽 화살표 키로 달 이동
  document.addEventListener("keydown", (e) => {
    if (document.querySelector("dialog[open]")) return;
    if (e.key === "ArrowLeft") moveMonth(-1);
    if (e.key === "ArrowRight") moveMonth(1);
  });

  renderFilters();
  renderMemberPick();
  renderGrid();
})();
