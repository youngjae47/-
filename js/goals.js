// 구성원별 목표 간트차트 보드 (아빠 · 엄마 · 수현 탭)
// - 맨 위: 전체 달성률과 대분류(건강 · 가족 관계 · 자아실현)별 달성률
// - 간트차트: 연간(12달) 보기 / 일별(하루 한 칸, 가로 스크롤) 보기
// - 막대 끌기: 가운데 = 기간 옮기기, 양 끝 = 시작일 · 종료일 바꾸기 (하루 단위)
// - ⠿ 손잡이 끌기: 목표 순서 바꾸기 (다른 대분류로 옮기면 대분류도 바뀜)
// - 키워드 검색: 가족 전체 목표에서 이름 · 메모 · 대분류를 찾는다

const GoalsPage = (function () {
  const $ = (sel) => document.querySelector(sel);
  const pad = (n) => String(n).padStart(2, "0");
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const memberName = (id) => MEMBERS.find((m) => m.id === id)?.name || "";
  const catOf = (id) => GOAL_CATEGORIES.find((c) => c.id === id);
  const DAY = 24 * 60 * 60 * 1000;
  const ZOOM_KEY = "familySchedule.ganttZoom";
  const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

  const today = new Date();
  const todayKey = keyOf(today);
  const state = {
    member: "dad",
    year: today.getFullYear(),
    goals: [],
    editingId: null,
    zoom: readZoom(), // year | day
    query: "", // 검색어 (공백 없앤 소문자)
    rawQuery: "",
    scrollToToday: true, // 일별 보기에서 다음 그릴 때 오늘로 스크롤
  };
  let toast = () => {};
  let onShowMember = () => {};

  function readZoom() {
    try {
      return localStorage.getItem(ZOOM_KEY) === "day" ? "day" : "year";
    } catch {
      return "year";
    }
  }

  // ---------- 날짜 계산 ----------
  function utc(key) {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  }
  function keyFromUtc(ms) {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const addDays = (key, n) => keyFromUtc(utc(key) + n * DAY);
  const daysInYear = (y) => (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / DAY;
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  /** 날짜가 그 해에서 몇 % 지점인지 (0~100) */
  function yearPos(key) {
    return ((utc(key) - Date.UTC(state.year, 0, 1)) / (daysInYear(state.year) * DAY)) * 100;
  }
  function shortDate(key) {
    const [, m, d] = key.split("-").map(Number);
    return `${m}월 ${d}일`;
  }
  function fullDate(key) {
    const [y, m, d] = key.split("-").map(Number);
    return `${y}. ${m}. ${d}.`;
  }
  const yearFirst = () => `${state.year}-01-01`;
  const yearLast = () => `${state.year}-12-31`;

  // ---------- 목표 고르기 · 정렬 ----------
  const NO_ORDER = 1e9;
  function byOrder(a, b) {
    return (
      (a.order ?? NO_ORDER) - (b.order ?? NO_ORDER) ||
      a.start.localeCompare(b.start) ||
      a.title.localeCompare(b.title)
    );
  }
  /** 고른 사람의, 고른 해에 걸쳐 있는 목표 */
  function memberGoals() {
    return state.goals
      .filter((g) => g.member === state.member && g.start <= yearLast() && g.end >= yearFirst())
      .sort(byOrder);
  }
  /** 한 사람 · 한 대분류의 모든 목표 (모든 해) */
  function categoryList(member, category) {
    return state.goals.filter((g) => g.member === member && g.category === category).sort(byOrder);
  }
  function average(list) {
    if (!list.length) return null;
    return Math.round(list.reduce((s, g) => s + (Number(g.progress) || 0), 0) / list.length);
  }
  const rateText = (r) => (r === null ? "–" : `${r}%`);

  // ---------- 검색 ----------
  const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");
  function matches(g) {
    if (!state.query) return true;
    return [g.title, g.memo, catOf(g.category)?.name].some((t) => norm(t).includes(state.query));
  }
  /** 검색어 부분을 <mark>로 강조한 글자 조각 */
  function highlighted(text) {
    const frag = document.createDocumentFragment();
    const words = state.rawQuery.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      frag.append(text);
      return frag;
    }
    const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`(${escaped.join("|")})`, "gi");
    text.split(re).forEach((part, i) => {
      if (i % 2) {
        const m = document.createElement("mark");
        m.textContent = part;
        frag.append(m);
      } else if (part) frag.append(part);
    });
    return frag;
  }

  // ---------- 그리기 ----------
  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function render() {
    $("#goalsPage").style.setProperty("--c", `var(--c-${state.member})`);
    $("#goalsTitle").textContent = `${memberName(state.member)}의 ${state.year}년 목표`;
    document.querySelectorAll(".seg [data-zoom]").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.zoom === state.zoom))
    );
    const goals = memberGoals();
    renderFamily();
    renderSummary(goals);
    renderResults();
    renderGantt(goals.filter(matches));
  }

  function renderSummary(goals) {
    const total = average(goals);
    $("#totalRate").textContent = rateText(total);
    $("#totalMeter").style.width = `${total || 0}%`;
    const done = goals.filter((g) => g.progress >= 100).length;
    $("#totalSub").textContent = goals.length ? `목표 ${goals.length}개 · 완료 ${done}개` : "아직 목표가 없어요";

    $("#summaryCats").replaceChildren(
      ...GOAL_CATEGORIES.map((c) => {
        const list = goals.filter((g) => g.category === c.id);
        const rate = average(list);
        const card = el("div", "summary-card cat");
        card.append(el("p", "summary-label", `${c.icon} ${c.name}`), el("p", "summary-value", rateText(rate)));
        const meter = el("div", "meter");
        const fill = el("span");
        fill.style.width = `${rate || 0}%`;
        meter.append(fill);
        card.append(meter, el("p", "summary-sub", `목표 ${list.length}개`));
        return card;
      })
    );
  }

  /** 가족 전체 달성률: 가족 평균 + 아빠 · 엄마 · 수현 (누르면 그 사람 탭) */
  function renderFamily() {
    const people = MEMBERS.filter((m) => m.id !== "family");
    const inYear = (g) => g.start <= yearLast() && g.end >= yearFirst();
    const yearGoals = state.goals.filter((g) => inYear(g) && people.some((m) => m.id === g.member));
    const familyRate = average(yearGoals);

    const head = el("div", "family-card family-avg");
    head.append(
      el("p", "family-name", `👨‍👩‍👧 가족 평균`),
      el("p", "family-rate", rateText(familyRate)),
      meter(familyRate, "var(--accent)"),
      el("p", "family-sub", `목표 ${yearGoals.length}개`)
    );

    const cards = people.map((m) => {
      const list = yearGoals.filter((g) => g.member === m.id);
      const rate = average(list);
      const done = list.filter((g) => g.progress >= 100).length;
      const card = el("button", "family-card");
      card.type = "button";
      card.style.setProperty("--mc", `var(--c-${m.id})`);
      if (m.id === state.member) {
        card.classList.add("is-current");
        card.setAttribute("aria-current", "true");
      }
      card.setAttribute("aria-label", `${m.name} 달성률 ${rateText(rate)}, 완료 ${done}개. ${m.name} 탭으로 가기`);
      card.append(
        el("p", "family-name", m.name),
        el("p", "family-rate", rateText(rate)),
        meter(rate, `var(--c-${m.id})`),
        el("p", "family-sub", done ? `${"🏅".repeat(Math.min(done, 5))}${done > 5 ? ` ×${done}` : ""} 완료 ${done}개` : `목표 ${list.length}개`)
      );
      card.addEventListener("click", () => {
        if (m.id !== state.member) onShowMember(m.id);
      });
      return card;
    });
    $("#familyStrip").replaceChildren(head, ...cards);
  }

  function meter(rate, color) {
    const box = el("div", "meter");
    const fill = el("span");
    fill.style.width = `${rate || 0}%`;
    fill.style.background = color;
    box.append(fill);
    return box;
  }

  /** 검색 결과: 가족 전체 목표 */
  function renderResults() {
    const box = $("#searchResults");
    if (!state.query) {
      box.hidden = true;
      return;
    }
    const memberIndex = (id) => MEMBERS.findIndex((m) => m.id === id);
    const found = state.goals
      .filter(matches)
      .sort((a, b) => memberIndex(a.member) - memberIndex(b.member) || a.start.localeCompare(b.start));
    box.hidden = false;
    const head = el("p", "search-head");
    head.append(`‘${state.rawQuery.trim()}’ 가족 전체 검색 결과 `, el("b", "", `${found.length}개`));
    if (!found.length) {
      box.replaceChildren(head, el("p", "search-empty", "맞는 목표가 없어요. 다른 낱말로 찾아보세요."));
      return;
    }
    const list = el("ul", "search-list");
    found.forEach((g) => {
      const li = el("li");
      const b = el("button", "search-item");
      b.type = "button";
      b.style.setProperty("--c", `var(--c-${g.member})`);
      const who = el("span", "search-who", memberName(g.member));
      const title = el("span", "search-title");
      title.append(highlighted(g.title));
      const meta = el(
        "span",
        "search-meta",
        `${catOf(g.category)?.icon} ${catOf(g.category)?.name} · ${fullDate(g.start)} ~ ${fullDate(g.end)} · ${g.progress}%`
      );
      b.append(who, title, meta);
      b.addEventListener("click", () => jumpTo(g));
      li.append(b);
      list.append(li);
    });
    box.replaceChildren(head, list);
  }

  /** 검색 결과에서 고른 목표로 이동: 그 사람 탭, 그 해, 그 줄 */
  function jumpTo(g) {
    const overlaps = g.start <= yearLast() && g.end >= yearFirst();
    if (!overlaps) state.year = Number(g.start.slice(0, 4));
    onShowMember(g.member); // app.js가 탭을 바꾸고 show()를 부른다
    const row = document.querySelector(`.gantt-row[data-id="${g.id}"]`);
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    if (state.zoom === "day") {
      // 왼쪽 이름 칸은 고정이라, 막대 시작이 이름 칸 바로 옆에 오도록 스크롤
      $("#ganttScroll").scrollLeft = Math.max(0, row.querySelector(".gantt-bar").offsetLeft - 24);
    }
    row.classList.remove("flash");
    void row.offsetWidth; // 애니메이션 다시 시작
    row.classList.add("flash");
  }

  // ----- 간트차트 -----
  function dayWidth() {
    return window.matchMedia("(max-width: 640px)").matches ? 26 : 32;
  }

  function renderGantt(goals) {
    const inner = $("#ganttInner");
    const daily = state.zoom === "day";
    const days = daysInYear(state.year);
    const dayW = dayWidth();
    inner.classList.toggle("is-daily", daily);
    inner.style.setProperty("--track-w", daily ? `${days * dayW}px` : "minmax(0, 1fr)");
    inner.style.setProperty("--day-w", `${dayW}px`);
    inner.style.setProperty("--week-offset", `${-new Date(state.year, 0, 1).getDay() * dayW}px`);

    const showToday = state.year === today.getFullYear();
    const todayPos = yearPos(todayKey);

    const groups = GOAL_CATEGORIES.map((c) => {
      const list = goals.filter((g) => g.category === c.id);
      const all = memberGoals().filter((g) => g.category === c.id);
      const group = el("div", "gantt-group");
      group.dataset.cat = c.id;

      // 대분류 줄
      const head = el("div", "gantt-cat");
      const label = el("div", "gantt-label gantt-cat-label");
      const add = el("button", "gantt-add", "＋");
      add.type = "button";
      add.title = `${c.name} 목표 추가`;
      add.setAttribute("aria-label", `${c.name} 목표 추가`);
      add.addEventListener("click", () => openForm(null, c.id));
      label.append(
        el("span", "gantt-cat-name", `${c.icon} ${c.name}`),
        el("span", "gantt-cat-rate", rateText(average(all))),
        add
      );
      head.append(label, el("div", "gantt-track gantt-track-cat"));
      group.append(head);

      if (!list.length) {
        const empty = el("div", "gantt-empty-row");
        empty.append(
          el("div", "gantt-label gantt-empty", state.query && all.length ? "검색 결과가 없어요." : "아직 목표가 없어요."),
          el("div", "gantt-track")
        );
        group.append(empty);
      }

      list.forEach((g) => group.append(renderRow(g, showToday, todayPos)));
      return group;
    });

    // 다시 그려도 (다른 기기에서 바뀌어도) 보던 줄의 손잡이 · 이름 버튼에 초점을 유지한다
    const active = document.activeElement;
    const focusRow = active?.closest?.(".gantt-row")?.dataset.id || state.refocus;
    const focusPart = active?.classList?.contains("gantt-open") ? ".gantt-open" : ".gantt-handle";
    const hadFocus = Boolean(active?.closest?.("#ganttInner")) || Boolean(state.refocus);
    state.refocus = null;

    inner.replaceChildren(renderHeader(daily, dayW), ...groups);

    if (hadFocus && focusRow) {
      inner.querySelector(`.gantt-row[data-id="${focusRow}"] ${focusPart}`)?.focus({ preventScroll: true });
    }

    if (daily && state.scrollToToday) {
      state.scrollToToday = false;
      const scroll = $("#ganttScroll");
      const labelW = inner.querySelector(".gantt-label")?.offsetWidth || 0;
      const target = showToday ? (todayPos / 100) * days * dayW : 0;
      scroll.scrollLeft = Math.max(0, target - (scroll.clientWidth - labelW) / 2);
    }
  }

  function renderHeader(daily, dayW) {
    const head = el("div", "gantt-head");
    head.append(el("div", "gantt-label gantt-label-col", "목표"));
    const right = el("div", "gantt-head-track");

    if (!daily) {
      const months = el("div", "gantt-months");
      for (let i = 0; i < 12; i++) {
        const s = el("span", "", `${i + 1}`);
        s.dataset.unit = "월";
        s.style.width = `${(daysInMonth(state.year, i) / daysInYear(state.year)) * 100}%`;
        if (state.year === today.getFullYear() && i === today.getMonth()) s.className = "is-now";
        months.append(s);
      }
      right.append(months);
      head.append(right);
      return head;
    }

    const months = el("div", "gantt-months daily");
    const dayRow = el("div", "gantt-days");
    for (let m = 0; m < 12; m++) {
      const n = daysInMonth(state.year, m);
      const ms = el("span");
      ms.append(el("b", "", `${m + 1}월`)); // 스크롤해도 달 이름이 왼쪽에 붙어 보이도록
      ms.style.width = `${n * dayW}px`;
      if (state.year === today.getFullYear() && m === today.getMonth()) ms.className = "is-now";
      months.append(ms);
      for (let d = 1; d <= n; d++) {
        const key = `${state.year}-${pad(m + 1)}-${pad(d)}`;
        const dow = new Date(state.year, m, d).getDay();
        const cell = el("span", "gantt-day");
        cell.append(el("b", "", String(d)), el("i", "", WEEKDAY[dow]));
        const holiday = typeof getHoliday === "function" ? getHoliday(key) : "";
        if (dow === 0 || holiday) cell.classList.add("sun");
        else if (dow === 6) cell.classList.add("sat");
        if (holiday) cell.title = holiday;
        if (key === todayKey) cell.classList.add("is-today");
        if (d === 1) cell.classList.add("month-start");
        dayRow.append(cell);
      }
    }
    right.append(months, dayRow);
    head.append(right);
    return head;
  }

  function renderRow(g, showToday, todayPos) {
    const row = el("div", "gantt-row");
    row.dataset.id = g.id;
    if (g.progress >= 100) row.classList.add("is-done");

    const label = el("div", "gantt-label");
    const handle = el("button", "gantt-handle", "⠿");
    handle.type = "button";
    handle.title = "끌어서 순서 바꾸기";
    handle.setAttribute("aria-label", `${g.title} 순서 바꾸기 (위아래 화살표)`);
    const open = el("button", "gantt-open");
    open.type = "button";
    open.setAttribute("aria-label", `${g.title}, ${fullDate(g.start)}부터 ${fullDate(g.end)}까지, 달성률 ${g.progress}%`);
    const title = el("span", "gantt-title");
    title.append(highlighted(g.title));
    if (g.progress >= 100) {
      const badge = el("span", "badge", "🏅");
      badge.title = "달성한 목표";
      open.append(badge);
    }
    open.append(title, el("span", "gantt-rate", `${g.progress}%`));
    open.addEventListener("click", () => openForm(g));
    label.append(handle, open);

    const track = el("div", "gantt-track");
    const bar = el("div", "gantt-bar");
    bar.title = `${fullDate(g.start)} ~ ${fullDate(g.end)}`;
    const fill = el("span", "gantt-fill");
    fill.style.width = `${g.progress}%`;
    bar.append(fill);
    if (g.progress >= 100) bar.append(el("span", "gantt-check", "✓"));
    bar.append(el("span", "grip grip-l"), el("span", "grip grip-r"));
    placeBar(bar, g.start, g.end);
    track.append(bar);
    if (showToday) {
      const line = el("span", "today-line");
      line.style.left = `${todayPos}%`;
      track.append(line);
    }
    row.append(label, track);

    attachBarDrag(bar, g);
    attachRowDrag(handle, row, g);
    return row;
  }

  /** 막대를 기간에 맞게 놓는다 (그 해 밖으로 나간 부분은 잘린 모양) */
  function placeBar(bar, start, end) {
    const from = start < yearFirst() ? yearFirst() : start;
    const to = end > yearLast() ? yearLast() : end;
    const hidden = end < yearFirst() || start > yearLast();
    bar.style.visibility = hidden ? "hidden" : "";
    const left = yearPos(from);
    bar.style.left = `${left}%`;
    bar.style.width = `${Math.max(yearPos(addDays(to, 1)) - left, 0.27)}%`;
    bar.classList.toggle("cut-left", from !== start);
    bar.classList.toggle("cut-right", to !== end);
  }

  // ---------- 말풍선 ----------
  function showTip(ev, text) {
    const tip = $("#ganttTip");
    tip.textContent = text;
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = `${Math.min(Math.max(8, ev.clientX - w / 2), window.innerWidth - w - 8)}px`;
    tip.style.top = `${Math.max(8, ev.clientY - 48)}px`;
  }
  const hideTip = () => ($("#ganttTip").hidden = true);

  // ---------- 막대 끌기: 기간 옮기기 · 시작일 / 종료일 바꾸기 ----------
  function attachBarDrag(bar, goal) {
    bar.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const mode = e.target.classList.contains("grip-l")
        ? "start"
        : e.target.classList.contains("grip-r")
          ? "end"
          : "move";
      const pxPerDay = bar.parentElement.getBoundingClientRect().width / daysInYear(state.year);
      const s = { x: e.clientX, dragging: false, start: goal.start, end: goal.end };
      bar.setPointerCapture(e.pointerId);

      const finish = () => {
        bar.removeEventListener("pointermove", move);
        bar.removeEventListener("pointerup", up);
        bar.removeEventListener("pointercancel", cancel);
        bar.classList.remove("is-moving");
        document.body.classList.remove("gantt-dragging");
        hideTip();
      };
      const move = (ev) => {
        const dx = ev.clientX - s.x;
        if (!s.dragging && Math.abs(dx) < 4) return;
        if (!s.dragging) {
          s.dragging = true;
          bar.classList.add("is-moving");
          document.body.classList.add("gantt-dragging");
        }
        const dd = Math.round(dx / pxPerDay);
        let start = goal.start;
        let end = goal.end;
        if (mode === "move") {
          start = addDays(goal.start, dd);
          end = addDays(goal.end, dd);
        } else if (mode === "start") {
          start = addDays(goal.start, dd);
          if (start > goal.end) start = goal.end;
        } else {
          end = addDays(goal.end, dd);
          if (end < goal.start) end = goal.start;
        }
        s.start = start;
        s.end = end;
        placeBar(bar, start, end);
        const label = { move: "기간 옮기기", start: "시작일", end: "종료일" }[mode];
        showTip(ev, `${label}: ${shortDate(start)} ~ ${shortDate(end)}`);
      };
      const up = () => {
        finish();
        if (!s.dragging) {
          openForm(goal); // 끌지 않고 눌렀으면 고치기 창
          return;
        }
        if (s.start === goal.start && s.end === goal.end) return render(); // 제자리
        Store.saveGoal({ ...goal, start: s.start, end: s.end });
        toast(`${goal.title}: ${fullDate(s.start)} ~ ${fullDate(s.end)}`);
      };
      const cancel = () => {
        finish();
        render();
      };
      bar.addEventListener("pointermove", move);
      bar.addEventListener("pointerup", up);
      bar.addEventListener("pointercancel", cancel);
    });
  }

  // ---------- 줄 끌기: 순서 바꾸기 ----------
  /**
   * 끌던 목표를 category의 보이는 줄 visibleRows(끌던 줄 제외) 중 index 자리에 넣는다.
   * 보이지 않는 목표(다른 해 · 검색으로 숨김)까지 포함한 전체 순서를 다시 매긴다.
   */
  function applyReorder(goal, category, beforeId, afterId) {
    const current = categoryList(goal.member, category);
    const list = current.filter((g) => g.id !== goal.id);
    let at = list.length;
    if (beforeId) at = list.findIndex((g) => g.id === beforeId);
    else if (afterId) at = list.findIndex((g) => g.id === afterId) + 1;
    if (at < 0) at = list.length;
    const moved = { ...goal, category };
    list.splice(at, 0, moved);

    const sameCategory = goal.category === category;
    const sameOrder = list.map((g) => g.id).join() === current.map((g) => g.id).join();
    if (sameCategory && sameOrder) return 0; // 제자리

    let changed = 0;
    list.forEach((g, i) => {
      if (g.order === i && (g !== moved || sameCategory)) return; // 바뀐 것만 저장
      Store.saveGoal({ ...g, order: i });
      changed++;
    });
    if (!sameCategory) toast(`‘${goal.title}’을(를) ${catOf(category).name}(으)로 옮겼어요.`);
    return changed;
  }

  /** 끌던 줄을 놓을 자리 찾기 */
  function findDrop(y, draggedRow) {
    const groups = [...document.querySelectorAll("#ganttInner .gantt-group")];
    let group = groups.find((g) => {
      const r = g.getBoundingClientRect();
      return y >= r.top && y <= r.bottom;
    });
    if (!group) group = y < groups[0].getBoundingClientRect().top ? groups[0] : groups[groups.length - 1];
    const rows = [...group.querySelectorAll(".gantt-row")].filter((r) => r !== draggedRow);
    const index = rows.filter((r) => {
      const rect = r.getBoundingClientRect();
      return rect.top + rect.height / 2 < y;
    }).length;
    return { group, rows, index, category: group.dataset.cat };
  }

  function attachRowDrag(handle, row, goal) {
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const inner = $("#ganttInner");
      const startY = e.clientY;
      const startScroll = window.scrollY;
      const indicator = el("div", "drop-line");
      let dragging = false;
      let drop = null;

      const move = (ev) => {
        const dy = ev.clientY - startY + (window.scrollY - startScroll);
        if (!dragging && Math.abs(dy) < 4) return;
        if (!dragging) {
          dragging = true;
          row.classList.add("is-dragging");
          document.body.classList.add("gantt-dragging");
          inner.append(indicator);
        }
        row.style.transform = `translateY(${dy}px)`;
        if (ev.clientY < 70) window.scrollBy(0, -14);
        else if (ev.clientY > window.innerHeight - 70) window.scrollBy(0, 14);

        drop = findDrop(ev.clientY, row);
        const innerTop = inner.getBoundingClientRect().top;
        let y;
        if (drop.index < drop.rows.length) y = drop.rows[drop.index].getBoundingClientRect().top;
        else if (drop.rows.length) y = drop.rows[drop.rows.length - 1].getBoundingClientRect().bottom;
        else y = drop.group.querySelector(".gantt-cat").getBoundingClientRect().bottom;
        indicator.style.top = `${y - innerTop - 1}px`;
      };
      const finish = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", finishAndRender);
        indicator.remove();
        row.classList.remove("is-dragging");
        row.style.transform = "";
        document.body.classList.remove("gantt-dragging");
      };
      const finishAndRender = () => {
        finish();
        render();
      };
      const up = () => {
        finish();
        if (!dragging || !drop) return;
        const before = drop.rows[drop.index]?.dataset.id;
        const after = !before && drop.rows.length ? drop.rows[drop.rows.length - 1].dataset.id : null;
        if (!applyReorder(goal, drop.category, before, after)) render(); // 제자리면 원래대로
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", finishAndRender);
    });

    // 키보드: 손잡이에서 ↑ ↓
    handle.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      e.stopPropagation();
      const rows = [...row.parentElement.querySelectorAll(".gantt-row")];
      const i = rows.indexOf(row);
      const j = e.key === "ArrowUp" ? i - 1 : i + 1;
      if (j < 0 || j >= rows.length) return;
      const target = rows[j].dataset.id;
      state.refocus = goal.id; // 다시 그린 뒤에도 같은 손잡이에 초점
      if (e.key === "ArrowUp") applyReorder(goal, goal.category, target, null);
      else applyReorder(goal, goal.category, null, target);
    });
  }

  // ---------- 입력 창 ----------
  function renderCatPick() {
    $("#catPick").replaceChildren(
      ...GOAL_CATEGORIES.map((c) => {
        const label = el("label");
        const input = el("input");
        input.type = "radio";
        input.name = "category";
        input.value = c.id;
        input.required = true;
        label.append(input, `${c.icon} ${c.name}`);
        return label;
      })
    );
  }

  function setProgress(value) {
    const form = $("#goalForm");
    const v = Math.min(100, Math.max(0, Math.round(value / 5) * 5));
    form.progress.value = v;
    $("#progressOut").textContent = `${v}%`;
  }

  function openForm(goal, category) {
    const form = $("#goalForm");
    form.reset();
    $("#goalError").textContent = "";
    state.editingId = goal?.id || null;
    $("#goalFormTitle").textContent = goal
      ? `${memberName(goal.member)} 목표 고치기`
      : `${memberName(state.member)} 목표 추가`;
    $("#goalDeleteBtn").hidden = !goal;

    const isThisYear = state.year === today.getFullYear();
    const g = goal || {
      category: category || "health",
      start: isThisYear ? todayKey : yearFirst(),
      end: yearLast(),
      progress: 0,
    };
    form.querySelector(`input[name="category"][value="${g.category}"]`).checked = true;
    form.title.value = g.title || "";
    form.start.value = g.start;
    form.end.value = g.end;
    form.memo.value = g.memo || "";
    setProgress(g.progress || 0);

    $("#goalDialog").showModal();
    form.title.focus();
  }

  function nextOrder(member, category, exceptId) {
    const list = categoryList(member, category).filter((g) => g.id !== exceptId);
    return list.length ? Math.max(...list.map((g, i) => g.order ?? i)) + 1 : 0;
  }

  function onSubmit(ev) {
    ev.preventDefault();
    const form = ev.target;
    const existing = state.goals.find((x) => x.id === state.editingId);
    const goal = {
      title: form.title.value.trim(),
      category: form.category.value,
      member: existing ? existing.member : state.member,
      start: form.start.value,
      end: form.end.value,
      progress: Number(form.progress.value),
      memo: form.memo.value.trim(),
    };
    const error = (msg) => ($("#goalError").textContent = msg);
    if (!goal.title) return error("목표를 적어주세요.");
    if (!goal.category) return error("대분류를 골라주세요.");
    if (!goal.start || !goal.end) return error("시작 날짜와 끝 날짜를 골라주세요.");
    if (goal.end < goal.start) return error("끝 날짜가 시작 날짜보다 빨라요.");
    if (existing) {
      goal.id = existing.id;
      // 대분류를 바꾸면 새 대분류의 맨 뒤로
      goal.order = existing.category === goal.category ? existing.order : nextOrder(goal.member, goal.category, existing.id);
    } else {
      goal.order = nextOrder(goal.member, goal.category);
    }
    if (goal.order === undefined) delete goal.order;

    // 100%가 되었으면 축하 (내가 바꾼 것). 저장 전에 표시해 둬야 '가족이 달성' 축하와 겹치지 않는다.
    const justDone = existing && existing.progress < 100 && goal.progress >= 100;
    if (justDone) celebrated.add(existing.id);
    Store.saveGoal(goal);
    $("#goalDialog").close();
    if (justDone) celebrate(goal, true);
    // 다른 해 목표를 저장했으면 그 해로 이동
    if (goal.end < yearFirst() || goal.start > yearLast()) {
      state.year = Number(goal.start.slice(0, 4));
      state.scrollToToday = true;
      render();
    }
  }

  function onDelete() {
    if (!state.editingId) return;
    if (!confirm("이 목표를 지울까요?")) return;
    Store.removeGoal(state.editingId);
    $("#goalDialog").close();
    toast("목표를 지웠어요.");
  }

  // ---------- 바깥에서 쓰는 기능 ----------
  function changeYear(year) {
    state.year = year;
    state.scrollToToday = true;
    render();
  }

  function init(options = {}) {
    toast = options.toast || toast;
    onShowMember = options.onShowMember || onShowMember;
    renderCatPick();
    $("#goalForm").addEventListener("submit", onSubmit);
    $("#goalDeleteBtn").addEventListener("click", onDelete);
    $("#goalForm").progress.addEventListener("input", (e) => setProgress(Number(e.target.value)));
    document.querySelectorAll(".progress-quick button").forEach((b) =>
      b.addEventListener("click", () => {
        const form = $("#goalForm");
        if (b.dataset.set !== undefined) setProgress(Number(b.dataset.set));
        else setProgress(Number(form.progress.value) + Number(b.dataset.step));
      })
    );
    $("#prevYear").addEventListener("click", () => changeYear(state.year - 1));
    $("#nextYear").addEventListener("click", () => changeYear(state.year + 1));
    $("#thisYearBtn").addEventListener("click", () => changeYear(today.getFullYear()));

    document.querySelectorAll(".seg [data-zoom]").forEach((b) =>
      b.addEventListener("click", () => {
        state.zoom = b.dataset.zoom;
        state.scrollToToday = true;
        try {
          localStorage.setItem(ZOOM_KEY, state.zoom);
        } catch {
          /* 기억 못 해도 괜찮음 */
        }
        render();
      })
    );

    const search = $("#goalSearch");
    search.addEventListener("input", () => {
      state.rawQuery = search.value;
      state.query = norm(search.value);
      render();
    });
    search.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && search.value) {
        e.stopPropagation();
        search.value = "";
        search.dispatchEvent(new Event("input"));
      }
    });

    // 화면 폭이 바뀌면 일별 칸 너비가 달라지므로 다시 그린다
    window.matchMedia("(max-width: 640px)").addEventListener("change", () => {
      if (!$("#goalsPage").hidden) render();
    });
  }

  // ---------- 목표 달성 축하 ----------
  const celebrated = new Set(); // 이 화면에서 이미 축하한 목표 (같은 목표를 두 번 축하하지 않게)
  let seenGoals = null; // 지난번에 받은 목표의 달성률 { id: progress }

  function celebrate(goal, byMe) {
    const year = today.getFullYear();
    const count = state.goals.filter(
      (g) =>
        g.member === goal.member &&
        (g.id === goal.id ? goal.progress : g.progress) >= 100 &&
        g.end >= `${year}-01-01` &&
        g.start <= `${year}-12-31`
    ).length || 1;
    Celebrate.show({ who: memberName(goal.member), title: goal.title, count, byMe });
  }

  /** 다른 기기(가족)에서 100%가 된 목표를 찾아 축하한다. 처음 불러올 때는 축하하지 않는다. */
  function checkRemoteAchievements(list) {
    if (seenGoals) {
      const done = list.find(
        (g) => g.progress >= 100 && seenGoals[g.id] !== undefined && seenGoals[g.id] < 100 && !celebrated.has(g.id)
      );
      if (done) {
        celebrated.add(done.id);
        celebrate(done, false);
      }
    }
    seenGoals = Object.fromEntries(list.map((g) => [g.id, g.progress]));
    // 100% 아래로 내려간 목표는 다시 달성하면 또 축하할 수 있게
    list.forEach((g) => g.progress < 100 && celebrated.delete(g.id));
  }

  function setGoals(list) {
    checkRemoteAchievements(list);
    state.goals = list;
    if ($("#goalsPage").hidden) return;
    // 끄는 중에는 다시 그리지 않는다 (끝나면 저장 결과로 다시 그려짐)
    if (document.body.classList.contains("gantt-dragging")) return;
    render();
  }

  function show(member) {
    state.member = member;
    render();
  }

  return { init, setGoals, show, openNew: () => openForm(null) };
})();
