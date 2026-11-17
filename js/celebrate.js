// 목표 달성 축하: 색종이 + 축하 창
// 움직임 줄이기 설정을 켠 사람에게는 색종이 없이 축하 창만 보여준다.

const Celebrate = (function () {
  const COLORS = ["#2e9e6a", "#3b74d6", "#d6457a", "#e08a1e", "#f2c94c", "#9b6bd6"];

  function confetti() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = document.createElement("canvas");
    canvas.className = "confetti";
    canvas.setAttribute("aria-hidden", "true");
    document.body.append(canvas);
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    // 화면 아래 양쪽에서 위로 쏘아 올린다
    const pieces = Array.from({ length: 160 }, (_, i) => {
      const fromLeft = i % 2 === 0;
      const angle = (fromLeft ? -60 : -120) + (Math.random() * 40 - 20);
      const speed = 9 + Math.random() * 9;
      return {
        x: fromLeft ? W * 0.1 : W * 0.9,
        y: H * 0.85,
        vx: Math.cos((angle * Math.PI) / 180) * speed,
        vy: Math.sin((angle * Math.PI) / 180) * speed,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        color: COLORS[i % COLORS.length],
      };
    });

    const start = performance.now();
    const DURATION = 2800;
    function frame(now) {
      const t = now - start;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = t > DURATION - 600 ? Math.max(0, (DURATION - t) / 600) : 1;
      pieces.forEach((p) => {
        p.vy += 0.32; // 중력
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)));
        ctx.restore();
      });
      if (t < DURATION) requestAnimationFrame(frame);
      else canvas.remove();
    }
    requestAnimationFrame(frame);
  }

  /** 받침 있는 이름은 '이'를 붙인다: 수현 → 수현이가, 아빠 → 아빠가 */
  function subject(name) {
    const last = name.charCodeAt(name.length - 1);
    const hasBatchim = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
    return `${name}${hasBatchim ? "이가" : "가"}`;
  }

  /**
   * 축하하기
   * @param {{who: string, title: string, count: number, byMe: boolean}} info
   */
  function show({ who, title, count, byMe }) {
    const dlg = document.querySelector("#celebrateDialog");
    document.querySelector("#celebrateTitle").textContent = byMe ? "축하해요! 🎉" : `${who} 목표 달성! 🎉`;
    document.querySelector("#celebrateText").textContent = byMe
      ? `‘${title}’ 목표를 100% 달성했어요!`
      : `${subject(who)} ‘${title}’ 목표를 달성했어요. 축하해 주세요!`;
    document.querySelector("#celebrateBadge").textContent = `🏅 ${who}의 올해 ${count}번째 달성`;
    if (!dlg.open) dlg.showModal();
    confetti();
  }

  return { show };
})();
