/* =============================
   Dienstplan – Browser Version
   (Tkinter-ähnliches UI)
   Speicher: LocalStorage + Export/Import
============================= */

const BORDEAUX = "#800020";
const MOOS_GREEN = "#1B5428";
const KRANK_RED = "#D00000";
const URLAUB_BLUE = "#2AA9E0";
const AUSGL_GRAY = "#6E6E6E";

const AMPEL_GREEN = "#2E7D32";
const AMPEL_YELLOW = "#F9A825";
const AMPEL_RED = "#C62828";
const AMPEL_GRAY = "#9E9E9E";

const SHIFT_MINUTES = 7 * 60 + 30; // 450

const LS_KEY = "dienstplan_store_v1";

/* ---------- Helpers ---------- */
function pad2(n){ return String(n).padStart(2,"0"); }

function minutesToHHMM(m){
  const sign = m < 0 ? "-" : "";
  m = Math.abs(m);
  const h = Math.floor(m/60);
  const mi = m % 60;
  return `${sign}${h}:${pad2(mi)}`;
}

function parseDEDate(s){
  const t = (s||"").trim();
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(t);
  if(!m) return null;
  const dd = Number(m[1]), mm = Number(m[2]), yy = Number(m[3]);
  const d = new Date(yy, mm-1, dd);
  if(d.getFullYear() !== yy || d.getMonth() !== mm-1 || d.getDate() !== dd) return null;
  return d;
}

function isoDate(d){
  const y = d.getFullYear();
  const m = pad2(d.getMonth()+1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function fromISO(iso){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if(!m) return null;
  return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
}

function isSunday(d){ return d.getDay() === 0; }  // JS: Sun=0
function isMonday(d){ return d.getDay() === 1; }
function isTuesday(d){ return d.getDay() === 2; }

function monthNameDE(year, month1to12){
  const d = new Date(year, month1to12-1, 1);
  return d.toLocaleDateString("de-DE", {month:"long", year:"numeric"});
}

function daysInMonth(year, month1to12){
  return new Date(year, month1to12, 0).getDate();
}

function* iterMonthDays(year, month1to12){
  const last = daysInMonth(year, month1to12);
  for(let day=1; day<=last; day++){
    yield new Date(year, month1to12-1, day);
  }
}

/* ISO week key: (isoYear, isoWeek) */
function isoWeekKey(date){
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear,0,1));
  const isoWeek = Math.ceil((((d - yearStart)/86400000) + 1) / 7);
  return `${isoYear}-${pad2(isoWeek)}`;
}

function weekSunday(date){
  // Sunday of same Mon..Sun week
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const jsDay = d.getDay(); // Sun=0..Sat=6
  const weekdayMon0 = (jsDay + 6) % 7; // Mon=0..Sun=6
  const delta = 6 - weekdayMon0;
  d.setDate(d.getDate() + delta);
  return d;
}

/* ---------- DataStore ---------- */
class DataStore {
  constructor(){
    this.employees = [];
    this.plan = { day_entries:{}, monday_open:[] };
    this.load();
  }

  load(){
    const raw = localStorage.getItem(LS_KEY);
    if(raw){
      try{
        const obj = JSON.parse(raw);
        this.employees = Array.isArray(obj.employees) ? obj.employees : [];
        this.plan = obj.plan && typeof obj.plan === "object" ? obj.plan : {day_entries:{}, monday_open:[]};
      }catch{
        this.employees = [];
        this.plan = { day_entries:{}, monday_open:[] };
      }
    }
    this.plan.day_entries ??= {};
    this.plan.monday_open ??= [];
  }

  save(){
    localStorage.setItem(LS_KEY, JSON.stringify({employees:this.employees, plan:this.plan}, null, 2));
  }

  makeId(name){
    let t = (name||"").toLowerCase().replace(/[^a-z0-9 _-]/g,"").trim().replace(/\s+/g,"_");
    if(!t) t = "mitarbeiter";
    return t.slice(0,24);
  }

  addEmployee(name, weekly_minutes){
    let id = this.makeId(name);
    const base = id;
    let i = 2;
    while(this.employees.some(e => e.id === id)){
      id = `${base}${i}`;
      i++;
    }
    this.employees.push({id, name, weekly_minutes});
    this.save();
    return id;
  }

  updateEmployeeHours(id, weekly_minutes){
    const e = this.employees.find(x=>x.id===id);
    if(!e) return;
    e.weekly_minutes = weekly_minutes;
    this.save();
  }

  deleteEmployee(id){
    this.employees = this.employees.filter(e=>e.id!==id);
    const de = this.plan.day_entries || {};
    for(const dayIso of Object.keys(de)){
      if(de[dayIso] && de[dayIso][id]){
        delete de[dayIso][id];
        if(Object.keys(de[dayIso]).length === 0) delete de[dayIso];
      }
    }
    this.save();
  }

  setStatus(dayIso, empId, status){
    this.plan.day_entries ??= {};
    this.plan.day_entries[dayIso] ??= {};
    this.plan.day_entries[dayIso][empId] = {status};
    this.save();
  }

  clearStatus(dayIso, empId){
    const de = this.plan.day_entries || {};
    if(de[dayIso] && de[dayIso][empId]){
      delete de[dayIso][empId];
      if(Object.keys(de[dayIso]).length===0) delete de[dayIso];
      this.save();
    }
  }

  getStatus(dayIso, empId){
    const m = this.plan.day_entries?.[dayIso];
    return m?.[empId]?.status ?? "NONE";
  }

  isMondayOpen(dayIso){
    return (this.plan.monday_open || []).includes(dayIso);
  }
  addMondayOpen(dayIso){
    this.plan.monday_open ??= [];
    if(!this.plan.monday_open.includes(dayIso)){
      this.plan.monday_open.push(dayIso);
      this.plan.monday_open.sort();
      this.save();
    }
  }
  removeMondayOpen(dayIso){
    this.plan.monday_open ??= [];
    const i = this.plan.monday_open.indexOf(dayIso);
    if(i>=0){
      this.plan.monday_open.splice(i,1);
      this.save();
    }
  }
}

/* ---------- Fair calculations ---------- */
function isDayOpen(store, d){
  if(isMonday(d)){
    return store.isMondayOpen(isoDate(d));
  }
  return true;
}

function openDaysInMonth(store, year, month){
  let c = 0;
  for(const d of iterMonthDays(year, month)){
    if(isDayOpen(store, d)) c++;
  }
  return c;
}

function targetMinutesMonth(store, empId, year, month){
  const emp = store.employees.find(e=>e.id===empId);
  if(!emp) return 0;
  const od = openDaysInMonth(store, year, month);
  return Math.round(emp.weekly_minutes * (od/7.0));
}

function statusCountsAsCredit(st){
  return ["SCHLOSS","BUERGER","URLAUB","KRANK","AUSGL"].includes(st);
}
function statusIsWorking(st){
  return ["SCHLOSS","BUERGER"].includes(st);
}

function calcEmployeeMonthStats(store, empId, year, month){
  const soll = targetMinutesMonth(store, empId, year, month);
  let ist = 0;
  let sonntage = 0;
  for(const d of iterMonthDays(year, month)){
    const st = store.getStatus(isoDate(d), empId);
    if(statusCountsAsCredit(st)) ist += SHIFT_MINUTES;
    if(isSunday(d) && statusIsWorking(st)) sonntage += 1;
  }
  return { soll, ist, diff: (ist - soll), sonntage };
}

function ampelColor(diffMinutes){
  const ad = Math.abs(diffMinutes);
  if(ad <= SHIFT_MINUTES) return AMPEL_GREEN;
  if(ad <= 2*SHIFT_MINUTES) return AMPEL_YELLOW;
  return AMPEL_RED;
}

/* ---------- Sunday fairness (2-month window) ---------- */
function twoMonthWindow(year, month){
  if(month % 2 === 1){
    let y2 = year, m2 = month+1;
    if(m2===13){ m2=1; y2++; }
    return [[year,month],[y2,m2]];
  }else{
    let y1 = year, m1 = month-1;
    if(m1===0){ m1=12; y1--; }
    return [[y1,m1],[year,month]];
  }
}

function sundaySlotsInMonth(year, month){
  let slots = 0;
  for(const d of iterMonthDays(year, month)){
    if(isSunday(d)) slots += 2;
  }
  return slots;
}

function actualSundaysInMonth(store, empId, year, month){
  let cnt = 0;
  for(const d of iterMonthDays(year, month)){
    if(isSunday(d)){
      const st = store.getStatus(isoDate(d), empId);
      if(statusIsWorking(st)) cnt++;
    }
  }
  return cnt;
}

function actualSundaysInWindow(store, empId, year, month){
  const [[y1,m1],[y2,m2]] = twoMonthWindow(year, month);
  return actualSundaysInMonth(store, empId, y1, m1) + actualSundaysInMonth(store, empId, y2, m2);
}

function expectedSundaysInWindow(store, empId, year, month){
  const [[y1,m1],[y2,m2]] = twoMonthWindow(year, month);
  const totalSlots = sundaySlotsInMonth(y1,m1) + sundaySlotsInMonth(y2,m2);
  if(totalSlots<=0) return 0;
  const sumWeights = store.employees.reduce((a,e)=>a+(e.weekly_minutes||0), 0) || 1;
  const emp = store.employees.find(e=>e.id===empId);
  if(!emp) return 0;
  return totalSlots * (emp.weekly_minutes / sumWeights);
}

function hasSundayPreviousWeek(store, empId, d){
  const prev = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  prev.setDate(prev.getDate()-7);
  if(!isSunday(prev)) return false;
  const st = store.getStatus(isoDate(prev), empId);
  return statusIsWorking(st);
}

function hasSundayInSameWeek(store, empId, d){
  const sun = weekSunday(d);
  const st = store.getStatus(isoDate(sun), empId);
  return statusIsWorking(st);
}

/* ---------- streaks / weekly ---------- */
function workedOnDay(store, empId, d){
  return statusIsWorking(store.getStatus(isoDate(d), empId));
}

function consecutiveWorkDaysBefore(store, empId, d){
  let cnt = 0;
  const cur = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  cur.setDate(cur.getDate()-1);
  while(true){
    if(!isDayOpen(store, cur)) break;
    if(workedOnDay(store, empId, cur)){
      cnt++;
      cur.setDate(cur.getDate()-1);
      if(cnt>=10) break;
    }else break;
  }
  return cnt;
}

function weekWorkCount(store, empId, d){
  const key = isoWeekKey(d);
  let cnt = 0;
  // compute Monday of ISO-like week in local terms: (Mon..Sun)
  const jsDay = d.getDay(); // Sun=0
  const weekdayMon0 = (jsDay + 6) % 7; // Mon=0..Sun=6
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  start.setDate(start.getDate() - weekdayMon0);
  for(let i=0;i<7;i++){
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate()+i);
    if(isoWeekKey(day)!==key) continue;
    if(statusIsWorking(store.getStatus(isoDate(day), empId))) cnt++;
  }
  return cnt;
}

function targetShiftsWeek(weekly_minutes){
  return Math.round((weekly_minutes||0) / SHIFT_MINUTES);
}

function creditShiftsInMonth(store, empId, year, month){
  let c = 0;
  for(const d of iterMonthDays(year, month)){
    if(statusCountsAsCredit(store.getStatus(isoDate(d), empId))) c++;
  }
  return c;
}

/* ---------- AutoPlan logic ---------- */
/*
  Wichtige Regeln (wie bei dir):
  - ergänzt nur NONE
  - respektiert manuell + Krank/Urlaub/Ausgl
  - Monatsziel nach Öffnungstagen
  - Sonntage fair im 2-Monats-Fenster (gewichtete Stunden)
  - keine Sonntage zwei Wochen подряд (wenn möglich)
  - Dienstag-Preference nach Sonntag in Woche (nur Preference, nicht Gesetz)
  - "Lieblingskandidaten" vermeiden (Streak-Penalty)
  - Über Ziel: maximal +1 Schicht bevorzugt (A: erlauben +1)
*/
function autoplanMonth(store, year, month){
  if(store.employees.length===0) return "Keine Mitarbeiter vorhanden.";

  const empIds = store.employees.map(e=>e.id);

  // targets in shifts for the month
  const targetsMonthShifts = {};
  for(const id of empIds){
    const tm = targetMinutesMonth(store, id, year, month);
    targetsMonthShifts[id] = Math.round(tm / SHIFT_MINUTES);
  }

  function isBlocked(dayIso, empId){
    const st = store.getStatus(dayIso, empId);
    return ["KRANK","URLAUB","AUSGL","SCHLOSS","BUERGER"].includes(st);
  }

  function workingIds(dayIso){
    const out = [];
    for(const id of empIds){
      if(statusIsWorking(store.getStatus(dayIso, id))) out.push(id);
    }
    return out;
  }

  function monthDeltaShifts(empId){
    const doneCredit = creditShiftsInMonth(store, empId, year, month);
    return doneCredit - (targetsMonthShifts[empId] || 0);
  }

  // hard-ish cap: allow overshoot only up to +1 shift (preference/penalty)
  function overshootPenalty(delta){
    // delta = done - target
    if(delta <= 1) return 0;
    return (delta - 1) * 800; // very strong penalty
  }

  function scoreCandidate(empId, d, isSun){
    const emp = store.employees.find(e=>e.id===empId);
    const weekly = emp?.weekly_minutes || 0;

    const delta = monthDeltaShifts(empId); // negative => needs shifts
    let s = 0;

    // main: push toward target (underfilled favored)
    s += (-delta) * 140;

    // penalize exceeding beyond +1 shift
    s -= overshootPenalty(delta);

    // weekly balance
    const tw = targetShiftsWeek(weekly);
    const ww = weekWorkCount(store, empId, d);
    if(ww > tw) s -= (ww - tw) * 70;
    else s += (tw - ww) * 10;

    // streak control
    const streak = consecutiveWorkDaysBefore(store, empId, d);
    if(streak >= 4) s -= 9999;
    else if(streak === 3) s -= 420;
    else if(streak === 2) s -= 140;
    else if(streak === 1) s -= 50;

    // tiny bonus for 2-day blocks (less “Zickzack”), but not longer
    if(streak === 1) s += 12;

    // Tuesday preference if Sunday in same week
    if(!isSun && isTuesday(d) && hasSundayInSameWeek(store, empId, d)){
      s -= 220; // preference only
    }

    if(isSun){
      // no Sundays two weeks in a row
      if(hasSundayPreviousWeek(store, empId, d)) s -= 9999;

      // fairness in 2-month window by weights
      const actual = actualSundaysInWindow(store, empId, year, month);
      const expected = expectedSundaysInWindow(store, empId, year, month);
      const deficit = expected - actual; // >0 needs Sundays
      s += deficit * 260;

      // if already above target, reduce Sunday probability
      if(delta >= 1) s -= 180;
    }

    return s;
  }

  let filled = 0;

  for(const d of iterMonthDays(year, month)){
    if(!isDayOpen(store, d)) continue;

    const dayIso = isoDate(d);
    const needWorkers = isSunday(d) ? 2 : 5;

    const existing = workingIds(dayIso);
    const freeSlots = needWorkers - existing.length;
    if(freeSlots <= 0) continue;

    const candidates = [];
    for(const empId of empIds){
      const st = store.getStatus(dayIso, empId);
      if(st !== "NONE") continue;
      if(isBlocked(dayIso, empId)) continue;
      candidates.push(empId);
    }

    if(candidates.length === 0) continue;

    const scored = candidates
      .map(id => [scoreCandidate(id, d, isSunday(d)), id])
      .filter(x => Number.isFinite(x[0]))
      .sort((a,b)=> b[0]-a[0]);

    if(scored.length === 0) continue;

    const picks = scored.slice(0, freeSlots).map(x=>x[1]);

    for(const empId of picks){
      store.setStatus(dayIso, empId, "SCHLOSS"); // AutoPlan setzt SCHLOSS
      filled++;
    }
  }

  return `AutoPlan für ${monthNameDE(year, month)} abgeschlossen (nur leere Felder ergänzt, ${filled} Einträge).`;
}

/* ---------- UI State ---------- */
const store = new DataStore();

let viewYear, viewMonth; // month: 1..12
let selectedEmpId = null;

function setStatusText(t){
  document.getElementById("statusText").textContent = t;
}

/* ---------- UI: Employees ---------- */
function renderEmployees(){
  const empList = document.getElementById("empList");
  empList.innerHTML = "";

  for(const emp of store.employees){
    const row = document.createElement("div");
    row.className = "empRow";

    const del = document.createElement("button");
    del.className = "btn small";
    del.textContent = "🗑";
    del.onclick = () => {
      if(confirm(`${emp.name} wirklich löschen?`)){
        if(selectedEmpId === emp.id) selectedEmpId = null;
        store.deleteEmployee(emp.id);
        renderEmployees();
        renderCalendar();
        setStatusText("Gelöscht.");
      }
    };

    const nameBtn = document.createElement("button");
    nameBtn.className = "empName" + (selectedEmpId === emp.id ? " selected" : "");
    nameBtn.textContent = emp.name;
    nameBtn.onclick = () => {
      selectedEmpId = (selectedEmpId === emp.id) ? null : emp.id;
      renderEmployees();
      paintCalendarForSelected();
      setStatusText(selectedEmpId ? `Ausgewählt: ${emp.name}` : "Auswahl aufgehoben.");
    };

    const ampel = document.createElement("div");
    ampel.className = "ampelDot";
    const {diff} = calcEmployeeMonthStats(store, emp.id, viewYear, viewMonth);
    ampel.style.background = ampelColor(diff);

    const prof = document.createElement("button");
    prof.className = "btn small";
    prof.textContent = "👤";
    prof.onclick = () => openProfile(emp.id);

    const clear = document.createElement("button");
    clear.className = "btn small";
    clear.textContent = "🧹";
    clear.onclick = () => {
      if(!confirm(`Nur SCHLOSS/BÜRGER für ${emp.name} im aktuellen Monat löschen?\n(Krank/Urlaub/Ausgl. bleiben erhalten)`)) return;
      for(const d of iterMonthDays(viewYear, viewMonth)){
        const di = isoDate(d);
        const st = store.getStatus(di, emp.id);
        if(st === "SCHLOSS" || st === "BUERGER"){
          store.clearStatus(di, emp.id);
        }
      }
      renderCalendar();
      renderEmployees();
      setStatusText("Monatliche Dienste gelöscht (S/B).");
    };

    row.append(del, nameBtn, ampel, prof, clear);
    empList.appendChild(row);
  }
}

/* ---------- UI: Profile ---------- */
let profileEmpId = null;

function openProfile(empId){
  profileEmpId = empId;
  const emp = store.employees.find(e=>e.id===empId);
  if(!emp) return;

  const modal = document.getElementById("profileModal");
  document.getElementById("profileTitle").textContent = `Mitarbeiterprofil – ${emp.name}`;

  const {soll, ist, diff, sonntage} = calcEmployeeMonthStats(store, empId, viewYear, viewMonth);

  const body = document.getElementById("profileBody");
  body.innerHTML = `
    <div style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">
      <div style="width:18px;height:18px;border-radius:6px;border:1px solid rgba(0,0,0,.35); background:${ampelColor(diff)}"></div>
      <div style="font-weight:800">${emp.name}</div>
    </div>

    <div><b>Wochenstunden:</b> ${minutesToHHMM(emp.weekly_minutes)} Std</div>
    <div><b>Monatsziel (nach Öffnungstagen):</b> ${minutesToHHMM(soll)} Std</div>
    <div><b>Gutschrift (Monat):</b> ${minutesToHHMM(ist)} Std</div>
    <div><b>Abweichung:</b> ${minutesToHHMM(diff)} Std</div>
    <div><b>Sonntage gearbeitet (Monat):</b> ${sonntage}</div>

    <div style="margin-top:10px; color:#555; font-size:13px;">
      Hinweis: Urlaub/Krank/Ausgleich zählt als voller Tag für Ampel/Saldo (wie in deiner Tkinter-Version).
    </div>
  `;

  modal.classList.remove("hidden");
}

function closeProfile(){
  document.getElementById("profileModal").classList.add("hidden");
  profileEmpId = null;
}

/* ---------- UI: Month plan list ---------- */
function buildMonthPlanText(year, month){
  const wd = ["So","Mo","Di","Mi","Do","Fr","Sa"]; // JS order
  const lines = [];
  lines.push(`Monat: ${monthNameDE(year, month)}`);
  lines.push(`Hinweis: Diese Ansicht zeigt nur die eingeteilten Dienste (S/B) als Tagesliste.`);
  lines.push("");

  for(const d of iterMonthDays(year, month)){
    const iso = isoDate(d);
    const isMonClosed = isMonday(d) && !store.isMondayOpen(iso);
    if(isMonClosed){
      const dd = pad2(d.getDate())+"."+pad2(d.getMonth()+1)+"."+d.getFullYear();
      lines.push(`${dd} (${wd[d.getDay()]}): geschlossen`);
      continue;
    }

    const workers = [];
    for(const emp of store.employees){
      const st = store.getStatus(iso, emp.id);
      if(st === "SCHLOSS" || st === "BUERGER"){
        workers.push(`${emp.name} (${st==="SCHLOSS" ? "S" : "B"})`);
      }
    }
    const dd = pad2(d.getDate())+"."+pad2(d.getMonth()+1)+"."+d.getFullYear();
    lines.push(`${dd} (${wd[d.getDay()]}): ${workers.length ? workers.join(", ") : "—"}`);
  }

  return lines.join("\n");
}

function openPlanModal(){
  const modal = document.getElementById("planModal");
  document.getElementById("planTitle").textContent = `Plan anzeigen – ${monthNameDE(viewYear, viewMonth)}`;
  const text = buildMonthPlanText(viewYear, viewMonth);
  const ta = document.getElementById("planText");
  ta.value = text;
  modal.classList.remove("hidden");
}

function closePlanModal(){
  document.getElementById("planModal").classList.add("hidden");
}

/* ---------- UI: Calendar ---------- */
function renderWeekHeader(){
  const header = document.getElementById("weekHeader");
  header.innerHTML = "";
  const names = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];
  for(const n of names){
    const div = document.createElement("div");
    div.className = "wh";
    div.textContent = n;
    header.appendChild(div);
  }
}

function monthDatesCalendar(year, month){
  // returns array of weeks, each week array of 7 Date objects (Mon..Sun), including prev/next month days
  const first = new Date(year, month-1, 1);
  const firstJs = first.getDay(); // Sun=0
  const firstMon0 = (firstJs + 6) % 7; // Mon=0
  const start = new Date(year, month-1, 1);
  start.setDate(start.getDate() - firstMon0);

  const lastDay = daysInMonth(year, month);
  const last = new Date(year, month-1, lastDay);
  const lastJs = last.getDay();
  const lastMon0 = (lastJs + 6) % 7;
  const end = new Date(year, month-1, lastDay);
  end.setDate(end.getDate() + (6 - lastMon0));

  const weeks = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while(cur <= end){
    const week = [];
    for(let i=0;i<7;i++){
      week.push(new Date(cur.getFullYear(), cur.getMonth(), cur.getDate()));
      cur.setDate(cur.getDate()+1);
    }
    weeks.push(week);
  }
  return weeks;
}

let calendarCells = new Map(); // dayIso -> {cellEl, dateObj, btns}

function renderCalendar(){
  document.getElementById("monthTitle").textContent = monthNameDE(viewYear, viewMonth);
  renderWeekHeader();

  const grid = document.getElementById("calendarGrid");
  grid.innerHTML = "";
  calendarCells.clear();

  const weeks = monthDatesCalendar(viewYear, viewMonth);

  for(const week of weeks){
    for(const d of week){
      const dayIso = isoDate(d);

      const cell = document.createElement("div");
      cell.className = "dayCell";

      const top = document.createElement("div");
      top.className = "dayTop";

      const dayNum = document.createElement("div");
      dayNum.className = "dayNum";
      dayNum.textContent = String(d.getDate());

      const hint = document.createElement("div");
      hint.className = "dayHint";
      hint.textContent = isSunday(d) ? "So" : "";

      top.append(dayNum, hint);

      const btnGrid = document.createElement("div");
      btnGrid.className = "btnGrid";

      const mk = (label, status) => {
        const b = document.createElement("button");
        b.className = "sbtn";
        b.textContent = label;
        b.onclick = () => setDayStatus(d, status);
        return b;
      };

      const b1 = mk("Schloss","SCHLOSS");
      const b2 = mk("Bürger","BUERGER");
      const b3 = mk("Krank","KRANK");
      const b4 = mk("Urlaub","URLAUB");
      const b5 = mk("Ausgl.","AUSGL");
      const empty = document.createElement("div");
      empty.className = "sbtn empty";
      empty.textContent = ".";

      btnGrid.append(b1,b2,b3,b4,b5,empty);

      cell.append(top, btnGrid);

      // style: dim Mondays if closed
      if(isMonday(d) && !store.isMondayOpen(dayIso)){
        dayNum.style.color = "#666";
      }

      // style: out-of-month days faded
      if(d.getMonth() !== (viewMonth-1)){
        cell.style.opacity = "0.50";
      }

      grid.appendChild(cell);
      calendarCells.set(dayIso, {cellEl:cell, dateObj:d, btns:[b1,b2,b3,b4,b5], dayNumEl:dayNum});
    }
  }

  paintCalendarForSelected();
}

/* paint selected employee statuses */
function paintCalendarForSelected(){
  // reset
  for(const [iso, obj] of calendarCells.entries()){
    const {cellEl, btns, dayNumEl, dateObj} = obj;
    cellEl.style.background = "#fff";
    dayNumEl.style.color = "#111";
    btns.forEach(b=>{
      b.style.background = "#F1F1F1";
      b.style.color = "#111";
    });

    if(isMonday(dateObj) && !store.isMondayOpen(iso)){
      dayNumEl.style.color = "#666";
    }
  }

  if(!selectedEmpId) return;

  for(const [iso, obj] of calendarCells.entries()){
    const {cellEl, btns, dayNumEl} = obj;
    const st = store.getStatus(iso, selectedEmpId);
    let color = null;
    if(st === "SCHLOSS") color = BORDEAUX;
    else if(st === "BUERGER") color = MOOS_GREEN;
    else if(st === "KRANK") color = KRANK_RED;
    else if(st === "URLAUB") color = URLAUB_BLUE;
    else if(st === "AUSGL") color = AUSGL_GRAY;

    if(color){
      cellEl.style.background = color;
      dayNumEl.style.color = "#fff";
      btns.forEach(b=>{
        b.style.background = color;
        b.style.color = "#fff";
      });
    }
  }
}

function setDayStatus(dateObj, status){
  if(!selectedEmpId){
    setStatusText("Bitte zuerst einen Mitarbeiter auswählen.");
    return;
  }

  const dayIso = isoDate(dateObj);

  if(isMonday(dateObj) && !store.isMondayOpen(dayIso)){
    setStatusText("Montag ist geschlossen (Ausnahme über „Montag öffnen…“).");
    return;
  }

  const current = store.getStatus(dayIso, selectedEmpId);
  if(current === status){
    store.clearStatus(dayIso, selectedEmpId);
  }else{
    store.setStatus(dayIso, selectedEmpId, status);
  }

  paintCalendarForSelected();
  renderEmployees(); // refresh ampel
  setStatusText("Geändert.");
}

/* ---------- Actions ---------- */
function runAutoPlan(){
  if(store.employees.length===0){
    alert("Keine Mitarbeiter vorhanden.");
    return;
  }

  const msg =
`AutoPlan für ${monthNameDE(viewYear, viewMonth)} starten?

Regeln:
- Ergänzt nur leere Felder (NONE)
- Respektiert manuelle Einträge und Krank/Urlaub/Ausgl.
- Monatsziel nach Öffnungstagen (nicht ×4)
- Sonntage fair im 2-Monats-Fenster, nach Stunden gewichtet
- Keine Sonntage zwei Wochen подряд (wenn möglich)
- Wenn Sonntag in der Woche: Dienstag möglichst frei (Preference)
- Schutz gegen Lieblingskandidaten: Strafpunkte für Serien/Wiederholungen
- Überschreiten der Ziel-Schichten nur bis +1 (starker Malus danach)
- AutoPlan setzt immer SCHLOSS (Bürger bleibt manuell)
- 5 Personen Di–Sa, 2 Personen So, Montag nur wenn geöffnet`;

  if(!confirm(msg)) return;

  const res = autoplanMonth(store, viewYear, viewMonth);
  renderCalendar();
  renderEmployees();
  setStatusText(res);
  alert(res);
}

function mondayOpenDialog(){
  const input = prompt("Montag öffnen: Datum (TT.MM.JJJJ) eingeben.\n\nTipp: nochmal öffnen/löschen über Export/Import oder per wiederholtem Aufruf (siehe Liste im JSON).");
  if(!input) return;
  const d = parseDEDate(input);
  if(!d){ alert("Bitte Datum im Format TT.MM.JJJJ eingeben."); return; }
  if(d.getDay() !== 1){ alert("Dieses Datum ist kein Montag."); return; }
  store.addMondayOpen(isoDate(d));
  renderCalendar();
  setStatusText("Montag geöffnet.");
}

function exportJSON(){
  const payload = { employees: store.employees, plan: store.plan };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
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

function importJSONFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const obj = JSON.parse(String(reader.result || ""));
      if(!obj || typeof obj !== "object") throw new Error("bad");
      if(!Array.isArray(obj.employees)) throw new Error("employees missing");
      if(!obj.plan || typeof obj.plan !== "object") throw new Error("plan missing");

      localStorage.setItem(LS_KEY, JSON.stringify({employees: obj.employees, plan: obj.plan}, null, 2));
      store.load();

      // keep selection if possible
      if(selectedEmpId && !store.employees.some(e=>e.id===selectedEmpId)){
        selectedEmpId = null;
      }

      renderEmployees();
      renderCalendar();
      setStatusText("Import erfolgreich.");
      alert("Import erfolgreich.");
    }catch(e){
      alert("Import fehlgeschlagen: JSON ist ungültig oder hat falsche Struktur.");
    }
  };
  reader.readAsText(file, "utf-8");
}

/* ---------- Hours dialogs ---------- */
function askWeeklyMinutes(initial){
  // initial in minutes. Let user enter hours + minutes (0/15/30/45).
  const h0 = Math.max(0, Math.floor(initial/60));
  const m0 = initial % 60;
  const hStr = prompt("Wochenstunden – Stunden (Zahl):", String(h0));
  if(hStr === null) return null;
  const h = Number(hStr);
  if(!Number.isFinite(h) || h < 0 || h > 60) { alert("Ungültige Stunden."); return null; }

  const mStr = prompt("Wochenstunden – Minuten (0,15,30,45):", String([0,15,30,45].includes(m0)?m0:0));
  if(mStr === null) return null;
  const m = Number(mStr);
  if(![0,15,30,45].includes(m)) { alert("Minuten müssen 0, 15, 30 oder 45 sein."); return null; }

  return h*60 + m;
}

function openChangeHoursForProfile(){
  if(!profileEmpId) return;
  const emp = store.employees.find(e=>e.id===profileEmpId);
  if(!emp) return;
  const v = askWeeklyMinutes(emp.weekly_minutes);
  if(v === null) return;
  store.updateEmployeeHours(emp.id, v);
  openProfile(emp.id); // re-render modal
  renderEmployees();
  setStatusText("Stunden geändert.");
}

/* ---------- Init ---------- */
function init(){
  const today = new Date();
  viewYear = today.getFullYear();
  viewMonth = today.getMonth()+1;

  document.getElementById("btnPrev").onclick = () => {
    viewMonth--;
    if(viewMonth===0){ viewMonth=12; viewYear--; }
    renderEmployees();
    renderCalendar();
    setStatusText("Monat gewechselt.");
  };
  document.getElementById("btnNext").onclick = () => {
    viewMonth++;
    if(viewMonth===13){ viewMonth=1; viewYear++; }
    renderEmployees();
    renderCalendar();
    setStatusText("Monat gewechselt.");
  };

  document.getElementById("btnRefresh").onclick = () => {
    renderEmployees();
    paintCalendarForSelected();
    setStatusText("Aktualisiert.");
  };

  document.getElementById("btnAutoPlan").onclick = runAutoPlan;
  document.getElementById("btnShowPlan").onclick = openPlanModal;

  document.getElementById("btnMondayOpen").onclick = mondayOpenDialog;

  document.getElementById("btnExport").onclick = exportJSON;
  document.getElementById("btnImport").onclick = () => document.getElementById("fileImport").click();
  document.getElementById("fileImport").addEventListener("change", (e)=>{
    const f = e.target.files?.[0];
    if(f) importJSONFile(f);
    e.target.value = "";
  });

  // employee add
  document.getElementById("btnAddEmp").onclick = () => {
    const name = (document.getElementById("empName").value || "").trim();
    if(!name){ alert("Bitte Name eingeben."); return; }
    const weekly = askWeeklyMinutes(20*60);
    if(weekly === null) return;
    store.addEmployee(name, weekly);
    document.getElementById("empName").value = "";
    renderEmployees();
    renderCalendar();
    setStatusText("Gespeichert.");
  };

  // modals
  document.getElementById("btnCloseProfile").onclick = closeProfile;
  document.getElementById("btnCloseProfile2").onclick = closeProfile;
  document.getElementById("btnChangeHours").onclick = openChangeHoursForProfile;

  document.getElementById("btnClosePlan").onclick = closePlanModal;
  document.getElementById("btnClosePlan2").onclick = closePlanModal;
  document.getElementById("btnCopyPlan").onclick = () => {
    const ta = document.getElementById("planText");
    ta.select();
    document.execCommand("copy");
    setStatusText("Plan kopiert.");
    alert("Der Monatsplan wurde in die Zwischenablage kopiert.");
  };

  // initial render
  renderEmployees();
  renderCalendar();
  setStatusText("Bereit.");
}

init();
