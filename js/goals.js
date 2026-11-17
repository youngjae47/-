// 구성원별 목표 간트차트 보드 (아빠 · 엄마 · 수현 탭)
// - 맨 위: 전체 달성률과 대분류(건강 · 가족 관계 · 자아실현)별 달성률
// - 아래: 1년을 12달로 펼친 간트차트. 대분류 아래 소분류 목표가 막대로 표시되고, 막대 안은 달성률만큼 채워진다.

const GoalsPage = (function () {
  const $ = (sel) => document.querySelector(sel);
  const pad = (n) => String(n).padStart(2, "0");
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const memberName = (id) => MEMBERS.find((m) => m.id === id)?.name || "";
  const DAY = 24 * 60 * 60 * 1000;

  const today = new Date();
  const todayKey = keyOf(today);
  const state = {
    member: "dad",
    year: today.getFullYear(),
    goals: [],
    editingId: null,
  };
  let toast = () => {};

  // ---------- 계산 ----------
  function utc(key) {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  }
  /** 날짜가 그 해에서 몇 % 지점인지 (0~100) */
  function yearPos(key) {
    const start = Date.UTC(state.year, 0, 1);
    const end = Date.UTC(state.year + 1, 0, 1);
    return ((utc(key) - start) / (end - start)) * 100;
  }
  function dayAfter(key) {
    const d = new Date(utc(key) + DAY);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  /** 고른 사람의, 고른 해에 걸쳐 있는 목표 */
  function visibleGoals() {
    const first = `${state.year}-01-01`;
    const last = `${state.year}-12-31`;
    return state.goals
      .filter((g) => g.member === state.member && g.start <= last && g.end >= first)
      .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  }
  /** 평균 달성률 (목표가 없으면 null) */
  function average(list) {
    if (!list.length) return null;
    return Math.round(list.reduce((s, g) => s + (Number(g.progress) || 0), 0) / list.length);
  }
  const rateText = (r) => (r === null ? "–" : `${r}%`);

  // ---------- 그리기 ----------
  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function render() {
    const page = $("#goalsPage");
    page.style.setProperty("--c", `var(--c-${state.member})`);
    $("#goalsTitle").textContent = `${memberName(state.member)}의 ${state.year}년 목표`;
    const goals = visibleGoals();
    renderSummary(goals);
    renderMonths();
    renderGantt(goals);
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
        card.append(
          el("p", "summary-label", `${c.icon} ${c.name}`),
          el("p", "summary-value", rateText(rate))
        );
        const meter = el("div", "meter");
        const fill = el("span");
        fill.style.width = `${rate || 0}%`;
        meter.append(fill);
        card.append(meter, el("p", "summary-sub", `목표 ${list.length}개`));
        return card;
      })
    );
  }

  function renderMonths() {
    $("#ganttMonths").replaceChildren(
      ...Array.from({ length: 12 }, (_, i) => {
        const s = el("span", "", `${i + 1}`);
        s.dataset.unit = "월";
        if (state.year === today.getFullYear() && i === today.getMonth()) s.className = "is-now";
        return s;
      })
    );
  }

  function renderGantt(goals) {
    const body = $("#ganttBody");
    const showToday = state.year === today.getFullYear();
    const todayPos = yearPos(todayKey);

    const groups = GOAL_CATEGORIES.map((c) => {
      const list = goals.filter((g) => g.category === c.id);
      const group = el("div", "gantt-group");

      const head = el("div", "gantt-cat");
      const name = el("span", "gantt-cat-name", `${c.icon} ${c.name}`);
      const rate = el("span", "gantt-cat-rate", rateText(average(list)));
      const add = el("button", "gantt-add", "＋ 추가");
      add.type = "button";
      add.setAttribute("aria-label", `${c.name} 목표 추가`);
      add.addEventListener("click", () => openForm(null, c.id));
      head.append(name, rate, add);
      group.append(head);

      if (!list.length) {
        group.append(el("p", "gantt-empty", "아직 목표가 없어요."));
        return group;
      }

      list.forEach((g) => {
        const row = el("button", "gantt-row");
        row.type = "button";
        if (g.progress >= 100) row.classList.add("is-done");
        row.setAttribute(
          "aria-label",
          `${g.title}, ${g.start}부터 ${g.end}까지, 달성률 ${g.progress}%`
        );

        const label = el("div", "gantt-label");
        label.append(el("span", "gantt-title", g.title), el("span", "gantt-rate", `${g.progress}%`));

        const track = el("div", "gantt-track");
        const from = g.start < `${state.year}-01-01` ? `${state.year}-01-01` : g.start;
        const to = g.end > `${state.year}-12-31` ? `${state.year}-12-31` : g.end;
        const left = yearPos(from);
        // 끝 날짜 하루를 포함하도록 "끝 다음 날"까지 칠한다 (너무 짧으면 최소 폭)
        const width = Math.max(yearPos(dayAfter(to)) - left, 0.8);
        const bar = el("div", "gantt-bar");
        bar.style.left = `${left}%`;
        bar.style.width = `${width}%`;
        if (from !== g.start) bar.classList.add("cut-left");
        if (to !== g.end) bar.classList.add("cut-right");
        const fill = el("span", "gantt-fill");
        fill.style.width = `${g.progress}%`;
        bar.append(fill);
        if (g.progress >= 100) bar.append(el("span", "gantt-check", "✓"));
        track.append(bar);
        if (showToday) {
          const line = el("span", "today-line");
          line.style.left = `${todayPos}%`;
          track.append(line);
        }

        row.append(label, track);
        row.addEventListener("click", () => openForm(g));
        group.append(row);
      });
      return group;
    });
    body.replaceChildren(...groups);
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
      start: isThisYear ? todayKey : `${state.year}-01-01`,
      end: `${state.year}-12-31`,
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
    if (state.editingId) goal.id = state.editingId;

    Store.saveGoal(goal);
    $("#goalDialog").close();
    // 다른 해 목표를 저장했으면 그 해로 이동
    const y = Number(goal.start.slice(0, 4));
    if (goal.end < `${state.year}-01-01` || goal.start > `${state.year}-12-31`) {
      state.year = y;
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
  function init(options = {}) {
    toast = options.toast || toast;
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
    $("#prevYear").addEventListener("click", () => { state.year--; render(); });
    $("#nextYear").addEventListener("click", () => { state.year++; render(); });
    $("#thisYearBtn").addEventListener("click", () => { state.year = today.getFullYear(); render(); });
  }

  function setGoals(list) {
    state.goals = list;
    if (!$("#goalsPage").hidden) render();
  }

  function show(member) {
    state.member = member;
    render();
  }

  return { init, setGoals, show, openNew: () => openForm(null) };
})();
