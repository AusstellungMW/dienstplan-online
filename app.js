/* =========================================================
   Dienstplan – Museum (Browser)
   app.js (full)
   - LocalStorage data
   - Calendar UI
   - Employee UI
   - Plan text modal (Plan anzeigen)
   - Robust modal close: X / button / overlay / ESC
   - Monday open dates
   - Export/Import JSON
   ========================================================= */

"use strict";

/* -----------------------------
   Config / constants
----------------------------- */
const SHIFT_MINUTES = 7 * 60 + 30; // 7:30

// statuses
const STATUS = {
  NONE: "NONE",
  SCHLOSS: "SCHLOSS",
  BUERGER: "BUERGER",
  KRANK: "KRANK",
  URLAUB: "URLAUB",
  AUSGL: "AUSGL",
};

// colors
const COLORS = {
  BORDEAUX: "#800020",
  MOOS_GREEN: "#1B5428",
  KRANK_RED: "#D00000",
  URLAUB_BLUE: "#2AA9E0",
  AUSGL_GRAY: "#6E6E6E",

  AMPEL_GREEN: "#2E7D32",
  AMPEL_YELLOW: "#F9A825",
  AMPEL_RED: "#C62828",
  AMPEL_GRAY: "#9E9E9E",
};

const LS_KEY = "dienstplan_museum_v1";

/* -----------------------------
   DOM helpers
----------------------------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function byId(id) {
  return document.getElementById(id);
}

function safeOn(el, evt, fn) {
  if (!el) return;
  el.addEventListener(evt, fn);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoDate(d) {
  // d: Date
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseISO(s) {
  // yyyy-mm-dd
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function weekdayMon0(dateObj) {
  // JS: Sun=0..Sat=6. We want Mon=0..Sun=6
  const w = dateObj.getDay();
  return (w + 6) % 7;
}

function isSunday(dateObj) {
  return weekdayMon0(dateObj) === 6;
}
function isMonday(dateObj) {
  return weekdayMon0(dateObj) === 0;
}
function isTuesday(dateObj) {
  return weekdayMon0(dateObj) === 1;
}

function monthNameDE(year, month1) {
  // month1: 1..12
  const d = new Date(year, month1 - 1, 1);
  return d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

function iterMonthDays(year, month1) {
  const first = new Date(year, month1 - 1, 1);
  const out = [];
  const m = first.getMonth();
  let cur = new Date(first);
  while (cur.getMonth() === m) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function monthDatesCalendar(year, month1) {
  // returns weeks: array of 7-date arrays (Mon..Sun)
  const first = new Date(year, month1 - 1, 1);
  const startDow = weekdayMon0(first); // 0..6
  const start = new Date(first);
  start.setDate(first.getDate() - startDow);

  const last = new Date(year, month1, 0); // last day of month
  const endDow = weekdayMon0(last);
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - endDow));

  const weeks = [];
  let cur = new Date(start);
  while (cur <= end) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

function minutesToHHMM(m) {
  const sign = m < 0 ? "-" : "";
  m = Math.abs(m);
  const h = Math.floor(m / 60);
  const mi = m % 60;
  return `${sign}${h}:${pad2(mi)}`;
}

function ampelColor(diffMinutes) {
  const ad = Math.abs(diffMinutes);
  if (ad <= SHIFT_MINUTES) return COLORS.AMPEL_GREEN;
  if (ad <= 2 * SHIFT_MINUTES) return COLORS.AMPEL_YELLOW;
  return COLORS.AMPEL_RED;
}

/* -----------------------------
   Data model (like your Python store)
----------------------------- */
function defaultState() {
  return {
    employees: [], // {id,name,weekly_minutes}
    plan: {
      day_entries: {}, // { "YYYY-MM-DD": { empId: {status:"SCHLOSS"} } }
      monday_open: [], // ["YYYY-MM-DD", ...]
    },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultState();
    const obj = JSON.parse(raw);
    if (!obj.plan) obj.plan = { day_entries: {}, monday_open: [] };
    obj.plan.day_entries ||= {};
    obj.plan.monday_open ||= [];
    obj.employees ||= [];
    return obj;
  } catch (e) {
    console.error("Load state failed:", e);
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function makeId(name) {
  let t = (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9 _-]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  if (!t) t = "mitarbeiter";
  t = t.slice(0, 24);
  let base = t;
  let i = 2;
  while (state.employees.some((e) => e.id === t)) {
    t = `${base}${i}`;
    i++;
  }
  return t;
}

function getStatus(dayISO, empId) {
  return state.plan.day_entries?.[dayISO]?.[empId]?.status || STATUS.NONE;
}

function setStatus(dayISO, empId, status) {
  state.plan.day_entries ||= {};
  state.plan.day_entries[dayISO] ||= {};
  state.plan.day_entries[dayISO][empId] = { status };
  saveState();
}

function clearStatus(dayISO, empId) {
  const m = state.plan.day_entries?.[dayISO];
  if (m && m[empId]) delete m[empId];
  if (m && Object.keys(m).length === 0) delete state.plan.day_entries[dayISO];
  saveState();
}

function isMondayOpen(dayISO) {
  return (state.plan.monday_open || []).includes(dayISO);
}

function addMondayOpen(dayISO) {
  state.plan.monday_open ||= [];
  if (!state.plan.monday_open.includes(dayISO)) {
    state.plan.monday_open.push(dayISO);
    state.plan.monday_open.sort();
    saveState();
  }
}

function removeMondayOpen(dayISO) {
  state.plan.monday_open ||= [];
  state.plan.monday_open = state.plan.monday_open.filter((x) => x !== dayISO);
  saveState();
}

function statusCountsAsCredit(st) {
  return (
    st === STATUS.SCHLOSS ||
    st === STATUS.BUERGER ||
    st === STATUS.URLAUB ||
    st === STATUS.KRANK ||
    st === STATUS.AUSGL
  );
}

function statusIsWorking(st) {
  return st === STATUS.SCHLOSS || st === STATUS.BUERGER;
}

/* -----------------------------
   Targets / monthly stats
   (NO ×4 bug, uses opening days)
----------------------------- */
function isDayOpen(dateObj) {
  if (isMonday(dateObj)) {
    return isMondayOpen(isoDate(dateObj));
  }
  return true;
}

function openDaysInMonth(year, month1) {
  return iterMonthDays(year, month1).filter((d) => isDayOpen(d)).length;
}

function targetMinutesMonth(empId, year, month1) {
  const emp = state.employees.find((e) => e.id === empId);
  if (!emp) return 0;
  const od = openDaysInMonth(year, month1);
  return Math.round(emp.weekly_minutes * (od / 7.0));
}

function calcEmployeeMonthStats(empId, year, month1) {
  const soll = targetMinutesMonth(empId, year, month1);
  let ist = 0;
  let sonntage = 0;

  for (const d of iterMonthDays(year, month1)) {
    const st = getStatus(isoDate(d), empId);
    if (statusCountsAsCredit(st)) ist += SHIFT_MINUTES;
    if (isSunday(d) && statusIsWorking(st)) sonntage += 1;
  }
  return { soll, ist, diff: ist - soll, sonntage };
}

/* -----------------------------
   Sunday fairness window (2-month)
----------------------------- */
function twoMonthWindow(year, month1) {
  if (month1 % 2 === 1) {
    let y2 = year,
      m2 = month1 + 1;
    if (m2 === 13) {
      m2 = 1;
      y2 += 1;
    }
    return [
      { y: year, m: month1 },
      { y: y2, m: m2 },
    ];
  } else {
    let y1 = year,
      m1 = month1 - 1;
    if (m1 === 0) {
      m1 = 12;
      y1 -= 1;
    }
    return [
      { y: y1, m: m1 },
      { y: year, m: month1 },
    ];
  }
}

function sundaySlotsInMonth(year, month1) {
  let slots = 0;
  for (const d of iterMonthDays(year, month1)) {
    if (isSunday(d)) slots += 2; // 2 workers each Sunday
  }
  return slots;
}

function actualSundaysInMonth(empId, year, month1) {
  let cnt = 0;
  for (const d of iterMonthDays(year, month1)) {
    if (isSunday(d)) {
      const st = getStatus(isoDate(d), empId);
      if (statusIsWorking(st)) cnt += 1;
    }
  }
  return cnt;
}

function actualSundaysInWindow(empId, year, month1) {
  const [a, b] = twoMonthWindow(year, month1);
  return (
    actualSundaysInMonth(empId, a.y, a.m) + actualSundaysInMonth(empId, b.y, b.m)
  );
}

function expectedSundaysInWindow(empId, year, month1) {
  const [a, b] = twoMonthWindow(year, month1);
  const totalSlots = sundaySlotsInMonth(a.y, a.m) + sundaySlotsInMonth(b.y, b.m);
  if (totalSlots <= 0) return 0;

  const weightsSum =
    state.employees.reduce((s, e) => s + (e.weekly_minutes || 0), 0) || 1;
  const emp = state.employees.find((e) => e.id === empId);
  if (!emp) return 0;

  return totalSlots * ((emp.weekly_minutes || 0) / weightsSum);
}

function hasSundayPreviousWeek(empId, dateObj) {
  const prev = new Date(dateObj);
  prev.setDate(prev.getDate() - 7);
  if (!isSunday(prev)) return false;
  return statusIsWorking(getStatus(isoDate(prev), empId));
}

function weekSunday(dateObj) {
  const d = new Date(dateObj);
  const wd = weekdayMon0(d); // Mon=0..Sun=6
  d.setDate(d.getDate() + (6 - wd));
  return d;
}

function hasSundayInSameWeek(empId, dateObj) {
  const sun = weekSunday(dateObj);
  return statusIsWorking(getStatus(isoDate(sun), empId));
}

/* -----------------------------
   Work streaks / weekly counts
----------------------------- */
function workedOnDay(empId, dateObj) {
  return statusIsWorking(getStatus(isoDate(dateObj), empId));
}

function consecutiveWorkDaysBefore(empId, dateObj) {
  let cnt = 0;
  const cur = new Date(dateObj);
  cur.setDate(cur.getDate() - 1);

  while (true) {
    if (!isDayOpen(cur)) break;
    if (workedOnDay(empId, cur)) {
      cnt += 1;
      cur.setDate(cur.getDate() - 1);
      if (cnt >= 10) break;
    } else break;
  }
  return cnt;
}

function isoWeekKey(dateObj) {
  // ISO week calc (Mon-based)
  const d = new Date(dateObj);
  d.setHours(0, 0, 0, 0);
  // Thursday in current week decides year
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNo =
    1 +
    Math.round(
      ((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    );
  return `${d.getFullYear()}-${weekNo}`;
}

function weekWorkCount(empId, dateObj) {
  const key = isoWeekKey(dateObj);
  let cnt = 0;

  const start = new Date(dateObj);
  start.setDate(start.getDate() - weekdayMon0(start)); // Monday of week

  for (let i = 0; i < 7; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    if (isoWeekKey(day) !== key) continue;
    if (statusIsWorking(getStatus(isoDate(day), empId))) cnt += 1;
  }
  return cnt;
}

function targetShiftsWeek(weeklyMinutes) {
  return Math.round((weeklyMinutes || 0) / SHIFT_MINUTES);
}

function creditShiftsInMonth(empId, year, month1) {
  let c = 0;
  for (const d of iterMonthDays(year, month1)) {
    if (statusCountsAsCredit(getStatus(isoDate(d), empId))) c += 1;
  }
  return c;
}

function workedShiftsInMonth(empId, year, month1) {
  let c = 0;
  for (const d of iterMonthDays(year, month1)) {
    if (statusIsWorking(getStatus(isoDate(d), empId))) c += 1;
  }
  return c;
}

/* -----------------------------
   AutoPlan (stabilizing, unpersönlich)
   + NEW: cap over target to +1 shift (soft, "A)")
----------------------------- */
function autoplanMonth(year, month1) {
  if (!state.employees.length) return "Keine Mitarbeiter vorhanden.";

  const empIds = state.employees.map((e) => e.id);

  // target shifts for month
  const targetsMonthShifts = {};
  for (const eid of empIds) {
    const tm = targetMinutesMonth(eid, year, month1);
    targetsMonthShifts[eid] = Math.round(tm / SHIFT_MINUTES);
  }

  // "how far from target" using CREDIT shifts (Urlaub/Krank/Ausgl keep ampel fair)
  function monthDeltaShifts(eid) {
    const doneCredit = creditShiftsInMonth(eid, year, month1);
    return doneCredit - (targetsMonthShifts[eid] || 0);
  }

  function isBlocked(dayISO, eid) {
    const st = getStatus(dayISO, eid);
    return (
      st === STATUS.KRANK ||
      st === STATUS.URLAUB ||
      st === STATUS.AUSGL ||
      st === STATUS.SCHLOSS ||
      st === STATUS.BUERGER
    );
  }

  function workingIds(dayISO) {
    const w = [];
    for (const eid of empIds) {
      const st = getStatus(dayISO, eid);
      if (statusIsWorking(st)) w.push(eid);
    }
    return w;
  }

  // scoring
  function scoreCandidate(eid, dateObj, isSun) {
    const emp = state.employees.find((e) => e.id === eid);
    const weekly = emp?.weekly_minutes || 0;

    let s = 0.0;

    const delta = monthDeltaShifts(eid); // >0 already above target
    // Strong: fill those who are under target
    s += (-delta) * 120.0;

    // A) cap over target to +1 shift (soft but very strong)
    // delta = credit - target
    // allow up to +1, punish > +1 extremely
    if (delta > 1) {
      s -= 5000.0 + (delta - 1) * 500.0;
    } else if (delta === 1) {
      s -= 80.0; // slight reluctance
    }

    // Weekly balance (work-based)
    const tw = targetShiftsWeek(weekly);
    const ww = weekWorkCount(eid, dateObj);
    if (ww > tw) s -= (ww - tw) * 60.0;
    else s += (tw - ww) * 10.0;

    // Avoid long streaks (no favorites)
    const streak = consecutiveWorkDaysBefore(eid, dateObj);
    if (streak >= 4) s -= 9999.0;
    else if (streak === 3) s -= 400.0;
    else if (streak === 2) s -= 120.0;
    else if (streak === 1) s -= 40.0;

    // tiny bonus for making 2-day blocks vs scattered (but not more)
    if (streak === 1) s += 15.0;

    // Tuesday penalty if had Sunday in same week (soft preference, not law)
    if (!isSun && isTuesday(dateObj) && hasSundayInSameWeek(eid, dateObj)) {
      s -= 500.0;
    }

    if (isSun) {
      // no Sundays two weeks in a row (if possible)
      if (hasSundayPreviousWeek(eid, dateObj)) s -= 9999.0;

      // fair Sundays in 2-month window by hours weights
      const actual = actualSundaysInWindow(eid, year, month1);
      const expected = expectedSundaysInWindow(eid, year, month1);
      const deficit = expected - actual;
      s += deficit * 250.0;

      // if far above target already, discourage Sunday too
      if (delta >= 2) s -= 200.0;
    }

    // small deterministic tie-breaker: stable order, not personal
    // (prevents "random favorites" due to sort stability differences)
    s += (eid.charCodeAt(0) % 7) * 0.0001;

    return s;
  }

  let filled = 0;

  for (const d of iterMonthDays(year, month1)) {
    if (!isDayOpen(d)) continue;

    const dayISO = isoDate(d);
    const needWorkers = isSunday(d) ? 2 : 5;

    const existing = workingIds(dayISO);
    const freeSlots = needWorkers - existing.length;
    if (freeSlots <= 0) continue;

    // candidates are strictly NONE only (do not touch manual entries)
    const candidates = [];
    for (const eid of empIds) {
      if (getStatus(dayISO, eid) !== STATUS.NONE) continue;
      candidates.push(eid);
    }
    if (!candidates.length) continue;

    const scored = [];
    for (const eid of candidates) {
      if (isBlocked(dayISO, eid)) continue;
      const sc = scoreCandidate(eid, d, isSunday(d));
      scored.push([sc, eid]);
    }
    if (!scored.length) continue;

    scored.sort((a, b) => b[0] - a[0]);
    const pick = scored.slice(0, freeSlots).map((x) => x[1]);

    for (const eid of pick) {
      // AutoPlan sets SCHLOSS always (your rule)
      setStatus(dayISO, eid, STATUS.SCHLOSS);
      filled += 1;
    }
  }

  return `AutoPlan für ${monthNameDE(year, month1)} abgeschlossen (nur leere Felder ergänzt, ${filled} Einträge).`;
}

/* -----------------------------
   UI bindings (IDs)
   If your HTML uses other IDs, rename here.
----------------------------- */
const UI = {
  empNameInput: byId("empNameInput") || byId("nameInput") || byId("employeeName"),
  addEmpBtn: byId("addEmpBtn") || byId("btnAddEmp") || byId("addEmployee"),
  empList: byId("empList") || byId("employeesList") || byId("employeeList"),

  prevMonthBtn: byId("prevMonthBtn") || byId("btnPrevMonth"),
  nextMonthBtn: byId("nextMonthBtn") || byId("btnNextMonth"),
  monthLabel: byId("monthLabel") || byId("lblMonth"),
  calendarGrid: byId("calendarGrid") || byId("calendar") || byId("calGrid"),

  statusBar: byId("statusBar") || byId("statusLabel"),

  btnMondayOpen: byId("btnMondayOpen") || byId("mondayOpenBtn"),
  btnPlan: byId("btnPlan") || byId("btnShowPlan"),
  btnAutoplan: byId("btnAutoplan") || byId("btnAutoPlan"),
  btnRefresh: byId("btnRefresh") || byId("btnAktualisieren"),

  btnExport: byId("btnExport") || byId("btnExportJSON"),
  btnImport: byId("btnImport") || byId("btnImportJSON"),
  fileImport: byId("fileImport") || byId("importFile") || byId("jsonFileInput"),

  // modals
  planModal: byId("planModal"),
  planText: byId("planText") || byId("planTextarea"),
  planCloseX: byId("planCloseX") || byId("planModalCloseX"),
  planCloseBtn: byId("planCloseBtn") || byId("planModalCloseBtn"),
  planCopyBtn: byId("planCopyBtn") || byId("planModalCopyBtn"),

  // optional profile modal (if you have it)
  profileModal: byId("profileModal"),
  profileCloseX: byId("profileCloseX"),
  profileCloseBtn: byId("profileCloseBtn"),
};

function warnMissingUI() {
  const required = [
    "empNameInput",
    "addEmpBtn",
    "empList",
    "prevMonthBtn",
    "nextMonthBtn",
    "monthLabel",
    "calendarGrid",
    "btnPlan",
    "btnAutoplan",
    "btnRefresh",
    "planModal",
    "planText",
  ];
  const missing = required.filter((k) => !UI[k]);
  if (missing.length) {
    console.warn(
      "⚠️ Missing UI elements (check your HTML ids):",
      missing
    );
  }
}

/* -----------------------------
   Global state
----------------------------- */
let state = loadState();
let view = (() => {
  const now = new Date();
  return { year: now.getFullYear(), month1: now.getMonth() + 1 };
})();
let selectedEmpId = null;

/* -----------------------------
   Modal handling (IRON SAFE)
----------------------------- */
function hide(el) {
  if (!el) return;
  el.classList.add("hidden");
  el.setAttribute("aria-hidden", "true");
}
function show(el) {
  if (!el) return;
  el.classList.remove("hidden");
  el.setAttribute("aria-hidden", "false");
}

function closePlanModal() {
  hide(UI.planModal);
}

function openPlanModal() {
  if (!UI.planModal || !UI.planText) return;
  UI.planText.value = buildMonthPlanText(view.year, view.month1);
  show(UI.planModal);
  // focus for usability
  try {
    UI.planText.focus();
  } catch (_) {}
}

function closeProfile() {
  hide(UI.profileModal);
}

/* -----------------------------
   Build month plan text (like Tk list view)
----------------------------- */
function dayWorkers(dateObj) {
  const out = [];
  for (const emp of state.employees) {
    const st = getStatus(isoDate(dateObj), emp.id);
    if (st === STATUS.SCHLOSS || st === STATUS.BUERGER) out.push({ name: emp.name, st });
  }
  return out;
}

function buildMonthPlanText(year, month1) {
  const wd = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  const lines = [];
  for (const d of iterMonthDays(year, month1)) {
    const iso = isoDate(d);

    if (isMonday(d) && !isMondayOpen(iso)) {
      lines.push(`${pad2(d.getDate())}.${pad2(month1)}.${year} (${wd[weekdayMon0(d)]}): geschlossen`);
      continue;
    }

    const workers = dayWorkers(d);
    if (!workers.length) {
      lines.push(`${pad2(d.getDate())}.${pad2(month1)}.${year} (${wd[weekdayMon0(d)]}): —`);
    } else {
      const parts = workers.map((w) => `${w.name} (${w.st === STATUS.SCHLOSS ? "S" : "B"})`);
      lines.push(`${pad2(d.getDate())}.${pad2(month1)}.${year} (${wd[weekdayMon0(d)]}): ${parts.join(", ")}`);
    }
  }

  const header = [
    `Monat: ${monthNameDE(year, month1)}`,
    "Hinweis: Diese Ansicht zeigt nur die eingeteilten Dienste (S/B) als Tagesliste.",
    "",
  ];
  return header.concat(lines).join("\n");
}

/* -----------------------------
   Employees UI
----------------------------- */
function renderEmployees() {
  if (!UI.empList) return;
  UI.empList.innerHTML = "";

  for (const emp of state.employees) {
    const row = document.createElement("div");
    row.className = "emp-row";

    const btnTrash = document.createElement("button");
    btnTrash.className = "emp-trash";
    btnTrash.textContent = "🗑";
    btnTrash.title = "Löschen";
    btnTrash.onclick = () => deleteEmployee(emp.id);

    const btnName = document.createElement("button");
    btnName.className = "emp-name";
    btnName.textContent = emp.name;
    btnName.onclick = () => toggleSelectEmployee(emp.id);

    if (selectedEmpId === emp.id) btnName.classList.add("selected");

    const ampel = document.createElement("span");
    ampel.className = "emp-ampel";
    const stats = calcEmployeeMonthStats(emp.id, view.year, view.month1);
    ampel.style.background = ampelColor(stats.diff);
    ampel.title = `Soll: ${minutesToHHMM(stats.soll)} | Ist: ${minutesToHHMM(stats.ist)} | Diff: ${minutesToHHMM(stats.diff)} | So: ${stats.sonntage}`;

    row.appendChild(btnTrash);
    row.appendChild(btnName);
    row.appendChild(ampel);

    UI.empList.appendChild(row);
  }
}

function toggleSelectEmployee(empId) {
  selectedEmpId = selectedEmpId === empId ? null : empId;
  renderEmployees();
  renderCalendar();
  setStatusText(selectedEmpId ? "Mitarbeiter ausgewählt." : "Kein Mitarbeiter ausgewählt.");
}

function addEmployee() {
  const name = (UI.empNameInput?.value || "").trim();
  if (!name) {
    setStatusText("Bitte Name eingeben.");
    return;
  }

  // simple prompt for weekly hours
  const raw = prompt("Wochenstunden (z.B. 20:00 oder 29:15):", "20:00");
  if (raw === null) return;

  const weekly = parseWeekly(raw);
  if (weekly == null) {
    alert("Format bitte wie 20:00 oder 29:15 (Minuten 00/15/30/45).");
    return;
  }

  const id = makeId(name);
  state.employees.push({ id, name, weekly_minutes: weekly });
  saveState();

  UI.empNameInput.value = "";
  renderEmployees();
  renderCalendar();
  setStatusText("Gespeichert.");
}

function parseWeekly(s) {
  const m = String(s).trim().match(/^(\d{1,2})\s*:\s*(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (![0, 15, 30, 45].includes(mi)) return null;
  return h * 60 + mi;
}

function deleteEmployee(empId) {
  const emp = state.employees.find((e) => e.id === empId);
  if (!emp) return;
  if (!confirm(`${emp.name} wirklich löschen?`)) return;

  // remove employee and any plan entries for them
  state.employees = state.employees.filter((e) => e.id !== empId);
  for (const dayISO of Object.keys(state.plan.day_entries || {})) {
    const mapping = state.plan.day_entries[dayISO];
    if (mapping && mapping[empId]) delete mapping[empId];
    if (mapping && Object.keys(mapping).length === 0) delete state.plan.day_entries[dayISO];
  }
  saveState();

  if (selectedEmpId === empId) selectedEmpId = null;
  renderEmployees();
  renderCalendar();
  setStatusText("Gelöscht.");
}

/* -----------------------------
   Calendar UI
   (tries to match Tkinter look)
----------------------------- */
function renderCalendar() {
  if (!UI.calendarGrid || !UI.monthLabel) return;

  UI.monthLabel.textContent = monthNameDE(view.year, view.month1);
  UI.calendarGrid.innerHTML = "";

  const weeks = monthDatesCalendar(view.year, view.month1);

  // optional: weekday header if your HTML doesn't have it already
  // We add it here as first row for safety.
  const header = document.createElement("div");
  header.className = "cal-header";
  const headersFull = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
  for (const h of headersFull) {
    const cell = document.createElement("div");
    cell.className = "cal-header-cell";
    cell.textContent = h;
    header.appendChild(cell);
  }
  UI.calendarGrid.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "cal-grid-body";
  UI.calendarGrid.appendChild(grid);

  for (const week of weeks) {
    const row = document.createElement("div");
    row.className = "cal-row";

    for (const d of week) {
      const dayISO = isoDate(d);
      const inMonth = d.getMonth() === (view.month1 - 1);

      const cell = document.createElement("div");
      cell.className = "cal-cell";
      if (!inMonth) cell.classList.add("other-month");

      const top = document.createElement("div");
      top.className = "cal-top";

      const dayNum = document.createElement("div");
      dayNum.className = "cal-daynum";
      dayNum.textContent = d.getDate();

      const soMark = document.createElement("div");
      soMark.className = "cal-sunday-mark";
      soMark.textContent = isSunday(d) ? "So" : "";

      top.appendChild(dayNum);
      top.appendChild(soMark);

      const btns = document.createElement("div");
      btns.className = "cal-btns";

      const b1 = mkDayBtn("Schloss", () => setDayStatus(d, STATUS.SCHLOSS));
      const b2 = mkDayBtn("Bürger", () => setDayStatus(d, STATUS.BUERGER));
      const b3 = mkDayBtn("Krank", () => setDayStatus(d, STATUS.KRANK));
      const b4 = mkDayBtn("Urlaub", () => setDayStatus(d, STATUS.URLAUB));
      const b5 = mkDayBtn("Ausgl.", () => setDayStatus(d, STATUS.AUSGL));

      btns.appendChild(b1);
      btns.appendChild(b2);
      btns.appendChild(b3);
      btns.appendChild(b4);
      btns.appendChild(b5);

      // monday closed hint
      if (isMonday(d) && !isMondayOpen(dayISO)) {
        cell.classList.add("monday-closed");
      }

      cell.appendChild(top);
      cell.appendChild(btns);

      // paint selected employee status
      if (selectedEmpId && inMonth) {
        const st = getStatus(dayISO, selectedEmpId);
        paintCellByStatus(cell, st);
      }

      row.appendChild(cell);
    }

    grid.appendChild(row);
  }
}

function mkDayBtn(label, onClick) {
  const b = document.createElement("button");
  b.className = "day-btn";
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

function paintCellByStatus(cell, st) {
  cell.style.setProperty("--cellColor", "");

  if (st === STATUS.SCHLOSS) cell.style.setProperty("--cellColor", COLORS.BORDEAUX);
  else if (st === STATUS.BUERGER) cell.style.setProperty("--cellColor", COLORS.MOOS_GREEN);
  else if (st === STATUS.KRANK) cell.style.setProperty("--cellColor", COLORS.KRANK_RED);
  else if (st === STATUS.URLAUB) cell.style.setProperty("--cellColor", COLORS.URLAUB_BLUE);
  else if (st === STATUS.AUSGL) cell.style.setProperty("--cellColor", COLORS.AUSGL_GRAY);

  // Your CSS should use --cellColor to paint background; if not,
  // we do a direct fallback:
  if (st !== STATUS.NONE) {
    const col = cell.style.getPropertyValue("--cellColor");
    cell.style.background = col;
    cell.style.color = "#fff";
  }
}

function setDayStatus(dateObj, status) {
  if (!selectedEmpId) {
    setStatusText("Bitte zuerst einen Mitarbeiter auswählen.");
    return;
  }

  const dayISO = isoDate(dateObj);

  if (isMonday(dateObj) && !isMondayOpen(dayISO)) {
    setStatusText("Montag ist geschlossen (Ausnahme über „Montag öffnen…“).");
    return;
  }

  const current = getStatus(dayISO, selectedEmpId);
  if (current === status) clearStatus(dayISO, selectedEmpId);
  else setStatus(dayISO, selectedEmpId, status);

  renderCalendar();
  renderEmployees();
  setStatusText("Geändert.");
}

/* -----------------------------
   Month navigation
----------------------------- */
function prevMonth() {
  let y = view.year;
  let m = view.month1 - 1;
  if (m === 0) {
    m = 12;
    y -= 1;
  }
  view.year = y;
  view.month1 = m;
  renderEmployees();
  renderCalendar();
}

function nextMonth() {
  let y = view.year;
  let m = view.month1 + 1;
  if (m === 13) {
    m = 1;
    y += 1;
  }
  view.year = y;
  view.month1 = m;
  renderEmployees();
  renderCalendar();
}

/* -----------------------------
   Monday open dialog (simple prompt)
----------------------------- */
function mondayOpenPrompt() {
  const s = prompt("Montag öffnen – Datum eingeben (TT.MM.JJJJ):", "");
  if (s === null) return;

  const m = String(s).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) {
    alert("Bitte Format TT.MM.JJJJ");
    return;
  }

  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yy = Number(m[3]);

  const d = new Date(yy, mm - 1, dd);
  if (Number.isNaN(d.getTime())) {
    alert("Ungültiges Datum.");
    return;
  }
  if (!isMonday(d)) {
    alert("Dieses Datum ist kein Montag.");
    return;
  }

  const iso = isoDate(d);
  if (isMondayOpen(iso)) {
    if (confirm("Montag ist bereits geöffnet. Entfernen?")) {
      removeMondayOpen(iso);
    }
  } else {
    addMondayOpen(iso);
  }

  renderEmployees();
  renderCalendar();
  setStatusText("Montag-Öffnung aktualisiert.");
}

/* -----------------------------
   Export / Import JSON
----------------------------- */
function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "dienstplan_export.json";
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
  setStatusText("Export erstellt.");
}

function importJSONFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(String(reader.result || confirm));
      if (!obj || typeof obj !== "object") throw new Error("Bad JSON");

      // validate minimal structure
      obj.employees ||= [];
      obj.plan ||= { day_entries: {}, monday_open: [] };
      obj.plan.day_entries ||= {};
      obj.plan.monday_open ||= [];

      state = obj;
      saveState();

      selectedEmpId = null;
      renderEmployees();
      renderCalendar();
      setStatusText("Import OK.");
      alert("Import OK.");
    } catch (e) {
      console.error(e);
      alert("Import fehlgeschlagen: Datei ist kein gültiger Dienstplan-Export.");
    }
  };
  reader.readAsText(file);
}

/* -----------------------------
   Status bar
----------------------------- */
function setStatusText(s) {
  if (UI.statusBar) UI.statusBar.textContent = s;
}

/* -----------------------------
   Init – IMPORTANT: prevent stuck modal
----------------------------- */
function initModalsIronSafe() {
  // --- SAFETY: hide modals on startup (your bug) ---
  hide(UI.planModal);
  hide(UI.profileModal);

  // close controls
  safeOn(UI.planCloseX, "click", closePlanModal);
  safeOn(UI.planCloseBtn, "click", closePlanModal);

  // click overlay to close
  safeOn(UI.planModal, "click", (e) => {
    if (e.target === UI.planModal) closePlanModal();
  });

  // copy
  safeOn(UI.planCopyBtn, "click", () => {
    if (!UI.planText) return;
    UI.planText.select();
    document.execCommand("copy");
    setStatusText("Plan in Zwischenablage kopiert.");
  });

  // ESC closes any open modal
  safeOn(document, "keydown", (e) => {
    if (e.key === "Escape") {
      closePlanModal();
      closeProfile();
    }
  });
}

function initUI() {
  safeOn(UI.addEmpBtn, "click", addEmployee);

  safeOn(UI.empNameInput, "keydown", (e) => {
    if (e.key === "Enter") addEmployee();
  });

  safeOn(UI.prevMonthBtn, "click", prevMonth);
  safeOn(UI.nextMonthBtn, "click", nextMonth);

  safeOn(UI.btnPlan, "click", openPlanModal);

  safeOn(UI.btnAutoplan, "click", () => {
    const ok = confirm(
      `AutoPlan für ${monthNameDE(view.year, view.month1)} starten?\n\n` +
        "Regeln:\n" +
        "- Ergänzt nur leere Felder (NONE)\n" +
        "- Respektiert manuelle Einträge und Krank/Urlaub/Ausgl.\n" +
        "- Monatsziel nach Öffnungstagen (nicht ×4)\n" +
        "- Sonntage fair im 2-Monats-Fenster (nach Stunden)\n" +
        "- Keine Sonntage zwei Wochen подряд (wenn möglich)\n" +
        "- Dienstag nach Sonntag in derselben Woche wird gemieden\n" +
        "- Keine Lieblingskandidaten: Strafpunkte für Serien\n" +
        "- Ziel: möglichst grün/gelb\n" +
        "- NEU: Überschreiten des Ziels > +1 Schicht wird hart bestraft\n" +
        "- AutoPlan setzt SCHLOSS\n"
    );
    if (!ok) return;

    const res = autoplanMonth(view.year, view.month1);
    renderEmployees();
    renderCalendar();
    setStatusText(res);
    alert(res);
  });

  safeOn(UI.btnRefresh, "click", () => {
    renderEmployees();
    renderCalendar();
    setStatusText("Aktualisiert.");
  });

  safeOn(UI.btnMondayOpen, "click", mondayOpenPrompt);

  safeOn(UI.btnExport, "click", exportJSON);

  safeOn(UI.btnImport, "click", () => {
    if (UI.fileImport) UI.fileImport.click();
    else alert("Import: file input not found (id fileImport/importFile/jsonFileInput).");
  });

  safeOn(UI.fileImport, "change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    importJSONFromFile(file);
    e.target.value = "";
  });
}

function init() {
  warnMissingUI();
  initModalsIronSafe();
  initUI();
  renderEmployees();
  renderCalendar();
  setStatusText("Bereit.");
}

/* -----------------------------
   Start
   (Run after DOM ready to avoid your modal bug)
----------------------------- */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
