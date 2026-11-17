// 반복 일정 계산
// 일정 하나에 반복 규칙을 저장해 두고, 달력을 그릴 때 날짜마다 "이 날 해당되나?"를 계산한다.
//
// 일정의 반복 관련 필드
//   repeat      : "" | "daily" | "weekly" | "monthly" | "yearly"
//   repeatDays  : 매주 반복할 요일 [0(일)~6(토)]. 비어 있으면 시작 날짜의 요일
//   repeatUntil : 반복이 끝나는 날 "YYYY-MM-DD" (비어 있으면 계속)
//   exdates     : 반복에서 빠진 날짜 목록 ("이 날만 지우기 · 고치기"로 생김)

const REPEAT_LABEL = {
  daily: "매일",
  weekly: "매주",
  monthly: "매월",
  yearly: "매년",
};
const WEEKDAY_SHORT = ["일", "월", "화", "수", "목", "금", "토"];

function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d, dow: new Date(y, m - 1, d).getDay() };
}

/** 매주 반복 요일 (지정이 없으면 시작 날짜의 요일) */
function weeklyDays(event) {
  const days = Array.isArray(event.repeatDays) ? event.repeatDays : [];
  return days.length ? days : [parseDateKey(event.start).dow];
}

/** 이 일정이 key 날짜에 보여야 하나 */
function occursOn(event, key) {
  if (!event.repeat) {
    return event.start <= key && key <= (event.end || event.start);
  }
  if (key < event.start) return false;
  if (event.repeatUntil && key > event.repeatUntil) return false;
  if (Array.isArray(event.exdates) && event.exdates.includes(key)) return false;

  const s = parseDateKey(event.start);
  const k = parseDateKey(key);
  switch (event.repeat) {
    case "daily":
      return true;
    case "weekly":
      return weeklyDays(event).includes(k.dow);
    case "monthly":
      return k.d === s.d; // 31일처럼 없는 달은 건너뜀
    case "yearly":
      return k.m === s.m && k.d === s.d; // 2월 29일은 윤년에만
    default:
      return false;
  }
}

/** "매주 화·목", "매월 15일", "매년 3월 2일" 같은 설명 */
function describeRepeat(event) {
  if (!event.repeat) return "";
  const s = parseDateKey(event.start);
  let text = REPEAT_LABEL[event.repeat] || "";
  if (event.repeat === "weekly") {
    const days = [...weeklyDays(event)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // 월요일부터
    text += " " + days.map((d) => WEEKDAY_SHORT[d]).join("·");
  }
  if (event.repeat === "monthly") text += ` ${s.d}일`;
  if (event.repeat === "yearly") text += ` ${s.m}월 ${s.d}일`;
  if (event.repeatUntil) {
    const u = parseDateKey(event.repeatUntil);
    text += ` (${u.y}. ${u.m}. ${u.d}.까지)`;
  }
  return text;
}
