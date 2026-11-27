
// TimeLog 3.0.50 — offline PWA; model parameters are imported locally.

const VERSION = '3.0.62';
const MIN = 60000;
function emptyState() { return {schema:1, revision:0, active:null, entries:[], credits:[], openings:{}}; }
function assert(ok, message) { if (!ok) throw new Error(message); }
function isTime(n) { return Number.isSafeInteger(n) && n > 0 && n < 8640000000000000; }
function cleanNote(s) { return String(s == null ? '' : s).trim().slice(0, 1000); }
function validEntry(e) {
  return e && typeof e.id === 'string' && e.id.length > 0 && isTime(e.start) && isTime(e.end) && e.end > e.start && Number.isSafeInteger(e.pauseMs) && e.pauseMs >= 0 && e.pauseMs <= e.end-e.start && typeof e.note === 'string' && (e.autoPauseMs===undefined || (Number.isSafeInteger(e.autoPauseMs) && e.autoPauseMs>=0 && e.autoPauseMs<=e.pauseMs)) && (e.autoPause===undefined || typeof e.autoPause==='boolean');
}
// Independent CKM ledger. Money is stored as integer cents; shift duration uses local clock minutes.
function ckmEmpty(){return {rateCents:null,shifts:{early:null,late:null},entries:[]};}
function ckmData(s){return s.ckm||ckmEmpty();}
function ckmTime(t){return typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t);}
function ckmMinute(t){assert(ckmTime(t),'Bitte gültige Uhrzeiten eingeben.');return Number(t.slice(0,2))*60+Number(t.slice(3));}
function ckmDuration(start,end){const a=ckmMinute(start),b=ckmMinute(end),gross=b<a?b+1440-a:b-a;assert(gross>0,'Beginn und Ende dürfen nicht gleich sein.');return gross;}
function ckmMoney(c,positive=false){return Number.isSafeInteger(c)&&c>=(positive?1:0)&&c<=99999999;}
function ckmParseMoney(v,positive=false){const m=String(v).trim().match(/^(\d{1,6})(?:[,.](\d{1,2}))?$/);assert(m,'Bitte einen Eurobetrag mit höchstens zwei Nachkommastellen eingeben.');const c=Number(m[1])*100+Number((m[2]||'').padEnd(2,'0'));assert(ckmMoney(c,positive),'Ungültiger Eurobetrag.');return c;}
function ckmAmounts(e){const minutes=ckmDuration(e.start,e.end),wage=Math.round(minutes*e.rateCents/60);return {minutes,wage,tip:e.totalCents-wage,total:e.totalCents};}
function validCkm(c){
 assert(c&&typeof c==='object'&&(c.rateCents===null||ckmMoney(c.rateCents,true))&&c.shifts&&Array.isArray(c.entries),'Ungültige CKM-Daten.');
 for(const key of ['early','late']){const p=c.shifts[key];assert(p===null||p&&ckmTime(p.start)&&ckmTime(p.end),'Ungültige CKM-Schichtvorgabe.');if(p)ckmDuration(p.start,p.end);}
 for(const e of c.entries){assert(e&&typeof e.id==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(e.id)&&validDay(e.day)&&['early','late'].includes(e.shift)&&ckmMoney(e.rateCents,true)&&ckmMoney(e.totalCents),'Ungültiger CKM-Eintrag.');ckmAmounts(e);}
 assert(new Set(c.entries.map(e=>e.id)).size===c.entries.length,'Doppelte CKM-ID.');return c;
}
function ckmChange(s,a,now){const c=ckmData(s);s.ckm=c;
 if(a.type==='ckmConfig'){c.rateCents=a.rateCents;c.shifts=JSON.parse(JSON.stringify(a.shifts));}
 else if(a.type==='ckmSave'){
  const old=a.id?c.entries.find(e=>e.id===a.id):null;assert(!a.id||old,'CKM-Eintrag nicht gefunden.');
  assert(validDay(a.day)&&a.day<=localDay(now),'Bitte ein gültiges, nicht zukünftiges Datum wählen.');
  const e={id:old?old.id:newId(now),day:a.day,shift:a.shift,start:a.start,end:a.end,totalCents:a.totalCents,rateCents:old?old.rateCents:c.rateCents};
  c.entries=c.entries.filter(x=>x.id!==e.id).concat(e);
 }else if(a.type==='ckmDelete'){assert(c.entries.some(e=>e.id===a.id),'CKM-Eintrag nicht gefunden.');c.entries=c.entries.filter(e=>e.id!==a.id);}
 else throw new Error('Unbekannte CKM-Aktion.');
 validCkm(c);s.revision++;return validateState(s);
}
function ckmMonthData(s,m){const entries=ckmData(s).entries.slice().sort((a,b)=>b.day.localeCompare(a.day)||b.start.localeCompare(a.start)||b.id.localeCompare(a.id));const sum=entries.reduce((r,e)=>{const a=ckmAmounts(e);for(const k of ['minutes','wage','tip','total'])r[k]+=a[k];return r;},{minutes:0,wage:0,tip:0,total:0});return {entries,...sum};}
function ckmEuro(c){return (c/100).toLocaleString('de-AT',{minimumFractionDigits:2,maximumFractionDigits:2});}
function ckmCsv(s,m){const r=ckmMonthData(s,m),fmt=c=>(c/100).toFixed(2).replace('.',','),q=v=>'\"'+String(v).replace(/\"/g,'\"\"')+'\"';const rows=[['Datum','Schicht','Beginn','Ende','Ende Folgetag','Arbeitsminuten','Stundenlohn EUR','Gesamt EUR','Lohn EUR','Trinkgeld / Differenz EUR']];for(const e of r.entries){const a=ckmAmounts(e);rows.push([e.day,e.shift==='early'?'Früh':'Spät',e.start,e.end,e.end<e.start?'Ja':'Nein',a.minutes,fmt(e.rateCents),fmt(a.total),fmt(a.wage),fmt(a.tip)]);}rows.push(['Summe','','','','',r.minutes,'',fmt(r.total),fmt(r.wage),fmt(r.tip)]);return '\uFEFF'+rows.map(row=>row.map(q).join(';')).join('\r\n')+'\r\n';}

function validateState(s) {
  assert(s && s.schema === 1 && Number.isSafeInteger(s.revision) && s.revision >= 0 && Array.isArray(s.entries), 'Unbekanntes oder beschädigtes Datenformat.');
  if(s.credits===undefined)s.credits=[];
  if(s.openings===undefined)s.openings={};
  assert(Array.isArray(s.credits) && s.credits.every(c=>c && typeof c.id==='string' && validDay(c.day) && Object.keys(CREDIT_TYPES).includes(c.type) && Number.isInteger(c.minutes) && c.minutes>=0 && c.minutes<=1440 && typeof c.note==='string' && validCreditInterval(c)), 'Ungültige Abwesenheitsbuchung.');
  assert(new Set(s.credits.map(c=>c.id)).size===s.credits.length,'Doppelte Abwesenheits-ID.');
  assert(s.credits.every(c=>c.vacationRange===undefined||(c.vacationRange===true&&c.type==='URL'&&!hasCreditInterval(c))), 'Ungültige Urlaubsbuchung.');
  assert(s.openings && typeof s.openings==='object' && !Array.isArray(s.openings) && Object.entries(s.openings).every(([k,v])=>/^\d{4}-(0[1-9]|1[0-2])$/.test(k)&&Number.isSafeInteger(v)), 'Ungültiger Anfangssaldo.');
  assert(s.entries.every(validEntry), 'Ungültiger Zeiteintrag.');
  assert(new Set(s.entries.map(e=>e.id)).size === s.entries.length, 'Doppelte Eintrags-ID.');
  const sorted = s.entries.slice().sort((a,b)=>a.start-b.start);
  for (let i=1; i<sorted.length; i++) assert(sorted[i-1].end <= sorted[i].start, 'Überlappende Arbeitszeiten.');
  if (s.active !== null) {
    const a=s.active;
    assert(a && typeof a.id==='string' && a.id.length && isTime(a.start) && Number.isSafeInteger(a.pauseMs) && a.pauseMs>=0 && typeof a.note==='string' && (a.pauseStart===null || (isTime(a.pauseStart) && a.pauseStart>=a.start && a.pauseMs<=a.pauseStart-a.start)), 'Ungültige laufende Arbeitszeit.');
    assert(a.lastPauseEnd===undefined||(isTime(a.lastPauseEnd)&&a.lastPauseEnd>=a.start+a.pauseMs&&(a.pauseStart===null||a.lastPauseEnd<=a.pauseStart)),'Ungültige letzte Pausenendzeit.');
    assert(!s.entries.some(e=>e.id===a.id || e.end>a.start), 'Laufende Arbeitszeit überschneidet sich mit einem Eintrag.');
  }
  assert(s.entries.every(e=>/^[A-Za-z0-9_-]{1,160}$/.test(e.id))&&s.credits.every(c=>/^[A-Za-z0-9_-]{1,160}$/.test(c.id)), 'Ungültige Buchungs-ID.');
  if(s.octoberReference!==undefined){const o=s.octoberReference;assert(o&&Number.isSafeInteger(o.entries)&&o.entries>=0&&Number.isSafeInteger(o.credits)&&o.credits>=0&&Array.isArray(o.skipped)&&o.skipped.every(validDay),'Ungültige Referenz-Metadaten.');}
  if(s.model!==undefined)validateModel(s.model);
  if(s.pauseDaysHistory!==undefined){assert(s.model&&Array.isArray(s.pauseDaysHistory)&&s.pauseDaysHistory.every((p,i,all)=>p&&validDay(p.from)&&Array.isArray(p.days)&&p.days.length===7&&p.days.every(v=>typeof v==='boolean')&&(!i||all[i-1].from<p.from)&&(p.minimums===undefined||validPauseMinimums(p.minimums,s.model))),'Ungültige Pausentag-Einstellungen.');}
  if(s.fixedPauseConfig!==undefined){const p=s.fixedPauseConfig;assert(s.model&&p&&Array.isArray(p.days)&&p.days.length===7&&p.days.every(v=>typeof v==='boolean')&&validWindow(p.window),'Ungültige feste Pausenregel.');}
  if(s.fixedPauseDays!==undefined){assert(s.model&&s.fixedPauseDays&&typeof s.fixedPauseDays==='object'&&!Array.isArray(s.fixedPauseDays)&&Object.entries(s.fixedPauseDays).every(([d,w])=>validDay(d)&&(w===null||validWindow(w))),'Ungültige Pausenfenster pro Tag.');}
  for(const c of s.credits){const w=fixedWindow(c.day,s);if(c.pauseExcludedMinutes!==undefined||(w&&hasCreditInterval(c)))assert(w&&c.pauseExcludedMinutes===windowOverlap(c.absenceStart,c.absenceEnd,w,c.day)/MIN,'Ungültige Pausenverrechnung der Arztzeit.');}
  if(s.reference!==undefined){const r=s.reference;assert(r&&/^\d{4}-(0[1-9]|1[0-2])$/.test(r.month)&&Array.isArray(r.rows)&&r.rows.length<=30&&r.rows.every(t=>typeof t==='string'&&t.length<=1000),'Ungültige Referenzwerte.');const c=r.carry;assert(c&&validDay(c.start)&&weekStart(c.start)===c.start&&Number.isInteger(c.days)&&c.days>=1&&c.days<=6&&Number.isSafeInteger(c.actual)&&c.actual>=0&&c.actual<=10080&&Number.isSafeInteger(c.plus)&&(!s.model||c.plus===c.actual-Array.from({length:c.days},(_,i)=>dayTarget(addDay(c.start,i),s)).reduce((a,b)=>a+b,0)),'Ungültiger Wochenübertrag.');}
  if(s.ckm!==undefined)validCkm(s.ckm);
  return s;
}
function newId(now) { return now.toString(36)+'-'+Math.random().toString(36).slice(2,12); }
function localDay(t) { const d=new Date(t); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function localInput(t) { const d=new Date(t); return localDay(t)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
function parseLocal(s, old) {
  if (old && s===localInput(old)) return old;
  assert(typeof s==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(s),'Bitte Datum und Uhrzeit vollständig eingeben.');
  const [y,m,d,h,min]=s.match(/\d+/g).map(Number);
  const value=new Date(y,m-1,d,h,min,0,0).getTime();
  assert(isTime(value) && localInput(value)===s,'Diese lokale Uhrzeit existiert nicht oder ist ungültig.');
  return value;
}
// Optional timed AB metadata; legacy minute-only credits remain valid.
function hasCreditInterval(c){return c.absenceStart!==undefined||c.absenceEnd!==undefined;}
function validCreditInterval(c){const excluded=c.pauseExcludedMinutes;return !hasCreditInterval(c)?excluded===undefined:(c.type==='AB'&&isTime(c.absenceStart)&&isTime(c.absenceEnd)&&c.absenceEnd>c.absenceStart&&(excluded===undefined||(Number.isInteger(excluded)&&excluded>=0&&excluded<=1440))&&(c.absenceEnd-c.absenceStart)===(c.minutes+(excluded||0))*MIN);}
function timedCreditConflict(s,start,end){return s.credits.some(c=>hasCreditInterval(c)&&start<c.absenceEnd&&c.absenceStart<end);}
function creditInterval(day,from,to){
  assert(validDay(day),'Bitte ein gültiges Datum wählen.');
  assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(from)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(to),'Bitte Aus- und Einstempelzeit vollständig eingeben.');
  const start=parseLocal(day+'T'+from),end=parseLocal(day+'T'+to);
  assert(end>start,'Die Einstempelzeit muss nach der Ausstempelzeit liegen.');
  return {start,end,minutes:(end-start)/MIN};
}
// A retrospective AB credit may replace part of one completed same-day work entry, only with explicit consent.
function creditSplitCandidate(s,interval,day){
 const hits=s.entries.filter(e=>interval.start<e.end&&e.start<interval.end);
 if(!hits.length)return null;
 assert(hits.length===1,'Mehrere Arbeitsbuchungen betroffen. Bitte die Arbeitszeiten im Kalender zuerst manuell korrigieren.');
 const e=hits[0];
 assert(localDay(e.start)===day&&localDay(e.end)===day&&e.start<=interval.start&&interval.end<=e.end&&(e.start<interval.start||interval.end<e.end),'Bitte die betroffene Arbeitsbuchung im Kalender zuerst manuell korrigieren.');
 assert(e.pauseMs===(e.autoPauseMs||0),'Die Arbeitsbuchung enthält eine erfasste Pause ohne genaue Zeitlage. Bitte die Arbeitszeit und Pause zuerst im Kalender manuell aufteilen.');
 return e;
}
function splitWorkForCredit(s,e,interval,now){
 const pieces=[];
 if(e.start<interval.start)pieces.push({...e,end:interval.start,pauseMs:0,autoPauseMs:0});
 if(interval.end<e.end)pieces.push({...e,id:pieces.length?newId(now):e.id,start:interval.end,pauseMs:0,autoPauseMs:0});
 s.entries=s.entries.filter(x=>x.id!==e.id).concat(pieces);
 redistributePause(s,localDay(e.start));
}
function checkOverlap(s,e) {
  assert(!vacationConflict(s,e.start,e.end),'Für diesen Zeitraum ist Urlaub eingetragen. Bitte zuerst im Kalender korrigieren.');
  assert(!s.entries.some(x=>x.id!==e.id && e.start<x.end && x.start<e.end),'Der Eintrag überschneidet sich mit einer vorhandenen Arbeitszeit.');
  assert(!s.active || e.end<=s.active.start,'Der Eintrag überschneidet sich mit der laufenden Arbeitszeit.');
  assert(!timedCreditConflict(s,e.start,e.end),'Der Eintrag überschneidet sich mit einer Arzt-/Behörden-Gutschrift.');
}
function pauseDaysOn(day,s=state){const base=modelOf(s).autoDays;const p=(s.pauseDaysHistory||[]).filter(p=>p.from<=day).slice(-1)[0];return p?p.days:base;}
function validPauseMinimums(values,model){return Array.isArray(values)&&values.length===7&&values.every(v=>Number.isInteger(v)&&v>=0&&v<=model.pauseThreshold);}
function pauseMinimumsOn(day,s=state){const m=modelOf(s);const p=(s.pauseDaysHistory||[]).filter(p=>p.from<=day&&p.minimums!==undefined).slice(-1)[0];return p?p.minimums:Array(7).fill(m.pauseMinimum);}
function pauseMinimumOn(day,s=state){return pauseMinimumsOn(day,s)[dayDate(day).getDay()];}
function autoDay(day,s=state) {return pauseDaysOn(day,s)[dayDate(day).getDay()];}
function defaultTimes(day,s=state){return modelOf(s).times[dayDate(day).getDay()];}
// A local, per-day snapshot keeps historic days and future configuration changes independent.
function validWindow(w){return Array.isArray(w)&&w.length===2&&w.every(v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v))&&w[0]<w[1];}
function configuredWindow(day,s=state){const p=s.fixedPauseConfig;return p&&p.days[dayDate(day).getDay()]?p.window:null;}
function fixedWindow(day,s=state){return (s.fixedPauseDays||{})[day]||null;}
function dayHasData(day,s){return s.entries.some(e=>localDay(e.start)===day)||s.credits.some(c=>c.day===day)||(s.active&&localDay(s.active.start)===day);}
function prospectiveWindow(day,s=state){return Object.prototype.hasOwnProperty.call(s.fixedPauseDays||{},day)?fixedWindow(day,s):dayHasData(day,s)?null:configuredWindow(day,s);}
function ensureFixedDay(s,day){const w=prospectiveWindow(day,s);if(w){s.fixedPauseDays=s.fixedPauseDays||{};s.fixedPauseDays[day]=w.slice();}}
// An unsaved legacy session can use the configured window if no booked day needs conversion.
function activeNeedsWindow(s){const a=s.active;if(!a)return false;const day=localDay(a.start);return !Object.prototype.hasOwnProperty.call(s.fixedPauseDays||{},day)&&!!configuredWindow(day,s);}
function activeCanAdoptWindow(s){if(!activeNeedsWindow(s))return false;const day=localDay(s.active.start);return !s.entries.some(e=>localDay(e.start)===day)&&!s.credits.some(c=>c.day===day);}
function activeFixedWindow(s){return s.active?(fixedWindow(localDay(s.active.start),s)||(activeCanAdoptWindow(s)?configuredWindow(localDay(s.active.start),s):null)):null;}
function adoptActiveWindow(s){if(activeCanAdoptWindow(s)){const day=localDay(s.active.start);s.fixedPauseDays={...(s.fixedPauseDays||{}),[day]:configuredWindow(day,s).slice()};}}
function effectiveAutoDay(day,s=state){return !!prospectiveWindow(day,s)||autoDay(day,s);}
function windowBounds(w,day){return [parseLocal(day+'T'+w[0]),parseLocal(day+'T'+w[1])];}
function windowOverlap(start,end,w,day){const [a,b]=windowBounds(w,day);return Math.max(0,Math.min(end,b)-Math.max(start,a));}
function updateTimedCredits(s,day,w){for(const c of s.credits.filter(c=>c.day===day&&hasCreditInterval(c))){const excluded=w?windowOverlap(c.absenceStart,c.absenceEnd,w,day)/MIN:0; c.minutes=(c.absenceEnd-c.absenceStart)/MIN-excluded;if(w)c.pauseExcludedMinutes=excluded;else delete c.pauseExcludedMinutes;}}
function redistributePause(s,day){
 const es=s.entries.filter(e=>localDay(e.start)===day).sort((a,b)=>a.start-b.start);
 const eligible=es.filter(e=>e.autoPause===true);
 for(const e of eligible){e.pauseMs-=e.autoPauseMs||0;e.autoPauseMs=0;}
 const w=fixedWindow(day,s);
 if(w){
  // Manual pause durations have no known time location. Offset them against the work portion only.
  let manual=es.reduce((n,e)=>n+e.pauseMs,0);
  for(const e of eligible){const overlap=windowOverlap(e.start,e.end,w,day),covered=Math.min(manual,overlap);manual-=covered;const add=Math.min(overlap-covered,e.end-e.start-e.pauseMs);e.pauseMs+=add;e.autoPauseMs=add;}
  updateTimedCredits(s,day,w);return;
 }
 const gross=es.reduce((n,e)=>n+e.end-e.start,0);
 const model=modelOf(s);if(!autoDay(day,s)||gross<model.pauseThreshold*MIN)return;
 let remaining=Math.max(0,pauseMinimumOn(day,s)*MIN-es.reduce((n,e)=>n+e.pauseMs,0));
 for(const e of eligible){const add=Math.min(remaining,e.end-e.start-e.pauseMs);e.pauseMs+=add;e.autoPauseMs=add;remaining-=add;}
}
// Explicit day conversion; never migrate stored days on app startup or configuration alone.
function applyFixedDay(s,day,useFixed,now){
 assert(validDay(day)&&day<=localDay(now)&&dayHasData(day,s),'Bitte einen bereits gebuchten Tag auswählen.');
 assert(!s.active||localDay(s.active.start)!==day,'Bitte die laufende Buchung zuerst abschließen.');
 const w=useFixed?(configuredWindow(day,s)||fixedWindow(day,s)):null;
 assert(!useFixed||w,'Für diesen Wochentag ist kein festes Pausenfenster konfiguriert.');
 s.fixedPauseDays=s.fixedPauseDays||{};s.fixedPauseDays[day]=w?w.slice():null;
 updateTimedCredits(s,day,w);redistributePause(s,day);
}
function monthAB(s,m){return s.credits.filter(c=>c.type==='AB'&&c.day.slice(0,7)===m).reduce((n,c)=>n+c.minutes,0);}
function legacyABDays(s,m,today){return [...new Set(s.credits.filter(c=>c.type==='AB'&&hasCreditInterval(c)&&c.day.slice(0,7)===m&&c.day<=today&&!Object.prototype.hasOwnProperty.call(s.fixedPauseDays||{},c.day)&&(!s.active||localDay(s.active.start)!==c.day)).map(c=>c.day))].sort();}
function convertibleABDays(s,m,today){return legacyABDays(s,m,today).filter(d=>configuredWindow(d,s));}
function dayAB(d){return d.cs.filter(c=>c.type==='AB').reduce((n,c)=>n+c.minutes,0);}
function vacationConflict(s,start,end){return s.credits.some(c=>c.vacationRange===true&&c.type==='URL'&&c.day>=localDay(start)&&c.day<=localDay(Math.max(start,end-1)));}
function vacationPlan(s,from,to,now,id){
 assert(validDay(from)&&validDay(to)&&from<=to,'Bitte einen gültigen Zeitraum (Von/Bis) wählen.');
 const old=id?s.credits.find(c=>c.id===id&&c.vacationRange===true&&c.type==='URL'):null;
 assert(!id||old,'Urlaubsbuchung nicht gefunden.');
 const days=[],skipped=[],conflicts=[];let count=0;
 for(let day=from;day<=to;day=addDay(day,1)){
  assert(++count<=366,'Bitte höchstens 366 Kalendertage auf einmal erfassen.');
  if(!dayTarget(day,s)||holidayName(day,s)){skipped.push(day);continue;}
  const start=parseLocal(day+'T00:00'),end=parseLocal(addDay(day,1)+'T00:00');
  if(s.entries.some(e=>e.start<end&&start<e.end)||s.credits.some(c=>c.id!==id&&c.day===day)||(s.active&&s.active.start<end&&now>=start)){conflicts.push(day);continue;}
  days.push({day,minutes:dayTarget(day,s)});
 }
 return {days,skipped,conflicts,minutes:days.reduce((n,d)=>n+d.minutes,0)};
}
function change(state, action, now=Date.now()) {
  const s=JSON.parse(JSON.stringify(state));
  if(['ckmConfig','ckmSave','ckmDelete'].includes(action.type))return ckmChange(s,action,now);
  modelOf(s);const a=s.active;
  if(action.type!=='activeFixedApply')adoptActiveWindow(s);
  switch(action.type) {
    case 'vacationRange': {
      const plan=vacationPlan(s,action.from,action.to,now,action.id);
      assert(!plan.conflicts.length,'Bereits gebuchte Tage: '+plan.conflicts.join(', ')+'. Bitte zuerst korrigieren.');
      assert(plan.days.length,'Keine Soll-Arbeitstage im gewählten Zeitraum.');
      s.credits=s.credits.filter(c=>c.id!==action.id);
      for(const d of plan.days)s.credits.push({id:action.id&&plan.days.length===1?action.id:newId(now),day:d.day,type:'URL',minutes:d.minutes,note:cleanNote(action.note),vacationRange:true});
      break;
    }
    case 'start': {
      assert(!a,'Es läuft bereits ein Arbeitstag.');
      const start=action.start===undefined?now:parseLocal(action.start);
      assert(localDay(start)===localDay(now),'Bitte eine Beginnzeit für heute wählen.');
      assert(start<=now,'Der Arbeitsbeginn darf nicht in der Zukunft liegen.');
      assert(!vacationConflict(s,start,now+1),'Für diesen Tag ist Urlaub eingetragen. Bitte zuerst im Kalender korrigieren.');
      assert(!s.entries.some(e=>e.end>start),'Der Arbeitsbeginn überschneidet sich mit einer gespeicherten Arbeitszeit.');
      assert(!s.credits.some(c=>hasCreditInterval(c)&&c.absenceEnd>start),'Der Arbeitsbeginn überschneidet sich mit einer Arzt-/Behörden-Gutschrift.');
      ensureFixedDay(s,localDay(start));s.active={id:newId(now),start,pauseMs:0,pauseStart:null,note:cleanNote(action.note)}; break;
    }
    case 'pause':
      assert(a && a.pauseStart===null,'Keine laufende Arbeitsphase.');
      assert(now>=a.start+a.pauseMs,'Die Systemzeit ist zurückgesprungen.');
      a.pauseStart=now; a.note=cleanNote(action.note); break;
    case 'resume':
      assert(a && a.pauseStart!==null,'Es läuft keine Pause.');
      assert(now>=a.pauseStart,'Die Systemzeit ist zurückgesprungen.');
      a.pauseMs+=now-a.pauseStart; a.lastPauseEnd=now; a.pauseStart=null; a.note=cleanNote(action.note); break;
    case 'stop': {
      assert(a,'Keine laufende Arbeitszeit.');
      const end=action.end===undefined?now:parseLocal(action.end);
      assert(end<=now,'Das Arbeitsende darf nicht in der Zukunft liegen.');
      assert(end>a.start,'Das Arbeitsende muss nach dem Arbeitsbeginn liegen.');
      assert(a.pauseStart===null||end>=a.pauseStart,'Das Arbeitsende darf nicht vor Beginn der laufenden Pause liegen.');
      assert(a.lastPauseEnd===undefined||end>=a.lastPauseEnd,'Das Arbeitsende darf nicht vor einer bereits beendeten Pause liegen.');
      assert(action.end===undefined||!a.pauseMs||a.lastPauseEnd!==undefined,'Die Pausenzeiten dieser älteren laufenden Buchung sind nicht vollständig datiert. Bitte regulär beenden und anschließend die Buchung bearbeiten.');
      adoptActiveWindow(s);
      const e={id:a.id,start:a.start,end,pauseMs:a.pauseMs+(a.pauseStart===null?0:end-a.pauseStart),note:cleanNote(action.note),autoPause:effectiveAutoDay(localDay(a.start),s),autoPauseMs:0};
      assert(validEntry(e),'Die Arbeitsdauer ist ungültig.');
      s.active=null; checkOverlap(s,e); s.entries.push(e); redistributePause(s,localDay(e.start)); break;
    }
    case 'fixedPauseConfig': {
      assert(Array.isArray(action.days)&&action.days.length===7&&action.days.every(v=>typeof v==='boolean')&&validWindow(action.window),'Bitte gültige Pausentage und ein Zeitfenster mit Ende nach Beginn wählen.');
      s.fixedPauseConfig={days:action.days.slice(),window:action.window.slice()};adoptActiveWindow(s);
      if(action.applyDay!==undefined){assert(action.confirmed===true&&configuredWindow(action.applyDay,s),'Bitte den Wochentag auswählen und die Tageskorrektur bestätigen.');applyFixedDay(s,action.applyDay,true,now);}break;
    }
    case 'activeFixedApply': {
      assert(a&&action.id===a.id&&action.confirmed===true&&activeNeedsWindow(s),'Bitte die aktuelle laufende Buchung und Pausenregel prüfen.');
      const day=localDay(a.start);s.fixedPauseDays={...(s.fixedPauseDays||{}),[day]:configuredWindow(day,s).slice()};redistributePause(s,day);break;
    }
    case 'fixedPauseApply': {
      applyFixedDay(s,action.day,action.useFixed,now);break;
    }
    case 'fixedPauseMonthAB': {
      assert(/^\d{4}-(0[1-9]|1[0-2])$/.test(action.month)&&action.confirmed===true,'Bitte Monatskorrektur bestätigen.');
      const days=convertibleABDays(s,action.month,localDay(now));
      assert(days.length&&JSON.stringify(days)===JSON.stringify(action.days),'Buchungen haben sich geändert. Bitte erneut prüfen.');
      for(const day of days)applyFixedDay(s,day,true,now);break;
    }
    case 'pauseDays': {
      const today=localDay(now);assert(action.from===today||action.from===addDay(today,1),'Bitte heute oder morgen als Gültigkeitsbeginn wählen.');
      assert(!a||localDay(a.start)<action.from,'Für den laufenden Tag kann die Regel nicht geändert werden. Bitte ab morgen einstellen.');
      assert(Array.isArray(action.days)&&action.days.length===7&&action.days.every(v=>typeof v==='boolean'),'Ungültige Pausentage.');
      assert(!s.entries.some(e=>localDay(e.start)>=action.from),'Ab diesem Datum sind bereits Arbeitszeiten gespeichert. Bitte einen späteren Gültigkeitsbeginn wählen.');
      const minimums=action.minimums===undefined?pauseMinimumsOn(action.from,s):action.minimums;assert(validPauseMinimums(minimums,modelOf(s)),'Bitte gültige ganze Pausenminuten je Wochentag eingeben.');s.pauseDaysHistory=(s.pauseDaysHistory||[]).filter(p=>p.from!==action.from);s.pauseDaysHistory.push({from:action.from,days:action.days.slice(),minimums:minimums.slice()});s.pauseDaysHistory.sort((x,y)=>x.from.localeCompare(y.from));break;
    }
    case 'saveNote': assert(a,'Keine laufende Arbeitszeit.'); a.note=cleanNote(action.note); break;
    case 'discard': assert(a,'Keine laufende Arbeitszeit.'); s.active=null; break;
    case 'save': {
      const old=action.id?s.entries.find(e=>e.id===action.id):null;
      assert(!action.id || old,'Eintrag nicht gefunden.');
      const start=parseLocal(action.start,old&&old.start),end=parseLocal(action.end,old&&old.end);
      assert(end>start,'Das Arbeitsende muss nach dem Arbeitsbeginn liegen.');
      assert(end<=now,'Das Arbeitsende darf nicht in der Zukunft liegen.');
      const raw=String(action.pause).trim();
      assert(raw!=='' && Number.isFinite(Number(raw)) && Number(raw)>=0,'Bitte eine gültige Pausendauer in Minuten eingeben.');
      const oldBase=old?old.pauseMs-(old.autoPauseMs||0):0;
      const pauseMs=old && raw===String(Math.round(oldBase/MIN*100)/100)?oldBase:Math.round(Number(raw)*MIN);
      assert(pauseMs<=end-start,'Die Pause darf nicht länger als die Arbeitszeit sein.');
      const e={id:old?old.id:newId(now),start,end,pauseMs,note:cleanNote(action.note),autoPause:action.autoPause===true,autoPauseMs:0};
      checkOverlap(s,e); ensureFixedDay(s,localDay(start)); s.entries=s.entries.filter(x=>x.id!==e.id); s.entries.push(e); if(old&&localDay(old.start)!==localDay(start))redistributePause(s,localDay(old.start)); redistributePause(s,localDay(e.start)); break;
    }
    case 'credit': {
      assert(validDay(action.day)&&action.day<=localDay(now),'Ungültiges oder zukünftiges Datum.');
      assert(Object.keys(CREDIT_TYPES).includes(action.kind),'Unbekannte Buchungsart.');
      const timed=action.fromTime!==undefined||action.toTime!==undefined;
      assert(!timed||action.kind==='AB','Zeitintervalle sind nur für Arzt/Behörde vorgesehen.');
      const interval=timed?creditInterval(action.day,action.fromTime,action.toTime):null;
      const minutes=interval?interval.minutes:action.minutes;
      assert(Number.isInteger(minutes)&&minutes>=0&&minutes<=1440,'Ungültige Minutenanzahl.');
      assert(!action.id||s.credits.some(c=>c.id===action.id),'Buchung nicht gefunden.');
      const previous=s.credits.find(c=>c.id===action.id);assert(!previous||!previous.vacationRange,'Bitte die Urlaubsbuchung im Urlaubsdialog bearbeiten.');assert(!s.credits.some(c=>c.id!==action.id&&c.day===action.day&&c.vacationRange),'Für diesen Tag ist Urlaub eingetragen. Bitte zuerst korrigieren.');ensureFixedDay(s,action.day);const other=s.credits.filter(c=>c.id!==action.id);
      const c={id:action.id||newId(now),day:action.day,type:action.kind,minutes,note:cleanNote(action.note)};
      if(interval){
        assert(interval.end<=now,'Die Einstempelzeit darf nicht in der Zukunft liegen.');
        assert(!a||interval.end<=a.start,'Die Gutschrift überschneidet sich mit der laufenden Arbeitszeit. Bitte zuerst die laufende Buchung korrigieren.');
        assert(!other.some(x=>hasCreditInterval(x)&&interval.start<x.absenceEnd&&x.absenceStart<interval.end),'Die Gutschrift überschneidet sich mit einer vorhandenen Arzt-/Behörden-Gutschrift.');
        const candidate=creditSplitCandidate(s,interval,action.day);
        if(candidate){
          assert(!action.id,'Bitte die Arbeitsbuchung vor dem Bearbeiten der Gutschrift manuell korrigieren.');
          assert(action.splitEntryId===candidate.id,'Bitte die Aufteilung der vorhandenen Arbeitsbuchung bestätigen.');
          splitWorkForCredit(s,candidate,interval,now);
        }else assert(!action.splitEntryId,'Die betroffene Arbeitsbuchung hat sich geändert. Bitte erneut prüfen.');
        c.absenceStart=interval.start;c.absenceEnd=interval.end;
      }
      assert(other.filter(x=>x.day===c.day).reduce((n,x)=>n+x.minutes,0)+c.minutes<=1440,'Zeitgutschriften überschreiten 24 Stunden.');
      s.credits=other.concat(c);if(fixedWindow(c.day,s))redistributePause(s,c.day);if(previous&&previous.day!==c.day&&fixedWindow(previous.day,s))redistributePause(s,previous.day);break;
    }
    case 'deleteCredit':
      {const c=s.credits.find(c=>c.id===action.id);assert(c,'Buchung nicht gefunden.');s.credits=s.credits.filter(c=>c.id!==action.id);if(fixedWindow(c.day,s))redistributePause(s,c.day);break;}
    case 'opening':
      assert(/^\d{4}-(0[1-9]|1[0-2])$/.test(action.month),'Ungültiger Monat.');
      if(action.value===null)delete s.openings[action.month];else s.openings[action.month]=action.value;break;
    case 'delete':
      assert(s.entries.some(e=>e.id===action.id),'Eintrag nicht gefunden.');
      const deleted=s.entries.find(e=>e.id===action.id); s.entries=s.entries.filter(e=>e.id!==action.id); redistributePause(s,localDay(deleted.start)); break;
    default: throw new Error('Unbekannte Aktion.');
  }
  s.revision++; return validateState(s);
}
function csvMonth(s,month) {
  assert(/^\d{4}-(0[1-9]|1[0-2])$/.test(month),'Ungültiger Monat.');
  const fmt=t=>{const d=new Date(t);return localInput(t).replace('T',' ')+':'+String(d.getSeconds()).padStart(2,'0');};
  const hrs=ms=>(ms/3600000).toFixed(4).replace('.',',');
  const quote=v=>'"'+String(v).replace(/"/g,'""')+'"';
  const safeNote=v=>/^[\s]*[=+\-@]|^[\t\r\n]/.test(v)?"'"+v:v;
  const rows=[['Datum','Beginn','Ende','Brutto (h)','Pause (h)','Netto (h)','Notiz']];
  s.entries.filter(e=>localDay(e.start).slice(0,7)===month).sort((a,b)=>a.start-b.start).forEach(e=>rows.push([localDay(e.start),fmt(e.start),fmt(e.end),hrs(e.end-e.start),hrs(e.pauseMs),hrs(e.end-e.start-e.pauseMs),safeNote(e.note)]));
  return '\uFEFF'+rows.map(r=>r.map(quote).join(';')).join('\r\n')+'\r\n';
}


// Abrechnungsmodell nach dem vorgelegten Beispiel; keine Lohnverrechnung.
function validateModel(m){
 const minute=v=>Number.isInteger(v)&&v>=0&&v<=1440;
 const time=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
 assert(m&&m.schema===1&&typeof m.label==='string'&&m.label.length<=120,'Ungültiges Arbeitszeitprofil.');
 assert(Array.isArray(m.targets)&&m.targets.length===7&&m.targets.every(minute)&&m.targets.some(v=>v>0),'Ungültige Tagessollzeiten.');
 assert(Array.isArray(m.times)&&m.times.length===7&&m.times.every(t=>Array.isArray(t)&&t.length===2&&t.every(time)&&t[0]<t[1]),'Ungültige Regelarbeitszeiten.');
 assert(Array.isArray(m.autoDays)&&m.autoDays.length===7&&m.autoDays.every(v=>typeof v==='boolean'),'Ungültige Pausentage.');
 assert(minute(m.pauseThreshold)&&minute(m.pauseMinimum)&&m.pauseMinimum<=m.pauseThreshold,'Ungültige Pausenregel.');
 assert(Number.isInteger(m.overtimeLimit)&&m.overtimeLimit>=m.targets.reduce((a,b)=>a+b,0)&&m.overtimeLimit<=10080,'Ungültige Überstundengrenze.');
 assert(['AT','none'].includes(m.holidays),'Unbekannter Feiertagskalender.');return m;
}
function modelOf(s){assert(s.model,'Bitte zuerst das private Arbeitszeitprofil importieren.');return s.model;}
function weeklyTarget(s){return modelOf(s).targets.reduce((a,b)=>a+b,0);}
function dayTarget(day,s=state){return modelOf(s).targets[dayDate(day).getDay()];}
const CREDIT_TYPES={KRK:'Krankenstand',FT:'Feiertag',AB:'Arzt / Behörde',URL:'Urlaub',ZA:'Zeitausgleich',FREI:'Ohne Zeitgutschrift / Tag abschließen'};
function dayDate(day){const [y,m,d]=day.split('-').map(Number);return new Date(y,m-1,d,12);}
function validDay(day){return typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&localDay(dayDate(day).getTime())===day;}
function addDay(day,n){const d=dayDate(day);d.setDate(d.getDate()+n);return localDay(d.getTime());}
function weekStart(day){return addDay(day,-((dayDate(day).getDay()+6)%7));}


// Austrian nationwide statutory holidays; calculated offline (Gregorian Easter).
function holidaysAT(y){
 const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),n=h+l-7*m+114;
 const easter=localDay(new Date(y,Math.floor(n/31)-1,n%31+1,12).getTime());
 const out={};for(const [date,name] of Object.entries({'01-01':'Neujahr','01-06':'Heilige Drei Könige','05-01':'Staatsfeiertag','08-15':'Mariä Himmelfahrt','10-26':'Nationalfeiertag','11-01':'Allerheiligen','12-08':'Mariä Empfängnis','12-25':'Christtag','12-26':'Stefanitag'}))out[y+'-'+date]=name;
 for(const [offset,name] of [[1,'Ostermontag'],[39,'Christi Himmelfahrt'],[50,'Pfingstmontag'],[60,'Fronleichnam']])out[addDay(easter,offset)]=name;
 return out;
}
function holidayName(day,s=state){return modelOf(s).holidays==='AT'?(holidaysAT(Number(day.slice(0,4)))[day]||''):'';}
function signed(n,plus=true){return (n<0?'−':n>0&&plus?'+':'')+Math.floor(Math.abs(n)/60)+':'+String(Math.abs(n)%60).padStart(2,'0')+' h';}
function daily(s,day,today=localDay(Date.now())){
  const es=s.entries.filter(e=>localDay(e.start)===day),cs=s.credits.filter(c=>c.day===day);
  const work=Math.floor(es.reduce((n,e)=>n+e.end-e.start-e.pauseMs,0)/MIN);
  const counted=cs.filter(c=>!c.vacationRange||day<=today);
  const credit=counted.reduce((n,c)=>n+c.minutes,0),target=dayTarget(day,s);
  const active=!!s.active&&localDay(s.active.start)===day;
  const booked=es.length>0||counted.length>0;
  return {day,work,credit,target,actual:work+credit,diff:booked&&!active?work+credit-target:null,booked,active,es,cs};
}
function weekReport(s,start,today){
  const days=Array.from({length:7},(_,i)=>daily(s,addDay(start,i),today));
  const sum=(key)=>days.reduce((n,d)=>n+d[key],0);
  const ref=s.reference&&s.reference.carry;const carry=!!ref&&start===ref.start&&days.slice(0,ref.days).every(d=>!d.booked&&!d.active);
  const missing=days.filter((d,i)=>!(carry&&i<ref.days)&&d.target>0&&(!d.booked||d.active));
  const end=days[6].day,actual=sum('actual')+(carry?ref.actual:0),target=sum('target');
  const complete=end<today&&missing.length===0&&!days.some(d=>d.active);
  // Missing days do not silently accrue debt; on incomplete weeks only compare recorded days.
  const relevant=days.filter(d=>d.booked&&!d.active);
  const plus=relevant.reduce((n,d)=>n+Math.max(0,d.diff),0)+(carry?ref.plus:0);
  const minus=relevant.reduce((n,d)=>n+Math.min(0,d.diff),0);
  const recordedActual=relevant.reduce((n,d)=>n+d.actual,0)+(carry?ref.actual:0);
  const ot=Math.max(0,recordedActual-modelOf(s).overtimeLimit);
  return {start,end,days,actual,target,complete,missing,carry,carryActual:carry?ref.actual:0,carryPlus:carry?ref.plus:0,plus:plus-ot,minus,ot,diff:plus+minus};
}
function monthReport(s,month,today){
  const first=month+'-01'; const [y,m]=month.split('-').map(Number);
  const next=localDay(new Date(y,m,1,12).getTime());
  const days=[];for(let d=first;d<next;d=addDay(d,1))days.push(daily(s,d,today));
  const weeks=[];for(let w=weekStart(first);w<next;w=addDay(w,7))weeks.push(weekReport(s,w,today));
  const assigned=weeks.filter(w=>w.end.slice(0,7)===month);
  const closed=assigned.filter(w=>w.complete);
  const pending=assigned.filter(w=>!w.complete);
  const sum=(key)=>closed.reduce((n,w)=>n+w[key],0);
  const recorded=days.filter(d=>d.booked&&!d.active);
  const opening=Object.prototype.hasOwnProperty.call(s.openings,month)?s.openings[month]:null;
  return {days,weeks,assigned,closed,pending,opening,soll:assigned.length*weeklyTarget(s),closedSoll:closed.length*weeklyTarget(s),actual:sum('actual'),plus:sum('plus'),minus:sum('minus'),ot:sum('ot'),diff:sum('diff'),calendarWork:days.reduce((n,d)=>n+d.work,0),calendarCredit:days.reduce((n,d)=>n+d.credit,0),calendarTarget:days.reduce((n,d)=>n+d.target,0),recordedDiff:recorded.reduce((n,d)=>n+d.diff,0),missing:days.filter(d=>d.day<today&&d.target>0&&(!d.booked||d.active)).length};
}
// Provisional daily ZA: latest explicit monthly opening, then saved daily differences.
// Weeks belong to the month of Sunday, just as in monthReport. No persisted balance.
function dailyZABalance(s,today){
  const anchor=Object.keys(s.openings).filter(m=>m<=today.slice(0,7)).sort().pop();
  if(!anchor)return null;
  const first=anchor+'-01',firstWeek=weekStart(first);
  // Completed entries and credits remain counted even if another booking is running on that day.
  const recorded={...s,active:null};
  const dates=new Set([...s.entries.map(e=>localDay(e.start)),...s.credits.map(c=>c.day)]);
  let balance=s.openings[anchor];
  for(const day of dates){
    if(day<firstWeek||day>today)continue;
    const d=daily(recorded,day,today);
    if(d.booked)balance+=d.diff;
  }
  const ref=s.reference&&s.reference.carry;
  if(ref&&ref.start>=firstWeek&&addDay(ref.start,ref.days-1)<=today&&weekReport(recorded,ref.start,today).carry)balance+=ref.plus;
  return balance;
}
function weekNumber(day){const d=dayDate(weekStart(day));d.setDate(d.getDate()+3);const first=weekStart(d.getFullYear()+'-01-04');return Math.round((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-Date.UTC(dayDate(first).getFullYear(),dayDate(first).getMonth(),dayDate(first).getDate())-3*86400000)/604800000)+1;}
function parseSigned(s){const m=String(s).trim().match(/^([+−-]?)(\d{1,5}):([0-5]\d)$/);assert(m,'Bitte Saldo als +H:MM oder -H:MM eingeben.');return (m[1]==='-'||m[1]==='−'?-1:1)*(Number(m[2])*60+Number(m[3]));}

var state=emptyState();
var saved=state.revision, pending=null, seq=0, status='Lokaler Speicher wird geöffnet …', error='', page='home', month=localDay(Date.now()).slice(0,7), selected=localDay(Date.now()), form=null;
var showWeekends=false;
var settingsSection='';
var ckmMonth=localDay(Date.now()).slice(0,7);
const PALETTE_KEY='timelog.palette';
function readPalette(){try{return localStorage.getItem(PALETTE_KEY)==='pastel'?'pastel':'original';}catch(e){return 'original';}}
var palette=readPalette();
const THEME_KEY='timelog.theme';
function readTheme(){try{const value=localStorage.getItem(THEME_KEY);return ['light','dark','system'].includes(value)?value:'dark';}catch(e){return 'dark';}}
var theme=readTheme();
const systemThemeQuery=typeof window.matchMedia==='function'?window.matchMedia('(prefers-color-scheme: dark)'):null;
function effectiveTheme(){return theme==='system'?(systemThemeQuery&&!systemThemeQuery.matches?'light':'dark'):theme;}
function syncSystemTheme(){if(theme==='system')applyTheme();}
function setupSystemTheme(){if(systemThemeQuery){if(typeof systemThemeQuery.addEventListener==='function')systemThemeQuery.addEventListener('change',syncSystemTheme);else if(typeof systemThemeQuery.addListener==='function')systemThemeQuery.addListener(syncSystemTheme);}window.addEventListener('pageshow',syncSystemTheme);window.addEventListener('focus',syncSystemTheme);document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncSystemTheme();});}
function setTheme(value){if(!['light','dark','system'].includes(value)||pending)return;try{localStorage.setItem(THEME_KEY,value);}catch(e){error='Darstellung konnte nicht lokal gespeichert werden.';syncUI();return;}theme=value;error='';render();}
// Local navigation diagnostics: bounded, in-memory geometry only.
const navTraceStart=performance.now(),navTraceFirst=[],navTraceRecent=[];
let navFirstTouch=null;
function readNavGeometry(stage){
 const nav=$('nav'),root=document.documentElement,vv=window.visualViewport;
 if(!nav||!nav.offsetHeight)return null;
 const n=v=>Number.isFinite(v)?Math.round(v*100)/100:null;
 const r=nav.getBoundingClientRect(),css=getComputedStyle(nav),bodyCss=getComputedStyle(document.body);
 return {stage,ms:n(performance.now()-navTraceStart),page,theme:effectiveTheme(),
  standalone:!!navigator.standalone||window.matchMedia('(display-mode: standalone)').matches,
  screen:[n(screen.width),n(screen.height)],dpr:n(devicePixelRatio),
  inner:[n(innerWidth),n(innerHeight)],client:[n(root.clientWidth),n(root.clientHeight)],
  visual:vv?{width:n(vv.width),height:n(vv.height),offsetTop:n(vv.offsetTop),offsetLeft:n(vv.offsetLeft),scale:n(vv.scale)}:null,
  scrollY:n(window.scrollY),documentHeight:n(root.scrollHeight),bodyMinHeight:bodyCss.minHeight,
  nav:{top:n(r.top),bottom:n(r.bottom),height:n(r.height),position:css.position,cssTop:css.top,cssBottom:css.bottom,paddingBottom:css.paddingBottom},
  gaps:{inner:n(innerHeight-r.bottom),visual:vv?n(vv.height+vv.offsetTop-r.bottom):null,screen:n(screen.height-r.bottom)},
  anchor:{height:root.style.getPropertyValue('--visible-height'),top:root.style.getPropertyValue('--visible-nav-top'),bottom:root.style.getPropertyValue('--visible-nav-bottom')}};
}
function recordNavGeometry(stage){
 try{const sample=readNavGeometry(stage);if(!sample)return;
  if(navTraceFirst.length<24)navTraceFirst.push(sample);
  else{navTraceRecent.push(sample);if(navTraceRecent.length>24)navTraceRecent.shift();}
 }catch(e){/* Diagnostics must never interrupt the app. */}
}
function captureFirstNavTouch(){
 if(navFirstTouch)return;
 try{navFirstTouch=readNavGeometry('vor erster Interaktion');}catch(e){}
}
function navDiagnosticReport(){
 recordNavGeometry('Bericht vor Dialog');
 return JSON.stringify({version:VERSION,unit:'CSS-px',startup:navTraceFirst,firstInteraction:navFirstTouch,recent:navTraceRecent},null,2);
}
function openNavDiagnostic(){
 if(pending||form||updateBusy)return;
 const report=navDiagnosticReport();
 openForm('Navigationsdiagnose','<p class="sub muted">Nur Layout-Messwerte, keine Buchungen. Der Bericht enthält den Start und die erste Berührung, auch wenn sich die Leiste inzwischen korrigiert hat. Kopiere ihn manuell in den Chat.</p><textarea id="navDiagnosticText" readonly rows="12" aria-label="Layoutbericht">'+esc(report)+'</textarea>'+btn('Bericht kopieren','copyNavDiagnostic()','full')+'<p id="navDiagnosticCopy" class="sub muted" role="status"></p>',null);
}
async function copyNavDiagnostic(){
 const field=$('navDiagnosticText'),msg=$('navDiagnosticCopy');if(!field||!msg)return;
 try{if(!navigator.clipboard)throw new Error();await navigator.clipboard.writeText(field.value);msg.textContent='Bericht kopiert.';}
 catch(e){field.focus();field.select();field.setSelectionRange(0,field.value.length);msg.textContent='Text markiert. Bitte über das iOS-Menü kopieren.';}
}
// Align the fixed navigation with the visible viewport after an iOS PWA reload.
// UI only: never reload the document, rerender a form, or write user data.
let viewportFrame=0,viewportTimers=[];
function syncNavViewport(){
 viewportFrame=0;
 if(document.hidden||form)return;
 const focused=document.activeElement;
 if(focused&&focused.matches('input,textarea,select,[contenteditable="true"]'))return;
 const nav=$('nav'),vv=window.visualViewport;
 if(!nav||!nav.offsetHeight)return;
 if(vv&&Math.abs(vv.scale-1)>0.01)return;
 const height=vv?vv.height:window.innerHeight,offset=vv?vv.offsetTop:0;
 if(!Number.isFinite(height)||!Number.isFinite(offset)||height<240||offset<0||height>10000)return;
 const top=Math.max(0,offset+height-nav.offsetHeight);
 const root=document.documentElement.style;
 const h=Math.round(height*100)/100+'px',t=Math.round(top*100)/100+'px';
 if(root.getPropertyValue('--visible-height')!==h)root.setProperty('--visible-height',h);
 if(root.getPropertyValue('--visible-nav-top')!==t)root.setProperty('--visible-nav-top',t);
 if(root.getPropertyValue('--visible-nav-bottom')!=='auto')root.setProperty('--visible-nav-bottom','auto');
 recordNavGeometry('Viewport-Abgleich');
}
function queueViewportSync(){if(!viewportFrame)viewportFrame=requestAnimationFrame(syncNavViewport);}
function settleNavViewport(){
 queueViewportSync();viewportTimers.forEach(clearTimeout);
 viewportTimers=[80,250,600,1200,2400].map(ms=>setTimeout(queueViewportSync,ms));
}
function setupNavViewport(){
 document.addEventListener('touchstart',captureFirstNavTouch,{capture:true,passive:true});
 document.addEventListener('pointerdown',captureFirstNavTouch,{capture:true,passive:true});
 recordNavGeometry('Start');
 window.addEventListener('resize',queueViewportSync);
 window.addEventListener('pageshow',settleNavViewport);
 window.addEventListener('focus',settleNavViewport);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)settleNavViewport();});
 if(window.visualViewport){window.visualViewport.addEventListener('resize',queueViewportSync);window.visualViewport.addEventListener('scroll',queueViewportSync);}
 settleNavViewport();
}
function applyTheme(){const effective=effectiveTheme();document.documentElement.dataset.theme=effective;const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=effective==='light'?'#f2f2f7':'#000000';}
function themeControl(){return '<h2>Hell / Dunkel / System</h2><div class="theme-options">'+[['light','Hell'],['dark','Dunkel'],['system','System']].map(([key,label])=>'<button class="theme-choice" aria-pressed="'+(theme===key)+'" onclick="setTheme(\''+key+'\')">'+label+(theme===key?' ✓':'')+'</button>').join('')+'</div><div class="appearance-divider"></div>';}

const CKM_VISIBILITY_KEY='timelog.ckm.visible';
function readCkmVisible(){try{return localStorage.getItem(CKM_VISIBILITY_KEY)!=='false';}catch(e){return true;}}
var ckmVisible=readCkmVisible();
function setCkmVisible(value){if(typeof value!=='boolean'||pending)return;try{localStorage.setItem(CKM_VISIBILITY_KEY,String(value));}catch(e){error='CKM-Sichtbarkeit konnte nicht lokal gespeichert werden.';syncUI();return;}ckmVisible=value;error='';render();}
function navItems(){return [['home','Heute'],['calendar','Kalender'],['reports','Daten'],['ckm','CKM'],['settings','Settings']].filter(([key])=>key!=='ckm'||ckmVisible);}
function ckmVisibilityControl(){return '<div class="appearance-divider"></div><h2>Navigation</h2><button class="ckm-switch" role="switch" aria-label="CKM anzeigen" aria-checked="'+ckmVisible+'" onclick="setCkmVisible('+(!ckmVisible)+')"><span>CKM anzeigen</span><span class="switch-track" aria-hidden="true"><i></i></span></button><p class="sub muted">Blendet den CKM-Reiter und die gelben CKM-Zeiten im Kalender ein oder aus. Einstellungen und gespeicherte Daten bleiben erhalten.</p>';}

function setPalette(value){if(!['original','pastel'].includes(value))return;try{localStorage.setItem(PALETTE_KEY,value);}catch(e){error='Farbwahl konnte nicht lokal gespeichert werden.';syncUI();return;}palette=value;error='';render();}
function openSettingsSection(section){if(!['','model','pause','appearance','backup','ckm','update'].includes(section)||pending)return;settingsSection=section;error='';render();window.scrollTo(0,0);}

const $=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=t=>new Date(t).toLocaleTimeString('de-AT',{hour:'2-digit',minute:'2-digit'});
const longDay=d=>dayDate(d).toLocaleDateString('de-AT',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const monthName=()=>dayDate(month+'-01').toLocaleDateString('de-AT',{month:'long',year:'numeric'});
function clock(ms){const s=Math.floor(Math.max(0,ms)/1000);return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(n=>String(n).padStart(2,'0')).join(':');}
function color(n){return n<0?'neg':n>0?'pos':'';}
function metric(label,value,detail='',cls=''){return '<div class="card"><div class="label">'+esc(label)+'</div><div class="num '+cls+'">'+esc(value)+'</div><small>'+esc(detail)+'</small></div>';}
function btn(text,action,cls=''){return '<button class="'+cls+'" onclick="'+esc(action)+'">'+esc(text)+'</button>';}
function line(title,sub,right,action){return '<button class="listrow" onclick="'+esc(action)+'"><span>'+esc(title)+'<small>'+esc(sub)+'</small></span><span>'+esc(right||'›')+'</span></button>';}
function go(p){
 const next=p==='ckm'&&!ckmVisible?'home':p;
 // Re-entering either month-based tab starts at the current local month.
 // Re-rendering the same tab or closing a dialog must preserve its selection.
 if(next!==page&&(next==='calendar'||next==='reports')){
  selected=localDay(Date.now());month=selected.slice(0,7);
 }
 settingsSection='';page=next;error='';render();window.scrollTo(0,0);
}
function shiftMonth(n){let [y,m]=month.split('-').map(Number);month=localDay(new Date(y,m-1+n,1,12).getTime()).slice(0,7);selected=month===localDay(Date.now()).slice(0,7)?localDay(Date.now()):month+'-01';render();}
function calendarWeekendControl(){return '<button class="weekendtoggle month-weekends" aria-label="'+(showWeekends?'Wochenenden ausblenden':'Wochenenden einblenden')+'" title="'+(showWeekends?'Wochenenden ausblenden':'Wochenenden einblenden')+'" onclick="toggleWeekends()">'+(showWeekends?'5 Tage':'7 Tage')+'</button>';}
function monthBar(){return '<div class="month">'+btn('‹','shiftMonth(-1)')+'<strong>'+esc(monthName())+'</strong>'+btn('›','shiftMonth(1)')+(page==='calendar'?calendarWeekendControl():'')+'</div>'+((page==='calendar'||page==='reports')?'<p class="swipe-hint">Monat wechseln: nach links oder rechts wischen</p>':'');}
function request(action){if(pending||!db)return;error='';pending={seq:++seq,action};status='Speicherung ausstehend …';syncUI();processRequest(pending);}
function receive(id,next,err){if(!pending||pending.seq!==id)return false;const kind=pending.action.type;if(!err&&kind==='ckmSave')ckmMonth=pending.action.day.slice(0,7);pending=null;if(next){state=next;saved=next.revision;}error=err||'';status=err?'Aktion nicht bestätigt':'Lokal gespeichert';if(!err&&form){form=null;$('overlay').classList.add('hidden');}if(!err&&['json','profileExport'].includes(kind))status='Export bereitgestellt';if(!err&&kind==='import')status='Import lokal gespeichert';if(!err&&kind==='history')status='Historische Buchungen lokal ergänzt';if(!err||!form)render();else{ $('formError').textContent=error;syncUI(); }return true;}
function syncUI(){const sync=$('sync'),footer=$('settingsSync'),color=pending?'var(--pending,#fbbf24)':error||!db?'var(--red)':'var(--green)';sync.textContent=status;sync.style.color=color;sync.hidden=status==='Lokal gespeichert'&&!pending&&!error&&!!db;if(footer){footer.textContent=status;footer.style.color=color;} $('error').textContent=error;document.querySelectorAll('button[data-write]').forEach(b=>b.disabled=!!pending||!db);}
function act(type){request({type,note:state.active?state.active.note:''});}
function openManualStart(){
 if(pending||!db||state.active)return;
 const now=Date.now(),today=localDay(now);
 openForm('Arbeitsbeginn festlegen','<p class="muted">'+esc(longDay(today))+'</p>'+field('Beginnzeit heute','fManualStart','time',localInput(now).slice(11),'required step="60"')+'<p class="sub muted">Der Timer rechnet ab dieser Uhrzeit. Ein für den Tag gespeichertes festes Pausenfenster wird in der laufenden Nettozeit berücksichtigt.</p>','manualStart',today);
}
function openManualEnd(){
 if(pending||!db||!state.active)return;const now=Date.now(),a=state.active,today=localDay(now),startDay=localDay(a.start);
 // Normally the end belongs to today; only a multi-day booking needs a day selector.
 let days='';if(startDay<today){for(let d=startDay;d<=today;d=addDay(d,1))days+='<option value="'+esc(d)+'"'+(d===today?' selected':'')+'>'+esc(longDay(d))+'</option>';}
 const dateField=days?'<label for="fManualEndDay">Endtag</label><select id="fManualEndDay">'+days+'</select>':'<p class="muted">'+esc(longDay(today))+'</p>';
 openForm('Arbeitsende festlegen',dateField+field('Endzeit','fManualEnd','time',localInput(now).slice(11),'required step="60"')+'<p class="sub muted">Beginn: '+esc(longDay(startDay))+' · '+esc(fmt(a.start))+'. Die Buchung wird mit der gewählten Endzeit abgeschlossen. Automatische Tagespause wie bisher.</p>','manualEnd',a.id);
 form.endDay=today;
}
function openWorkActions(){if(!state.active)return;openForm('Weitere Aktionen',btn(state.active.pauseStart===null?'Pause starten':'Pause beenden',"act('"+(state.active.pauseStart===null?'pause':'resume')+"')",'full warn')+(activeNeedsWindow(state)&&!activeCanAdoptWindow(state)?btn('Festes Pausenfenster für laufenden Tag übernehmen','openActiveFixed()','full'):'')+btn('Notiz bearbeiten','editNote()','full')+btn('Laufende Buchung verwerfen','discard()','full'),null);}
function openActiveFixed(){if(pending||!db||!activeNeedsWindow(state))return;const a=state.active,day=localDay(a.start),action={type:'activeFixedApply',id:a.id,confirmed:true};const next=change(state,action),now=Date.now(),before=activeProjection(state,now),after=activeProjection(next,now);openForm('Pausenregel für laufenden Tag','<p>'+esc(longDay(day))+' · '+esc(configuredWindow(day).join(' – '))+'</p><p>Netto aktuell: '+esc(clock(before.total))+' → '+esc(clock(after.total))+'</p><p>'+esc('Gespeicherte Arbeit: '+signed(daily(state,day).work,false)+' → '+signed(daily(next,day).work,false)+' · Arzt / Behörde: '+signed(dayAB(daily(state,day)),false)+' → '+signed(dayAB(daily(next,day)),false))+'</p><p class="sub muted">Bereits gespeicherte Arbeits- und Arztbuchungen dieses Tages werden ebenfalls neu berechnet. Andere Tage bleiben unverändert.</p><label class="check"><input type="checkbox" id="fActiveFixedConfirm"> Tageskorrektur bestätigen</label>','activeFixed',a.id);}
function discard(){openForm('Laufenden Tag verwerfen','<p>Diese laufende Buchung wird ohne Speicherung beendet.</p>'+btn('Jetzt verwerfen',"act('discard')",'full danger'),null);}
function activeProjection(s,now){
 const a=s.active;if(!a)return null;
 const day=localDay(a.start),gross=Math.max(0,now-a.start),manual=Math.min(gross,a.pauseMs+(a.pauseStart===null?0:Math.max(0,now-a.pauseStart)));
 const window=activeFixedWindow(s);
 if(!window||!gross)return {pause:manual,auto:0,net:gross-manual,total:s.entries.filter(e=>localDay(e.start)===day).reduce((n,e)=>n+e.end-e.start-e.pauseMs,0)+gross-manual};
 const e={id:a.id,start:a.start,end:now,pauseMs:manual,autoPause:true,autoPauseMs:0,note:a.note};
 const projected={...s,fixedPauseDays:{...(s.fixedPauseDays||{}),[day]:window},entries:s.entries.filter(x=>localDay(x.start)===day).map(x=>({...x})).concat(e),credits:s.credits.filter(c=>c.day===day).map(c=>({...c})),active:null};
 redistributePause(projected,day);
 return {pause:e.pauseMs,auto:e.autoPauseMs,net:gross-e.pauseMs,total:projected.entries.reduce((n,x)=>n+x.end-x.start-x.pauseMs,0)};
}
function todayMs(day,now){const es=state.entries.filter(e=>localDay(e.start)===day);let work=es.reduce((n,e)=>n+e.end-e.start-e.pauseMs,0);const a=state.active;if(a&&localDay(a.start)===day)return activeProjection(state,now).total;return work;}
function timerSnapshot(now){
 const today=localDay(now),a=state.active,day=a?localDay(a.start):today,d=daily(state,day);
 const last=d.es.slice().sort((x,y)=>y.end-x.end)[0]||null;
 const projected=a?activeProjection(state,now):null;
 const pause=a?projected.pause:last?last.pauseMs:0;
 const net=a?projected.net:last?Math.max(0,last.end-last.start-last.pauseMs):0;
 return {day,d,a,last,pause,net,total:projected?projected.total:todayMs(day,now)};
}
function live(){if(page!=='home'||!$('timer'))return;const t=timerSnapshot(Date.now());const phase=$('workPhase');if(phase&&t.a){const w=activeFixedWindow(state),now=Date.now(),inWindow=w&&windowBounds(w,t.day).every((v,i)=>i===0?now>=v:now<v);phase.textContent=t.a.pauseStart!==null?'Pause läuft':inWindow?'Mittagspause · Auto Abzug':'Arbeitszeit läuft';phase.classList.toggle('pos',t.a.pauseStart===null&&!inWindow);}
$('timer').textContent=clock(t.net);$('pauseTime').textContent=clock(t.pause);$('dayTotal').textContent=clock(t.total);$('bar').style.width=(t.d.target?Math.min(100,(t.total/MIN+t.d.credit)/t.d.target*100):0)+'%';$('target').textContent='Soll '+signed(t.d.target,false)+' · Gutschrift '+signed(t.d.credit,false);}
function home(){const now=Date.now(),today=localDay(now),a=state.active,day=a?localDay(a.start):today,d=daily(state,day),w=weekReport(state,weekStart(today),today),za=dailyZABalance(state,today);const t=timerSnapshot(now),start=a?a.start:t.last?t.last.start:null;return '<div class="card home-timer-card"><div class="label">'+(a?'Laufende Arbeitszeit':t.last?'Letzte Arbeitszeit':'Netto-Arbeitszeit')+'</div><div id="timer" class="timer">00:00:00</div><p id="workPhase" class="center '+(a?(a.pauseStart===null?'pos':''):'muted')+'">'+(a?(a.pauseStart===null?'Arbeitszeit läuft':'Pause läuft'):(d.booked?'Tag erfasst':'Bereit zum Einstempeln'))+'</p><div class="track"><div id="bar" class="bar"></div></div><small id="target"></small><div class="daily-total"><span class="muted">Tagessumme '+(day===today?'heute':esc(day))+'</span><strong id="dayTotal">00:00:00</strong></div></div><div class="grid">'+metric('Beginn',start?fmt(start):'–',a?'Aktuelle Buchung':t.last?'Letzte Buchung':'Noch keine Buchung')+'<div class="card"><div class="label">Pause</div><div id="pauseTime" class="num">00:00:00</div><small>'+ (a?((activeFixedWindow(state)||autoDay(day)&&pauseMinimumOn(day)>0)?'Auto Abzug':'Erfasst'):t.last?(t.last.autoPauseMs?'Auto Abzug':'Erfasst'):'Keine Buchung') +'</small></div></div>'+'<div class="grid home-summary">'+metric('KW '+weekNumber(today),signed(w.actual,false),'Wochensoll '+signed(weeklyTarget(state),false)).replace('class="card"','class="card home-week-card"')+metric('ZA-Konto',za===null?'–':signed(za),'Tagesaktuell · vorläufig',za===null?'':color(za))+'</div><div class="card home-absence">'+line('Abwesenheit','Urlaub, Krank, Feiertag, Arzt','+',"editCredit(null,'"+today+"')")+'</div>'+(a?(a.pauseStart!==null?btn('Pause beenden',"act('resume')",'full warn'):'')+btn('Arbeit beenden',"act('stop')",'full danger')+btn('Endzeit manuell wählen','openManualEnd()','full')+btn('Weitere Aktionen','openWorkActions()','full home-more'):btn('Arbeit starten',"act('start')",'full primary')+btn('Beginnzeit manuell wählen','openManualStart()','full'));}
function isWeekend(day){const wd=dayDate(day).getDay();return wd===0||wd===6;}
// Read-only calendar projection: never add CKM minutes to daily(), weekReport() or monthReport().
function calendarCkmMinutes(s,m,enabled){const totals=new Map();if(enabled)for(const e of ckmData(s).entries){if(e.day.slice(0,7)===m)totals.set(e.day,(totals.get(e.day)||0)+ckmDuration(e.start,e.end));}return totals;}
function calendarShowsWeekends(){return showWeekends;}
function visibleSelection(day){if(calendarShowsWeekends()||!isWeekend(day))return day;const forward=addDay(day,dayDate(day).getDay()===6?2:1);return forward.slice(0,7)===month?forward:addDay(day,dayDate(day).getDay()===6?-1:-2);}
function toggleWeekends(){showWeekends=!showWeekends;selected=visibleSelection(selected);render();}
function dayBookingRows(d){
 const w=fixedWindow(d.day,state),rows=[],mp=[];
 const add=(t,h)=>rows.push({t,h});const bounds=w?windowBounds(w,d.day):null;
 const range=(a,b)=>fmt(a)+' – '+fmt(b);
 const piece=(a,b,title,note,act)=>{if(b>a)add(a,line(title,range(a,b)+(note?' · '+note:''),signed(Math.floor((b-a)/MIN),false),act));};
 const exactWork=w&&d.es.every(e=>e.pauseMs===(e.autoPauseMs||0));
 for(const e of d.es){const act='editEntry('+JSON.stringify(e.id)+','+JSON.stringify(d.day)+')';
  if(exactWork&&e.autoPauseMs){const a=Math.max(e.start,bounds[0]),b=Math.min(e.end,bounds[1]);if(b-a===e.autoPauseMs){piece(e.start,a,'Arbeitszeit · NB',e.note,act);mp.push([a,b]);piece(b,e.end,'Arbeitszeit · NB',e.note,act);continue;}}
  if(w&&!e.pauseMs){piece(e.start,e.end,'Arbeitszeit · NB',(!e.autoPause?'Automatik aus'+(e.note?' · ':''):'')+e.note,act);continue;}
  add(e.start,line(range(e.start,e.end)+(localDay(e.start)!==localDay(e.end)?' (+Tag)':''),'Pause '+clock(e.pauseMs)+(e.autoPauseMs?' (inkl. Auto)':'')+(e.note?' · '+e.note:''),signed(Math.floor((e.end-e.start-e.pauseMs)/MIN),false),act));
 }
 for(const c of d.cs){const act='editCredit('+JSON.stringify(c.id)+','+JSON.stringify(d.day)+')';
  if(w&&c.pauseExcludedMinutes>0){const a=Math.max(c.absenceStart,bounds[0]),b=Math.min(c.absenceEnd,bounds[1]);piece(c.absenceStart,a,CREDIT_TYPES[c.type]+' · AB',c.note,act);mp.push([a,b]);piece(b,c.absenceEnd,CREDIT_TYPES[c.type]+' · AB',c.note,act);if(!c.minutes)add(c.absenceStart,line(CREDIT_TYPES[c.type],range(c.absenceStart,c.absenceEnd)+' · vollständig in MP',signed(0,false),act));continue;}
  add(hasCreditInterval(c)?c.absenceStart:Infinity,line(CREDIT_TYPES[c.type]+(w&&c.type==='AB'?' · AB':''),hasCreditInterval(c)?range(c.absenceStart,c.absenceEnd)+(c.note?' · '+c.note:''):c.type==='URL'&&c.day>localDay(Date.now())?'Genehmigt · Gutschrift ab Datum'+(c.note?' · '+c.note:''):c.note||'Zeitgutschrift',signed(c.minutes,false),act));
 }
 const merged=[];for(const p of mp.sort((a,b)=>a[0]-b[0])){const last=merged[merged.length-1];if(last&&p[0]<=last[1])last[1]=Math.max(last[1],p[1]);else merged.push(p.slice());}
 for(const [a,b] of merged)add(a,'<div class="listrow"><span>Mittagspause · MP<small>'+esc(range(a,b))+' · automatisch</small></span><span>'+esc(signed(Math.floor((b-a)/MIN),false))+'</span></div>');
 if(w&&!exactWork&&d.es.some(e=>e.pauseMs))add(Infinity,'<p class="sub muted">Erfasste Pausen sind ohne Zeitlage gespeichert; der Arbeitsanteil der Mittagspause ist bereits in den Arbeitsbuchungen berücksichtigt.</p>');
 return rows.sort((a,b)=>a.t-b.t).map(r=>r.h).join('');
}
function calendar(){selected=visibleSelection(selected);const today=localDay(Date.now()),r=monthReport(state,month,today),d=daily(state,selected);const seven=calendarShowsWeekends(),ckmMinutes=calendarCkmMinutes(state,month,ckmVisible);const visible=r.days.filter(x=>seven||!isWeekend(x.day));let cells=(seven?['Mo','Di','Mi','Do','Fr','Sa','So']:['Mo','Di','Mi','Do','Fr']).map(x=>'<div class="label center">'+x+'</div>').join('');for(let i=0;i<(dayDate(visible[0].day).getDay()+6)%7;i++)cells+='<div></div>';for(const x of visible){const holiday=holidayName(x.day),sick=x.cs.some(c=>c.type==='KRK'),vacation=x.cs.some(c=>c.type==='URL'),ft=!!holiday||x.cs.some(c=>c.type==='FT');const kind=ft?'holiday':sick?'sick':vacation?'vacation':(x.es.length||x.active)?'ok':x.booked?'credit':!x.target?'off':'';const futureVacation=vacation&&!x.booked;const detail=x.active?'Läuft':futureVacation?'Genehmigt':x.booked?signed(x.actual,false).replace(' h',''):ft?'FT':x.target?'·':'Frei';const label=futureVacation?(seven?'URL':'Urlaub'):(ft?'FT ':sick?'KRK ':vacation?'URL ':'')+(x.booked||x.active||futureVacation?detail:ft?'':detail);const ckm=ckmMinutes.get(x.day)||0,combined=ckm&&(ft||sick||vacation||x.booked||x.active||x.cs.length),ckmLabel=ckm?signed(ckm,false).replace(' h',''):'';const tileKind=ckm?(combined?kind+' ckm-combined':'ckm-only'):kind;cells+='<button class="'+tileKind+' '+(x.day===selected?'picked':'')+(x.day===today?' today':'')+'" aria-label="'+esc(longDay(x.day)+(holiday?' · '+holiday:'')+(sick?' · Krankenstand':'')+(vacation?' · Urlaub':'')+' · '+detail+(ckm?' · CKM '+ckmLabel+' h':''))+'" onclick="selectDay(\''+x.day+'\')">'+Number(x.day.slice(8))+(ckm&&!combined?'':'<small>'+esc(label.trim())+'</small>')+(ckm?'<small class="ckm-calendar-hours">'+esc(ckmLabel)+'</small>':'')+'</button>';}
let rows=dayBookingRows(d);return monthBar()+'<div class="card calendar-month"><div class="calendar '+(seven?'seven':'')+(visible.some(x=>ckmMinutes.has(x.day))?' has-ckm':'')+'">'+cells+'</div><div class="callegend"><span><i class="legend-work"></i>Arbeit</span><span><i class="legend-sick"></i>Krankenstand</span><span><i class="legend-vacation"></i>Urlaub</span><span><i class="legend-holiday"></i>Feiertag</span><span><i class="legend-credit"></i>Sonstige Buchung</span>'+(ckmVisible?'<span><i class="legend-ckm"></i>CKM</span>':'')+'</div>'+r.days.filter(x=>holidayName(x.day)).map(x=>'<p class="sub holidaytext">'+esc(x.day.slice(8)+'. '+holidayName(x.day))+'</p>').join('')+'</div><div class="card calendar-day"><h2>'+esc(longDay(selected))+'</h2>'+(holidayName(selected)?'<p class="holidaytext">'+esc(holidayName(selected))+'</p>':'')+'<div class="row"><small>Soll '+esc(signed(d.target,false))+'</small><strong class="'+color(d.diff)+'">'+(d.active?'Läuft':d.booked?esc(signed(d.diff)):d.cs.some(c=>c.type==='URL')?'Urlaub':d.target?'Offen':'Frei')+'</strong></div>'+ (rows||'<p class="muted">Keine abgeschlossene Buchung</p>')+(!d.active&&(d.es.length||d.cs.some(hasCreditInterval))?calendarPauseAction(d):'')+'<div class="calendar-actions">'+btn('Arbeitszeit +',"editEntry(null,'"+selected+"')",'full primary')+btn('Abwesenheit +',"editCredit(null,'"+selected+"')",'full')+'</div></div>'+(ckmMinutes.has(selected)?'<div class="card calendar-ckm-day"><div class="row"><h2><i class="legend-ckm" aria-hidden="true"></i> CKM</h2><strong>'+esc(signed(ckmMinutes.get(selected),false))+'</strong></div><p class="sub muted">Separate CKM-Arbeitszeit · keine Anrechnung im ZA-Konto.</p></div>':'');}
function calendarPauseAction(d){
 const day=d.day,w=configuredWindow(day),old=fixedWindow(day);
 if(w||old)return btn(old?'Pausenregel prüfen':'Pausenfenster anwenden',"openFixedDay('"+day+"')",'full');
 if(!state.fixedPauseConfig&&!isWeekend(day))return '<p class="sub muted">Bisherige Dauerregel · festes Pausenfenster noch nicht eingerichtet.</p>'+btn('Pausenfenster einrichten & Tag korrigieren',"openFixedConfig('"+day+"')",'full');
 // An excluded weekday keeps its duration rule; configuration may be changed explicitly under Settings.
 return '';
}
function selectDay(d){selected=d;render();}
function monthCreditTotals(s,m,today=localDay(Date.now())){
 const totals={AB:0,KRK:0,URL:0,ZA:0,FT:0,FREI:0};
 for(const c of s.credits)if(c.day.slice(0,7)===m&&(!c.vacationRange||c.day<=today))totals[c.type]+=c.minutes;
 return totals;
}
function abMonthCard(today){
 const pendingDays=convertibleABDays(state,month,today),legacy=legacyABDays(state,month,today);
 const totals=monthCreditTotals(state,month,today);
 return '<div class="card absence-month"><h2>Abwesenheiten</h2>'+['AB','KRK','URL','ZA','FT'].map(k=>'<div class="row report-row"><span>'+esc(CREDIT_TYPES[k])+'</span><strong>'+esc(signed(totals[k],false))+'</strong></div>').join('')+'<p class="sub muted">Kalendermonat · anrechenbare Gutschriften · in Ist enthalten</p>' +(pendingDays.length?'<p class="sub muted">'+pendingDays.length+' ältere Arztbuchungstage nutzen noch die Dauerregel.</p>'+btn('Arztzeiten des Monats prüfen','openFixedMonthAB()','full'):!state.fixedPauseConfig&&legacy.length?'<p class="sub muted">Festes Pausenfenster noch nicht eingerichtet. Ältere Arztzeiten werden nach bisheriger Regel angezeigt.</p>'+btn('Pausenfenster einrichten','openFixedConfig()','full'):'')+'</div>';
}
// Read-only calendar-month chart, using exactly the existing daily report values.
function dailyTargetChart(days,today){
 const recorded=days.filter(d=>d.day<=today&&d.booked&&!d.active&&d.diff!==null);
 const peak=Math.max(0,...days.map(d=>d.target),...recorded.map(d=>d.actual));
 const step=Math.max(60,Math.ceil(peak/240)*60),max=4*step;
 const left=43,right=377,top=14,bottom=154;
 const x=i=>left+(right-left)*i/Math.max(1,days.length-1),y=v=>bottom-(bottom-top)*v/max;
 const n=v=>Number(v.toFixed(2));
 const time=v=>signed(v,false).replace(' h','');
 const eligible=d=>d.day<=today&&d.booked&&!d.active&&d.diff!==null;
 const reached=recorded.filter(d=>d.diff>=0).length;
 let svg='<svg class="daily-target-chart" viewBox="0 0 388 184" role="img" aria-label="'+esc('Tages-Soll und gebuchtes Ist im Kalendermonat. '+reached+' Tage erreicht, '+(recorded.length-reached)+' unterschritten. Genaue Werte in Tageswerte.')+'">';
 for(let i=0;i<=4;i++){const yy=n(y(i*step));svg+='<line class="target-grid" x1="'+left+'" x2="'+right+'" y1="'+yy+'" y2="'+yy+'"/><text class="target-axis" x="'+(left-7)+'" y="'+(yy+3.5)+'" text-anchor="end">'+esc(time(i*step))+'</text>';}
 const labels=new Set([0,4,9,14,19,24,days.length-1]);
 days.forEach((d,i)=>{if(labels.has(i))svg+='<text class="target-axis" x="'+n(x(i))+'" y="175" text-anchor="middle">'+Number(d.day.slice(-2))+'.</text>';});
 svg+='<polyline class="target-plan" points="'+days.map((d,i)=>n(x(i))+','+n(y(d.target))).join(' ')+'"/>';
 days.forEach((d,i)=>{if(i>0&&eligible(d)&&eligible(days[i-1])){const prev=days[i-1],kind=d.diff>=0&&prev.diff>=0?'target-met':d.diff<0&&prev.diff<0?'target-missed':'target-mixed';svg+='<line class="target-actual '+kind+'" x1="'+n(x(i-1))+'" y1="'+n(y(prev.actual))+'" x2="'+n(x(i))+'" y2="'+n(y(d.actual))+'"/>';}});
 days.forEach((d,i)=>{if(eligible(d)){svg+='<circle class="target-dot '+(d.diff>=0?'target-met':'target-missed')+'" cx="'+n(x(i))+'" cy="'+n(y(d.actual))+'" r="3.2"><title>'+esc(d.day.slice(8)+'.'+d.day.slice(5,7)+'. · Ist '+signed(d.actual,false)+' · Soll '+signed(d.target,false)+' · '+signed(d.diff))+'</title></circle>';}});
 svg+='</svg>';
 const details=recorded.length?'<details class="target-details"><summary>Tageswerte anzeigen</summary><table aria-label="Gebuchte Tageswerte"><thead><tr><th scope="col">Tag</th><th scope="col">Soll</th><th scope="col">Ist</th><th scope="col">Diff.</th></tr></thead><tbody>'+recorded.map(d=>'<tr><th scope="row">'+esc(d.day.slice(8)+'.'+d.day.slice(5,7)+'.')+'</th><td>'+esc(time(d.target))+'</td><td>'+esc(time(d.actual))+'</td><td class="'+(d.diff>=0?'pos':'neg')+'">'+esc(signed(d.diff).replace(' h',''))+'</td></tr>').join('')+'</tbody></table></details>':'<p class="sub muted">Noch keine abgeschlossenen Buchungstage in diesem Monat.</p>';
 return '<div class="card daily-target-card"><h2>Tagessoll im Monatsverlauf</h2>'+svg+'<div class="target-legend"><span><i class="target-soll-key"></i>Soll</span><span><i class="target-met-key"></i>Erreicht</span><span><i class="target-missed-key"></i>Unterschritten</span></div><p class="sub muted">Ist inkl. Gutschriften · offene, laufende und zukünftige Tage ohne Ist-Wert</p>'+details+'</div>';
}
function reports(){const today=localDay(Date.now()),r=monthReport(state,month,today);return monthBar()+'<h2>Kalendermonat</h2><div class="grid">'+metric('Soll',signed(r.calendarTarget,false))+metric('Ist',signed(r.calendarWork+r.calendarCredit,false),'inkl. Gutschriften')+metric('Gebuchte Differenz',signed(r.recordedDiff),r.missing+' offene vergangene Solltage · ohne Minus',color(r.recordedDiff))+metric('Gutschriften',signed(r.calendarCredit,false))+'</div><div class="card za-month"><div class="za-layout"><div class="za-value"><div class="label">ZA-Konto · Modell</div><div class="num '+(r.opening===null?'':color(r.opening+r.diff))+'">'+(r.opening===null?'Nicht hinterlegt':esc(signed(r.opening+r.diff)))+'</div><small>Vormonat: '+(r.opening===null?'–':esc(signed(r.opening)))+'</small></div>'+btn('Saldo bearbeiten','editOpening()','za-edit')+'</div></div><div class="card"><h2>Abrechnung · volle Wochen</h2><p class="sub muted">Nur vollständige, abgelaufene Wochen zählen zum Saldo.</p><div class="report-summary"><p class="sub muted">'+r.closed.length+' / '+r.assigned.length+' Wochen vollständig · Soll gesamt '+esc(signed(r.soll,false))+'</p><div class="row report-row"><span>Soll (abgeschlossen)</span><strong>'+esc(signed(r.closedSoll,false))+'</strong></div><div class="row report-row"><span>Ist (abgeschlossen)</span><strong>'+esc(signed(r.actual,false))+'</strong></div></div><div class="row report-row"><span>Mehrarbeit</span><strong class="pos">'+esc(signed(r.plus))+'</strong></div><div class="row report-row"><span>Minusstunden</span><strong class="neg">'+esc(signed(r.minus))+'</strong></div><div class="row report-row"><span>Ü50 (Modell)</span><strong>'+esc(signed(r.ot,false))+'</strong></div><div class="row report-row report-total"><span>Monatssaldo</span><strong class="'+color(r.diff)+'">'+esc(signed(r.diff))+'</strong></div></div>'+abMonthCard(today)+dailyTargetChart(r.days,today)+'<div class="card"><h2>Kalenderwochen</h2>'+r.weeks.map(w=>line('KW '+weekNumber(w.start),w.start.slice(5)+' – '+w.end.slice(5)+' · '+(w.end.slice(0,7)!==month?'Folgemonat':w.complete?'Vollständig':'Vorläufig'),signed(w.actual,false),"showWeek('"+w.start+"')")).join('')+'</div>';}
function showWeek(start){const w=weekReport(state,start,localDay(Date.now()));openForm('KW '+weekNumber(start),'<p class="muted">'+esc(w.start+' – '+w.end)+'</p>'+(w.carry?'<p class="sub holidaytext">Aggregierter Übertrag: '+esc(signed(w.carryActual,false))+' Ist ('+esc(signed(w.carryPlus))+'); keine Einzelzeiten vorhanden.</p>':'')+w.days.map(d=>'<div class="listrow"><span>'+esc(longDay(d.day))+'<small>'+esc(d.active?'Läuft':d.booked?signed(d.diff):d.target?'Offen':'Frei')+'</small></span><strong>'+esc(signed(d.actual,false))+'</strong></div>').join('')+'<p class="sub muted">'+w.missing.length+' offene Solltage · kein automatischer Minusabzug</p><p>MA '+esc(signed(w.plus))+' · Minus '+esc(signed(w.minus))+' · Ü50 '+esc(signed(w.ot,false))+'</p>',null);}
const PAUSE_DAY_NAMES=['So','Mo','Di','Mi','Do','Fr','Sa'];
function pauseDayLabel(days){return PAUSE_DAY_NAMES.filter((_,i)=>days[i]).join(', ')||'Keine';}
function pauseRulesLabel(day,s=state){const days=pauseDaysOn(day,s),mins=pauseMinimumsOn(day,s);return [1,2,3,4,5].filter(i=>days[i]).map(i=>PAUSE_DAY_NAMES[i]+' '+mins[i]+' min').join(' · ')||'Keine';}
function openPauseDays(){if(pending||!db)return;const today=localDay(Date.now()),tomorrow=addDay(today,1),blocked=(state.active&&localDay(state.active.start)>=today)||state.entries.some(e=>localDay(e.start)>=today);const from=blocked?tomorrow:today;const days=pauseDaysOn(from,state),mins=pauseMinimumsOn(from,state);openForm('Dauerregel je Wochentag','<label for="fPauseFrom">Gültig ab</label><select id="fPauseFrom" onchange="loadPauseDays()"><option value="'+today+'" '+(blocked?'disabled':'selected')+'>Heute</option><option value="'+tomorrow+'" '+(blocked?'selected':'')+'>Morgen</option></select>'+[1,2,3,4,5].map(i=>'<label class="check"><input type="checkbox" id="fPauseDay'+i+'" '+(days[i]?'checked':'')+'> '+PAUSE_DAY_NAMES[i]+' · Automatik</label>'+field(PAUSE_DAY_NAMES[i]+' – Mindestpause (Minuten)','fPauseMin'+i,'number',mins[i],'required min="0" max="'+modelOf(state).pauseThreshold+'" step="1"')).join('')+'<p class="sub muted">Schwelle: '+esc(signed(modelOf(state).pauseThreshold,false))+' Brutto. Bereits erfasste Pausen werden angerechnet. Diese Dauerregel gilt nur an Tagen ohne festes Pausenfenster. Dort erhalten ausgeschaltete Tage keinen Auto-Abzug. Die Einstellungen gelten ab dem gewählten Datum; bestehende Buchungen werden nicht geändert.</p>','pauseDays');}
function loadPauseDays(){const day=$('fPauseFrom').value,days=pauseDaysOn(day,state),mins=pauseMinimumsOn(day,state);for(const i of [1,2,3,4,5]){$('fPauseDay'+i).checked=days[i];$('fPauseMin'+i).value=mins[i];}}
function modelDetails(s){const m=modelOf(s);return '<p>'+esc(m.label)+' · '+esc(signed(weeklyTarget(s),false))+' / Woche</p><p class="muted">Überstundengrenze: '+esc(signed(m.overtimeLimit,false))+'</p>'+[1,2,3,4,5].map(i=>'<div class="row"><small>'+PAUSE_DAY_NAMES[i]+' · '+esc(m.times[i].join(' – '))+'</small><strong>'+esc(signed(m.targets[i],false))+'</strong></div>').join('')+'<p class="sub muted">Privates Profil bleibt lokal. Profilwechsel nur über bestätigte Wiederherstellung.</p>';}
function effectivePauseSummary(s,day){const groups=new Map(),days=pauseDaysOn(day,s),mins=pauseMinimumsOn(day,s),p=s.fixedPauseConfig;for(const i of [1,2,3,4,5]){const rule=p&&p.days[i]?p.window.join(' – '):days[i]&&mins[i]>0?mins[i]+' min ab '+signed(modelOf(s).pauseThreshold,false)+' Brutto':'Kein Auto-Abzug';if(!groups.has(rule))groups.set(rule,[]);groups.get(rule).push(PAUSE_DAY_NAMES[i]);}return [...groups].map(([rule,names])=>'<div class="row pause-summary"><small>'+esc(names.join(', '))+'</small><strong>'+esc(rule)+'</strong></div>').join('');}
function openModelDetails(){openForm('Arbeitszeitmodell',modelDetails(state),null);}
function openPauseSettings(){if(pending||!db)return;const today=localDay(Date.now());openForm('Pausenregelung',effectivePauseSummary(state,today)+'<p class="sub muted">Pro Tag gilt nur eine Regel. Das feste Fenster hat Vorrang; die Dauerregel gilt an den übrigen Tagen.</p>'+btn('Festes Pausenfenster ändern','openFixedConfig()','full')+btn('Dauerregel ändern','openPauseDays()','full')+((state.pauseDaysHistory||[]).filter(p=>p.from>today).map(p=>'<p class="sub muted">Ab '+esc(p.from)+'</p>'+effectivePauseSummary(state,p.from)).join('')),null);}

function fixedConfigAction(day){
 const a={type:'fixedPauseConfig',window:[$('fFixedStart').value,$('fFixedEnd').value],days:Array.from({length:7},(_,i)=>i===0||i===6?!!(state.fixedPauseConfig&&state.fixedPauseConfig.days[i]):$('fFixedDay'+i).checked)};
 if(day){a.applyDay=day;a.confirmed=true;}return a;
}
function fixedDaySummary(before,after){return 'Arbeit: '+signed(before.work,false)+' → '+signed(after.work,false)+' · Arzt / Behörde: '+signed(dayAB(before),false)+' → '+signed(dayAB(after),false)+' · Ist: '+signed(before.actual,false)+' → '+signed(after.actual,false)+' · Differenz: '+signed(before.diff)+' → '+signed(after.diff);}
function openFixedConfig(day){
 if(pending||!db)return;
 const p=state.fixedPauseConfig||{days:Array(7).fill(false),window:['','']},days=p.days.slice();
 if(day)days[dayDate(day).getDay()]=true;
 const update=day?' oninput="previewFixedConfigDay()" onchange="previewFixedConfigDay()"':'';
 openForm(day?'Pausenfenster einrichten & Tag korrigieren':'Festes Mittagspausenfenster',(day?'<p>'+esc(longDay(day))+'</p>':'')+field('Beginn','fFixedStart','time',p.window[0],'required step="60"'+update)+field('Ende','fFixedEnd','time',p.window[1],'required step="60"'+update)+[1,2,3,4,5].map(i=>'<label class="check"><input type="checkbox" id="fFixedDay'+i+'" '+(days[i]?'checked':'')+update+'> '+PAUSE_DAY_NAMES[i]+'</label>').join('')+'<p class="sub muted">Für ausgewählte Tage ersetzt das Zeitfenster die dauerabhängige Automatik. Nur überlappende Arbeits-/Arztzeit wird abgezogen. Andere Tage behalten ihre bisherige Regel. Neue Tage und laufende Tage ohne gespeicherte Buchungen übernehmen die Einstellung; abgeschlossene Tage bleiben unverändert'+(day?' (außer dem hier bestätigten Tag).':' bis zur ausdrücklichen Umstellung.')+' Erfasste Pausen ohne Zeitlage werden auf den Arbeitsanteil angerechnet.</p>'+(day?'<p id="fFixedPreview" class="sub muted"></p><label class="check"><input type="checkbox" id="fFixedConfirm"> Einstellung speichern und diesen Tag korrigieren</label>':''),'fixedConfig',day);
 if(day)previewFixedConfigDay();
}
function previewFixedConfigDay(){
 $('fFixedConfirm').checked=false;
 try{const day=form.id,next=change(state,fixedConfigAction(day));$('fFixedPreview').textContent=fixedDaySummary(daily(state,day),daily(next,day));}catch(e){$('fFixedPreview').textContent=String(e.message||e);}
}
function openFixedDay(day){
 if(pending||!db)return;const w=configuredWindow(day)||fixedWindow(day),old=fixedWindow(day);
 openForm('Pausenregel für diesen Tag','<p>'+esc(longDay(day))+'</p><p class="sub muted">Aktuell: '+esc(old?old.join(' – '):'Dauerregel')+'</p><label for="fFixedMode">Abrechnungsregel</label><select id="fFixedMode" onchange="previewFixedDay()">'+(w?'<option value="fixed">'+esc(w.join(' – '))+' · fest</option>':'')+'<option value="duration">Bisherige Dauerregel</option></select><p id="fFixedPreview" class="sub muted"></p><label class="check"><input type="checkbox" id="fFixedConfirm"> Neuberechnung dieses Tages bestätigen</label>','fixedDay',day);previewFixedDay();
}
function previewFixedDay(){
 $('fFixedConfirm').checked=false;try{const day=form.id,next=change(state,{type:'fixedPauseApply',day,useFixed:$('fFixedMode').value==='fixed'});$('fFixedPreview').textContent=fixedDaySummary(daily(state,day),daily(next,day));}catch(e){$('fFixedPreview').textContent=String(e.message||e);}
}
function openFixedMonthAB(){
 if(pending||!db)return;
 try{const days=convertibleABDays(state,month,localDay(Date.now())),action={type:'fixedPauseMonthAB',month,days,confirmed:true},next=change(state,action);
 openForm('Arztzeiten des Monats korrigieren','<p>'+esc(monthName())+' · '+days.length+' Tage</p><p>Arzt / Behörde: <strong>'+esc(signed(monthAB(state,month),false))+' → '+esc(signed(monthAB(next,month),false))+'</strong></p>'+days.map(day=>'<p class="sub"><strong>'+esc(longDay(day))+'</strong><br>'+esc(fixedDaySummary(daily(state,day),daily(next,day)))+'</p>').join('')+'<p class="sub muted">Nur die aufgeführten abgeschlossenen Tage mit zeitlich erfasster Arztzeit und konfiguriertem Pausenfenster werden geändert. Manuelle Minutenbuchungen, bewusst auf Dauerregel gestellte Tage und andere Monate bleiben unverändert.</p><label class="check"><input type="checkbox" id="fFixedConfirm"> Aufgeführte Tage neu berechnen</label>','fixedMonthAB');form.action=action;form.revision=state.revision;
 }catch(e){openForm('Arztzeiten prüfen','<p>'+esc(e.message||e)+'</p>',null);}
}
function settings(){
 const today=localDay(Date.now()),back=btn('‹ Settings','openSettingsSection(\'\')','settings-back'),section=(title,body)=>back+'<div class="card"><h2>'+title+'</h2>'+body+'</div>';
 if(settingsSection==='model'||settingsSection==='pause')return section('Arbeitszeitmodell',state.model?modelDetails(state)+'<div class="appearance-divider"></div><h2>Pausenregelung</h2>'+effectivePauseSummary(state,today)+((state.pauseDaysHistory||[]).some(p=>p.from>today)?'<p class="sub muted">Änderung ab künftigem Datum vorgemerkt</p>':'')+btn('Pausenregelung bearbeiten','openPauseSettings()','full')+btn('Arbeitszeitmodell exportieren',"request({type:'profileExport'})",'full')+'<p class="sub muted">Private JSON-Datei mit Modell und Pausenregeln; ohne Buchungen oder CKM-Daten.</p>':profileRequired());
 if(settingsSection==='appearance')return section('Darstellung',themeControl()+'<p class="muted">Farbschema für Kalender und Buttons</p><div class="palette-options">'+[['original','Original'],['pastel','Pastell']].map(([key,label])=>'<button class="palette-choice" aria-pressed="'+(palette===key)+'" onclick="setPalette(\''+key+'\')"><span>'+label+'</span><span class="palette-swatches '+key+'"><i></i><i></i><i></i><i></i></span><span class="palette-mark">'+(palette===key?'✓':'')+'</span></button>').join('')+'</div><p class="sub muted">System folgt automatisch der Darstellung des Geräts. Original und Pastell sind unabhängig davon. Die Auswahl wird nur auf diesem Gerät gespeichert.</p><div class="appearance-divider"></div><h2>Kartenanordnung</h2><p class="sub muted">Block ca. eine halbe Sekunde gedrückt halten und verschieben. Auf Heute: Karten eines Paares seitlich tauschen, das gesamte Paar nach oben oder unten verschieben. Andere Raster über die Zwischenräume als Gruppe verschieben. Die Reihenfolge wird für jeden Bereich lokal gespeichert.</p>'+btn('Standardanordnung wiederherstellen','resetLayoutOrder()','full')+'<p class="sub muted">Setzt nur die Anordnung aller Bereiche auf den Stand von 3.0.61 zurück. Buchungen, Farben und übrige Einstellungen bleiben erhalten.</p>');
 if(settingsSection==='ckm')return section('CKM',ckmSettings());
 if(settingsSection==='update')return section('App aktualisieren','<div class="report-row"><span>Installierte Version</span><strong>'+VERSION+'</strong></div><p class="sub muted">Nur öffentliche Programmdateien werden geladen. Deine Buchungen und Einstellungen bleiben lokal erhalten. Eine lokale JSON-Sicherung vor Updates wird empfohlen. Nach einem vorbereiteten Update die App im App-Umschalter vollständig schließen und erneut öffnen.</p><button id="updateButton" class="full primary" onclick="checkAppUpdate()"'+(updateBusy?' disabled':'')+'>Nach Updates suchen</button><p id="updateStatus" class="sub muted" role="status" aria-live="polite">'+esc(updateStatus)+'</p>'+btn('Navigationsdiagnose anzeigen','openNavDiagnostic()','full')+'<p class="sub muted">Lokaler Layoutbericht für die Menüleistenprüfung.</p>');
 if(settingsSection==='backup')return section('Datensicherung & Import',btn('JSON-Sicherung',"request({type:'json'})",'full')+btn('Historische Buchungen ergänzen','openHistory()','full')+btn('JSON importieren / wiederherstellen','openImport()','full')+'<p class="sub muted">JSON-Sicherung enthält auch das Arbeitszeitmodell, Pausenregeln und alle CKM-Einträge samt Stundenlohn. Unter „Auf meinem iPhone“ ablegen; Browserdaten können verloren gehen. Darstellung und CKM-Sichtbarkeit sind separate Gerätepräferenzen.</p><p id="offlineStatus" class="sub muted">'+esc(offlineStatus)+'</p>');

 return '<div class="card settings-menu">'+[['Arbeitszeitmodell','Sollzeiten, Modell und Pausen','model'],['CKM','CKM-Einstellungen','ckm'],['Darstellung',({light:'Hell',dark:'Dunkel',system:'System'}[theme])+' · '+(palette==='pastel'?'Pastell':'Original'),'appearance'],['Datensicherung & Import','JSON, Wiederherstellung','backup'],['App aktualisieren','Installierte Version '+VERSION,'update']].map(([title,sub,key])=>line(title,sub,'›',"openSettingsSection('"+key+"')")).join('')+'</div><div class="footer">TimeLog '+VERSION+' · PWA · Offline<br>Abrechnungsmodell, keine Lohnverrechnung<br><span id="settingsSync" role="status" aria-live="polite"></span></div>';
}
function ckmShiftLabel(k){return k==='early'?'Früh':'Spät';}
function ckmMonthName(){return dayDate(ckmMonth+'-01').toLocaleDateString('de-AT',{month:'long',year:'numeric'});}
function shiftCkmMonth(n){if(pending)return;const [y,m]=ckmMonth.split('-').map(Number);ckmMonth=localDay(new Date(y,m-1+n,1,12).getTime()).slice(0,7);render();window.scrollTo(0,0);}
function ckmSettings(){const c=ckmData(state);return '<div class="report-row"><span>Stundenlohn</span><strong>'+esc(c.rateCents===null?'Nicht eingestellt':ckmEuro(c.rateCents)+' €/h')+'</strong></div>'+btn('Stundenlohn bearbeiten','openCkmConfig()','full')+'<p class="sub muted">Neue Einträge übernehmen den eingestellten Stundenlohn. Bereits gespeicherte Einträge behalten ihren Lohnsatz. Beginn und Ende werden bei jedem CKM-Eintrag individuell erfasst.</p>'+ckmVisibilityControl();}
function openCkmConfig(){if(pending||!db)return;const c=ckmData(state);openForm('CKM-Einstellungen',field('Stundenlohn (€ pro Stunde)','ckmRate','text',c.rateCents===null?'':(c.rateCents/100).toFixed(2).replace('.',','),'inputmode="decimal" placeholder="0,00"')+'<p class="sub muted">In CKM wird nur der Stundenlohn gespeichert. Beginn und Ende werden bei jedem Eintrag individuell erfasst. CKM rechnet die gesamte Schichtdauer ohne Pausenabzug.</p>','ckmConfig');}
function ckmConfigAction(){const c=ckmData(state);return {type:'ckmConfig',rateCents:ckmParseMoney($('ckmRate').value,true),shifts:JSON.parse(JSON.stringify(c.shifts||{early:null,late:null}))};}
function ckm(){const c=ckmData(state),r=ckmMonthData(state,ckmMonth);const money=n=>esc(ckmEuro(n));const value=(n,cls='')=>'<td class="ckm-money '+cls+'">'+money(n)+'</td>';const stat=(label,value,cls='')=>'<div class="card ckm-stat"><div class="label">'+label+'</div><div class="num '+cls+'">'+value+'</div></div>';const rows=r.entries.map(e=>{const a=ckmAmounts(e),act="editCkm('"+e.id+"')";return '<tr tabindex="0" aria-label="'+esc(e.day+' '+ckmShiftLabel(e.shift)+' bearbeiten')+'" onclick="'+esc(act)+'" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();'+esc(act)+';}"><td>'+esc(e.day.slice(8)+'.'+e.day.slice(5,7)+'.')+'</td><td>'+ckmShiftLabel(e.shift)+'</td><td class="ckm-hours">'+esc(signed(a.minutes,false).replace(/ h$/,''))+'</td>'+value(a.total)+value(a.wage)+value(a.tip,color(a.tip))+'</tr>';}).join('');
 return (!c.rateCents?'<div class="card"><p class="sub muted">Bitte zuerst den CKM-Stundenlohn hinterlegen.</p>'+btn('CKM-Einstellungen','openCkmConfig()','full')+'</div>':'')+'<div class="grid ckm-stats">'+stat('STUNDEN',esc(signed(r.minutes,false)))+stat('GEHALT',money(r.wage)+' €')+stat('TRINKGELD',money(r.tip)+' €',color(r.tip))+stat('GESAMTVERDIENST',money(r.total)+' €')+'</div>'+btn('Eintrag hinzufügen +',c.rateCents?'editCkm()':'openCkmConfig()','full primary')+'<div class="card ckm-card"><table class="ckm-table"><colgroup><col style="width:16.6666667%"><col style="width:16.6666667%"><col style="width:16.6666667%"><col style="width:16.6666667%"><col style="width:16.6666667%"><col style="width:16.6666667%"></colgroup><thead><tr><th>Datum</th><th>Schicht</th><th>Stunden</th><th>Gesamt</th><th>Lohn</th><th>TG</th></tr></thead><tbody>'+(rows||'<tr><td colspan="6" class="muted ckm-empty">Noch keine Einträge</td></tr>')+'</tbody></table></div>'+(r.entries.some(e=>ckmAmounts(e).tip<0)?'<p class="sub muted">Negative TG-Werte sind Fehlbeträge zum berechneten Lohn.</p>':'');}
function editCkm(id){if(pending||!db||!ckmVisible)return;const c=ckmData(state),e=id?c.entries.find(x=>x.id===id):null;if(id&&!e)return;if(!e&&!c.rateCents){openCkmConfig();return;}const day=e?e.day:localDay(Date.now()),shift=e?e.shift:'early',p=e||{start:'',end:''};openForm(e?'CKM-Eintrag bearbeiten':'CKM-Eintrag hinzufügen',field('Datum','ckmDay','date',day,'max="'+localDay(Date.now())+'"')+'<label for="ckmShift">Schicht</label><select id="ckmShift" onchange="previewCkm()"><option value="early"'+(shift==='early'?' selected':'')+'>Früh</option><option value="late"'+(shift==='late'?' selected':'')+'>Spät</option></select>'+field('Gesamtbetrag (€)','ckmTotal','text',e?(e.totalCents/100).toFixed(2).replace('.',','):'','inputmode="decimal" placeholder="0,00" oninput="previewCkm()"')+'<details id="ckmTimes" class="ckm-times" open><summary>Arbeitszeit <span id="ckmTimesSummary"></span></summary><div class="grid"><div>'+field('Beginn','ckmStart','time',p.start,'step="60" oninput="previewCkm()"')+'</div><div>'+field('Ende','ckmEnd','time',p.end,'step="60" oninput="previewCkm()"')+'</div></div>'+'</details>'+'<p class="sub muted">Stundenlohn: '+esc(ckmEuro(e?e.rateCents:c.rateCents))+' €/h · Lohn und Trinkgeld automatisch.</p><div id="ckmPreview" aria-live="polite"></div>','ckmEntry',id);form.ckmRate=e?e.rateCents:c.rateCents;previewCkm();}
function ckmPreset(){if(!form||form.kind!=='ckmEntry')return;previewCkm();}
function ckmFormAction(){const a={type:'ckmSave',id:form.id,day:$('ckmDay').value,shift:$('ckmShift').value,start:$('ckmStart').value,end:$('ckmEnd').value,totalCents:ckmParseMoney($('ckmTotal').value)};ckmDuration(a.start,a.end);return a;}
function previewCkm(){const el=$('ckmPreview');if(!el||!form)return;const st=$('ckmStart').value,en=$('ckmEnd').value;$('ckmTimesSummary').textContent=st&&en?st+' – '+en+(en<st?' (+1)':''):'Zeit eintragen';try{const a=ckmFormAction(),r=ckmAmounts({...a,rateCents:form.ckmRate});el.innerHTML='<div class="ckm-preview"><div class="report-row"><span>Arbeitszeit</span><strong>'+esc(signed(r.minutes,false))+'</strong></div><div class="report-row"><span>Lohn</span><strong>'+esc(ckmEuro(r.wage))+' €</strong></div><div class="report-row"><span>'+(r.tip<0?'Fehlbetrag':'Trinkgeld')+'</span><strong class="'+color(r.tip)+'">'+esc(ckmEuro(r.tip))+' €</strong></div><div class="report-row"><span>Effektiv / Stunde</span><strong>'+esc(ckmEuro(Math.round(r.total*60/r.minutes)))+' €</strong></div></div>'+(a.end<a.start?'<p class="sub muted">Ende am Folgetag.</p>':'');}catch(e){el.textContent=String(e.message||e);}}

const NAV_ICONS={"ckm":"<path d=\"M12 3 5.5 10.5H9L3 18h7v3h4v-3h7l-6-7.5h3.5z\"/>","home":"<path d=\"m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z\"/>","calendar":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M16 3v4M8 3v4M3 10h18M8 14h2m4 0h2m-8 4h2m4 0h2\"/>","reports":"<path d=\"M3 3v18h18M7 16v-5m5 5V7m5 9V4\"/>","settings":"<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M9.78 4.73L10.33 2.55L13.67 2.55L14.22 4.73L15.57 5.29L17.51 4.14L19.86 6.49L18.71 8.43L19.27 9.78L21.45 10.33L21.45 13.67L19.27 14.22L18.71 15.57L19.86 17.51L17.51 19.86L15.57 18.71L14.22 19.27L13.67 21.45L10.33 21.45L9.78 19.27L8.43 18.71L6.49 19.86L4.14 17.51L5.29 15.57L4.73 14.22L2.55 13.67L2.55 10.33L4.73 9.78L5.29 8.43L4.14 6.49L6.49 4.14L8.43 5.29z\"/>"};
function navIcon(p){return '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+NAV_ICONS[p]+'</svg>';}
function profileRequired(){return '<p>Für die reguläre Arbeitszeit ist ein privates Arbeitszeitprofil erforderlich. CKM benötigt kein Profil.</p>'+btn('Privates Profil einrichten','openProfile()','full primary');}
function render(){cancelLayoutHold(true);if(page==='ckm'&&!ckmVisible)page='home';applyTheme();document.body.dataset.palette=palette;$('nav').dataset.ckmVisible=String(ckmVisible);document.body.classList.toggle('calendar-compact',!!state.model&&page==='calendar');document.body.classList.toggle('home-compact',!!state.model&&page==='home');document.body.classList.toggle('reports-compact',!!state.model&&page==='reports');document.body.classList.toggle('ckm-compact',page==='ckm');const today=localDay(Date.now());$('heading').textContent={home:'Heute',calendar:'Kalender',reports:'Daten',settings:'Settings',ckm:'CKM'}[page];$('subtitle').textContent=page==='home'?today.slice(8,10)+'.'+today.slice(5,7)+'.'+today.slice(2,4):'';$('main').classList.toggle('month-swipe',!!state.model&&(page==='calendar'||page==='reports'));$('main').innerHTML=(!state.model&&['home','calendar','reports'].includes(page))?'<div class="card"><h2>Privates Arbeitszeitprofil erforderlich</h2><p>Importiere dein privates Profil, damit Sollzeit, Pausen und Abrechnungen korrekt berechnet werden. Die Datei bleibt auf diesem Gerät. CKM kann unabhängig davon über den eigenen Reiter verwendet werden.</p>'+btn('Privates Profil einrichten','openProfile()','full primary')+btn('Historische Buchungen ergänzen','openHistory()','full')+btn('Vorhandene JSON-Sicherung importieren','openImport()','full')+btn('Vorhandene Daten sichern',"request({type:'json'})",'full')+'<p id="offlineStatus" class="sub muted">'+esc(offlineStatus)+'</p></div>':({home,calendar,reports,settings,ckm}[page])();prepareLayout();$('nav').innerHTML=navItems().map(([p,t])=>'<button class="'+(page===p?'sel':'')+'" onclick="go(\''+p+'\')">'+navIcon(p)+'<span>'+t+'</span>'+'</button>').join('');document.querySelectorAll('#main button').forEach(b=>{if(/request\(|act\(|discard\(|openManualStart\(|openManualEnd\(|openPauseDays\(/ .test(b.getAttribute('onclick')||''))b.dataset.write='1';});syncUI();live();recordNavGeometry('Render');queueViewportSync();}
function field(label,id,type,value,extra=''){return '<label for="'+id+'">'+esc(label)+'</label><input id="'+id+'" type="'+type+'" value="'+esc(value)+'" '+extra+'>';}
function noteField(note){return '<label for="fNote">Notiz</label><textarea id="fNote" maxlength="1000">'+esc(note)+'</textarea>';}
function openForm(title,body,kind,id){if(pending)return;form={kind,id};$('overlay').innerHTML='<div class="row dialog-header"><h2>'+esc(title)+'</h2><button class="dialog-close" onclick="closeForm()" aria-label="Schließen">Schließen</button></div><div class="card">'+body+'<p id="formError" class="error"></p>'+(kind?'<button data-write class="full primary" onclick="submitForm()">'+(kind==='manualStart'?'Arbeit starten':kind==='manualEnd'?'Arbeit beenden':'Speichern')+'</button>':'')+(id&&['entry','credit','ckmEntry'].includes(kind)?'<button id="deleteButton" data-write class="full danger" onclick="deleteForm()">Löschen</button><div id="deleteConfirm" class="confirmbox hidden"><p>Buchung dauerhaft löschen?</p><button data-write class="full danger" onclick="confirmDelete()">Endgültig löschen</button><button class="full" onclick="cancelDelete()">Abbrechen</button></div>':'')+'</div>';$('overlay').classList.remove('hidden');$('overlay').scrollTop=0;syncUI();}
function closeForm(){if(pending)return;form=null;$('overlay').classList.add('hidden');settleNavViewport();}
function editEntry(id,day){if(pending)return;const e=state.entries.find(x=>x.id===id),times=defaultTimes(day),automatic=e?e.autoPause===true:effectiveAutoDay(day);openForm(e?'Buchung bearbeiten':'Arbeitszeit hinzufügen',(e?field('Beginn','fStart','datetime-local',localInput(e.start))+field('Ende','fEnd','datetime-local',localInput(e.end)):'<p class="muted">'+esc(longDay(day))+'</p>'+field('Beginn','fStart','time',times[0],'required step="60"')+field('Ende','fEnd','time',times[1],'required step="60"')+'<label class="check"><input type="checkbox" id="fNextDay"> Ende am Folgetag</label>')+field('Erfasste Pause (Minuten)','fPause','number',e?Math.round((e.pauseMs-(e.autoPauseMs||0))/MIN*100)/100:0,'min="0" step="0.01"')+'<label class="check"><input type="checkbox" id="fAuto" '+(automatic?'checked':'')+'> Automatische Tagespause</label>'+(prospectiveWindow(e?localDay(e.start):day)?'<p class="sub muted">Festes Pausenfenster '+esc(prospectiveWindow(e?localDay(e.start):day).join(' – '))+'; nur Überschneidung, ohne zusätzlichen Dauerabzug. Ohne Haken gilt die erfasste Pause.</p>':'<p class="sub muted">Ab '+esc(signed(modelOf(state).pauseThreshold,false))+' Brutto insgesamt '+esc(signed(pauseMinimumOn(e?localDay(e.start):day,state),false))+' für den angezeigten Tag'+(e?' (bei geändertem Beginn gilt dessen Wochentagsregel)':'')+', sofern nicht bereits mehr Pause erfasst wurde. Ohne Haken gilt die eingegebene Pause; weitere automatische Buchungen des Tages können die Tagespause ergänzen.</p>')+(e&&e.autoPauseMs?'<p class="sub muted">Aktuell zusätzlich automatisch: '+esc(clock(e.autoPauseMs))+'</p>':'')+noteField(e?e.note:''),'entry',id);if(!e)form.entryDay=day;}
function editCredit(id,day){
 if(pending)return;
 const c=state.credits.find(x=>x.id===id),kind=c?c.type:holidayName(day)?'FT':'KRK',timed=!!c&&hasCreditInterval(c);
 const rangeAllowed=!c||c.vacationRange===true;
 openForm(c?'Gutschrift bearbeiten':'Abwesenheit / Gutschrift',field('Datum / Von','fDay','date',c?c.day:day,'onchange="creditDateChanged()"')+'<label for="fKind">Buchungsart</label><select id="fKind" onchange="defaultCredit()" '+(c&&c.vacationRange?'disabled':'')+'>'+Object.entries(CREDIT_TYPES).map(([k,v])=>'<option value="'+k+'" '+(kind===k?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select>'+(rangeAllowed?'<div id="fVacationRange" class="hidden">'+field('Bis (einschließlich)','fVacationTo','date',c?c.day:day,'oninput="previewVacation()" onchange="previewVacation()"')+'<p id="fVacationPreview" class="sub muted" aria-live="polite"></p><p class="sub muted">Nur Soll-Arbeitstage ohne Feiertage; zukünftige Tage werden erst am jeweiligen Tag gutgeschrieben. Einzelne Urlaubstage können im Kalender bearbeitet oder gelöscht werden.</p></div>':'')+'<div id="fABMode" class="hidden"><label class="check"><input type="checkbox" id="fABManual" onchange="updateCreditMode()" '+(c&&c.type==='AB'&&!timed?'checked':'')+'> Minuten manuell eingeben</label></div><div id="fABTimes" class="hidden">'+field('Ausstempeln','fABFrom','time',timed?localInput(c.absenceStart).slice(11):'','step="60" oninput="updateCreditPreview()"')+field('Einstempeln','fABTo','time',timed?localInput(c.absenceEnd).slice(11):'','step="60" oninput="updateCreditPreview()"')+'<p id="fABPreview" class="sub muted" aria-live="polite"></p><div id="fABSplit" class="hidden"><p id="fABSplitInfo" class="sub muted"></p><label class="check"><input type="checkbox" id="fABSplitConfirm"> Arbeitsbuchung entsprechend aufteilen</label></div></div><div id="fMinuteFields">'+field('Anrechenbare Minuten','fMinutes','number',c?c.minutes:dayTarget(day),'min="0" max="1440" step="1"')+'</div>'+noteField(c?c.note:'')+'<p class="sub muted">ZA/Frei: 0 Minuten; die Sollzeit wird als Minus gebucht. Arzt/Behörde: Zeit zwischen Aus- und Einstempeln oder tatsächliche Minuten.</p>','credit',id);
 if(form&&form.kind==='credit')updateCreditMode();
}
function creditDateChanged(){if($('fVacationTo')&&$('fVacationTo').value<$('fDay').value)$('fVacationTo').value=$('fDay').value;updateCreditPreview();previewVacation();}
function previewVacation(){
 const el=$('fVacationPreview');if(!el||$('fKind').value!=='URL')return;
 try{const p=vacationPlan(state,$('fDay').value,$('fVacationTo').value,Date.now(),form.id);el.textContent=p.days.length+' Urlaubstage · '+signed(p.minutes,false)+' · '+p.skipped.length+' freie/Feiertage übersprungen'+(p.conflicts.length?' · Konflikt: '+p.conflicts.join(', '):'');}catch(e){el.textContent=String(e.message||e);}
}
function updateCreditMode(){const ab=$('fKind').value==='AB',timed=ab&&!$('fABManual').checked;$('fABMode').classList.toggle('hidden',!ab);$('fABTimes').classList.toggle('hidden',!timed);const vacation=!!$('fVacationRange')&&$('fKind').value==='URL';const dayLabel=document.querySelector('label[for="fDay"]');if(dayLabel)dayLabel.textContent=vacation?'Von (einschließlich)':'Datum';if($('fVacationRange'))$('fVacationRange').classList.toggle('hidden',!vacation);$('fMinuteFields').classList.toggle('hidden',timed||vacation);updateCreditPreview();previewVacation();}
function updateCreditPreview(){
 if(!$('fABPreview'))return;
 const box=$('fABSplit'),confirm=$('fABSplitConfirm');box.classList.add('hidden');confirm.checked=false;form.splitEntryId=null;
 let text='Aus- und Einstempelzeit am gewählten Datum eingeben.';
 try{
   const i=creditInterval($('fDay').value,$('fABFrom').value,$('fABTo').value);
   const w=prospectiveWindow($('fDay').value),excluded=w?windowOverlap(i.start,i.end,w,$('fDay').value)/MIN:0,credited=i.minutes-excluded;
   text='Zeitgutschrift: '+signed(credited,false)+' ('+credited+' Minuten)'+(excluded?' · Mittagspause: '+excluded+' Minuten':'')+(!w&&configuredWindow($('fDay').value)?' · Dieser bestehende Tag nutzt die Dauerregel. Pausenfenster bei Bedarf im Kalender anwenden.':'');
   if($('fKind').value==='AB'&&!$('fABManual').checked){
     assert(i.end<=Date.now(),'Die Einstempelzeit darf nicht in der Zukunft liegen.');
     assert(!state.active||i.end<=state.active.start,'Die Gutschrift überschneidet sich mit der laufenden Arbeitszeit.');
     assert(!state.credits.some(c=>c.id!==form.id&&hasCreditInterval(c)&&i.start<c.absenceEnd&&c.absenceStart<i.end),'Die Gutschrift überschneidet sich mit einer vorhandenen Arzt-/Behörden-Gutschrift.');
     const e=creditSplitCandidate(state,i,$('fDay').value);
     if(e){
       assert(!form.id,'Bitte die Arbeitsbuchung vor dem Bearbeiten der Gutschrift manuell korrigieren.');
       const parts=[];if(e.start<i.start)parts.push(fmt(e.start)+'–'+fmt(i.start));if(i.end<e.end)parts.push(fmt(i.end)+'–'+fmt(e.end));
       $('fABSplitInfo').textContent='Vorhandene Arbeitsbuchung '+fmt(e.start)+'–'+fmt(e.end)+' wird zu '+parts.join(' und ')+'. Arztzeit wird nur als Gutschrift gezählt. Die automatische Tagespause wird nach den bestehenden Regeln neu berechnet. Beim späteren Löschen der Gutschrift bleiben die Arbeitsbuchungen getrennt.';
       form.splitEntryId=e.id;box.classList.remove('hidden');
     }
   }
 }catch(e){if($('fABFrom').value&&$('fABTo').value)text+=' · '+String(e.message||e);}
 $('fABPreview').textContent=text;
}
function defaultCredit(){const k=$('fKind').value,day=$('fDay').value;$('fMinutes').value=['AB','ZA','FREI'].includes(k)?0:validDay(day)?dayTarget(day):0;$('fABManual').checked=false;updateCreditMode();}
function entryFormTimes(day,start,end,nextDay){
 assert(validDay(day)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(start)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(end),'Bitte Beginn und Ende vollständig eingeben.');
 return {start:day+'T'+start,end:(nextDay?addDay(day,1):day)+'T'+end};
}
function editOpening(){openForm('Saldo ZA Vormonat',field('Saldo (+H:MM / -H:MM)','fOpening','text',Object.prototype.hasOwnProperty.call(state.openings,month)?signed(state.openings[month]).replace(' h','').replace('−','-'):'')+'<p class="sub muted">Offizieller Vormonatssaldo ohne gesonderte Wochenmitnahme. Leeres Feld entfernt den Saldo.</p>','opening');}
function editNote(){openForm('Tagesnotiz',noteField(state.active.note),'note');}
function submitForm(){if(!form||pending)return;try{let a;if(form.kind==='ckmConfig')a=ckmConfigAction();else if(form.kind==='ckmEntry')a=ckmFormAction();else if(form.kind==='manualStart'){assert(/^([01]\d|2[0-3]):[0-5]\d$/.test($('fManualStart').value),'Bitte eine gültige Beginnzeit eingeben.');a={type:'start',start:form.id+'T'+$('fManualStart').value};}else if(form.kind==='manualEnd'){assert(state.active&&state.active.id===form.id,'Die laufende Buchung hat sich geändert.');const endDay=$('fManualEndDay')?$('fManualEndDay').value:form.endDay,time=$('fManualEnd').value;assert(validDay(endDay)&&endDay>=localDay(state.active.start)&&endDay<=localDay(Date.now()),'Bitte einen gültigen Endtag wählen.');assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(time),'Bitte eine gültige Endzeit eingeben.');a={type:'stop',end:endDay+'T'+time,note:state.active.note};}else if(form.kind==='activeFixed'){assert($('fActiveFixedConfirm').checked,'Bitte Tageskorrektur bestätigen.');a={type:'activeFixedApply',id:form.id,confirmed:true};}else if(form.kind==='fixedConfig'){if(form.id)assert($('fFixedConfirm').checked,'Bitte Tageskorrektur bestätigen.');a=fixedConfigAction(form.id);}else if(form.kind==='fixedMonthAB'){assert($('fFixedConfirm').checked&&form.revision===state.revision,'Bitte aktuelle Monatskorrektur bestätigen.');a=form.action;}else if(form.kind==='fixedDay'){assert($('fFixedConfirm').checked,'Bitte Neuberechnung bestätigen.');a={type:'fixedPauseApply',day:form.id,useFixed:$('fFixedMode').value==='fixed'};}else if(form.kind==='pauseDays'){a={type:'pauseDays',from:$('fPauseFrom').value,days:Array.from({length:7},(_,i)=>i===0||i===6?pauseDaysOn($('fPauseFrom').value,state)[i]:$('fPauseDay'+i).checked),minimums:Array.from({length:7},(_,i)=>{if(i===0||i===6)return pauseMinimumsOn($('fPauseFrom').value,state)[i];const v=$('fPauseMin'+i).value.trim();assert(/^\d+$/.test(v),'Bitte ganze Pausenminuten eingeben.');return Number(v);})};}else if(form.kind==='entry'){const times=form.entryDay?entryFormTimes(form.entryDay,$('fStart').value,$('fEnd').value,$('fNextDay').checked):{start:$('fStart').value,end:$('fEnd').value};a={type:'save',id:form.id,...times,pause:$('fPause').value,autoPause:$('fAuto').checked,note:$('fNote').value};}else if(form.kind==='credit'&&$('fKind').value==='URL'&&$('fVacationTo')){a={type:'vacationRange',id:form.id,from:$('fDay').value,to:$('fVacationTo').value,note:$('fNote').value};}else if(form.kind==='credit'){a={type:'credit',id:form.id,day:$('fDay').value,kind:$('fKind').value,note:$('fNote').value};if(a.kind==='AB'&&!$('fABManual').checked){a.fromTime=$('fABFrom').value;a.toTime=$('fABTo').value;if(form.splitEntryId&&$('fABSplitConfirm').checked)a.splitEntryId=form.splitEntryId;}else{assert(/^\d+$/.test($('fMinutes').value),'Bitte ganze Minuten eingeben.');a.minutes=Number($('fMinutes').value);}}else if(form.kind==='opening')a={type:'opening',month,value:$('fOpening').value.trim()?parseSigned($('fOpening').value):null};else if(form.kind==='note')a={type:'saveNote',note:$('fNote').value};else return;change(state,a);request(a);}catch(e){$('formError').textContent=String(e.message||e);}}
function deleteForm(){if(!form||!form.id||pending)return;const box=$('deleteConfirm');box.classList.remove('hidden');$('deleteButton').classList.add('hidden');box.scrollIntoView({block:'nearest'});}
function cancelDelete(){$('deleteConfirm').classList.add('hidden');$('deleteButton').classList.remove('hidden');}
function confirmDelete(){if(form&&form.id&&!pending)request({type:form.kind==='ckmEntry'?'ckmDelete':form.kind==='credit'?'deleteCredit':'delete',id:form.id});}
// In-app back gesture; never navigate the browser history or modify stored data.
const BACK_EDGE_WIDTH=24;
function isBackEdge(x){return x>=0&&x<=BACK_EDGE_WIDTH;}
function backSwipeTarget(){
 if(pending||updateBusy||!db)return null;
 if(form){
  const overlay=$('overlay'),confirm=$('deleteConfirm');
  if(overlay.classList.contains('hidden')||form.edgeDirty||(confirm&&!confirm.classList.contains('hidden'))||overlay.querySelector('input[type="file"]')||document.activeElement?.matches('input,textarea,select,[contenteditable]'))return null;
  return 'dialog';
 }
 return page==='settings'&&settingsSection?'settings':null;
}
// Local presentation preferences only. Canonical order is frozen at 3.0.61.
const LAYOUT_KEY='timelog.layout.v1';
const LAYOUT_DEFAULTS=Object.freeze({home:['timer','startpause','weekza','absence','actions'],homeStart:['start','pause'],homeSummary:['week','za'],calendar:['month','day','ckmDay'],reports:['overview','za','billing','absence','chart','weeks'],reportMetrics:['target','actual','diff','credits'],ckm:['summary','add','table'],ckmMetrics:['hours','wage','tip','total'],settings:['model','ckm','appearance','backup','update']});
let layoutRegions=[],layoutHold=null,layoutBlockTouch=false,layoutClickUntil=0;
function readLayoutOrder(){
 try{const raw=JSON.parse(localStorage.getItem(LAYOUT_KEY)||'{}');return raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};}catch{return {};}
}
function layoutOrder(region,raw=readLayoutOrder()){
 const defaults=LAYOUT_DEFAULTS[region]||[],saved=Array.isArray(raw[region])?raw[region]:[];
 return [...new Set(saved.filter(x=>defaults.includes(x))),...defaults.filter(x=>!saved.includes(x))];
}
function saveLayoutOrder(region,order){
 try{const raw=readLayoutOrder();raw[region]=order;localStorage.setItem(LAYOUT_KEY,JSON.stringify(raw));return true;}
 catch{error='Anordnung konnte nicht lokal gespeichert werden.';syncUI();return false;}
}
function resetLayoutOrder(){
 if(pending||form||updateBusy)return;
 try{localStorage.removeItem(LAYOUT_KEY);}catch{error='Standardanordnung konnte nicht wiederhergestellt werden.';syncUI();return;}
 error='';render();
}
function prepareLayout(){
 layoutRegions=[];const main=$('main'),children=Array.from(main.children),q=sel=>main.querySelector(sel),region=(id,parent,defs,grid=false)=>{
  if(!parent)return;const groups=defs.map(([id,label,...nodes])=>({id,label,nodes:nodes.filter(Boolean)})).filter(g=>g.nodes.length&&g.nodes.every(n=>n.parentElement===parent));
  if(!groups.length)return;
  const r={id,parent,grid,groups};layoutRegions.push(r);
  groups.forEach(g=>g.nodes.forEach(n=>{n.dataset.layoutRegion=id;n.dataset.layoutId=g.id;}));
  const order=layoutOrder(id);if(groups.map(g=>g.id).join('|')!==order.filter(id=>groups.some(g=>g.id===id)).join('|'))applyLayoutOrder(r,order,false);
 };
 const grid=(id,parent,defs)=>region(id,parent,defs.map(([key,label],i)=>[key,label,parent?.children[i]]),true);
 if(page==='home'&&state.model){
  const timer=q('#timer')?.closest('.card'),start=q('#pauseTime')?.closest('.grid'),summary=q('.home-summary'),absence=q('.home-absence');
  region('home',main,[['timer','Arbeitszeit',timer],['startpause','Beginn & Pause',start],['weekza','Kalenderwoche & ZA',summary],['absence','Abwesenheit',absence],['actions','Arbeitszeit-Aktionen',...children.filter(n=>n.matches('button.full'))]]);
  grid('homeStart',start,[['start','Beginn'],['pause','Pause']]);grid('homeSummary',summary,[['week','Kalenderwoche'],['za','ZA-Konto']]);
 }else if(page==='calendar'&&state.model){
  region('calendar',main,[['month','Kalender',q('.calendar-month')],['day','Tagesdetails',q('.calendar-day')],['ckmDay','CKM-Tagesdetails',q('.calendar-ckm-day')]]);
 }else if(page==='reports'&&state.model){
  const overview=q('#main > .grid')||q('.grid'),heading=children.find(n=>n.matches('h2')),cards=children.filter(n=>n.matches('.card')),billing=cards.find(n=>n.querySelector('.report-summary')),weeks=cards.find(n=>n.querySelector('h2')?.textContent==='Kalenderwochen');
  region('reports',main,[['overview','Kalendermonat',heading,overview],['za','ZA-Konto',q('.za-month')],['billing','Abrechnung',billing],['absence','Abwesenheiten',q('.absence-month')],['chart','Tagessoll im Monatsverlauf',q('.daily-target-card')],['weeks','Kalenderwochen',weeks]]);
  grid('reportMetrics',overview,[['target','Soll'],['actual','Ist'],['diff','Gebuchte Differenz'],['credits','Gutschriften']]);
 }else if(page==='ckm'){
  const summary=q('.ckm-stats');region('ckm',main,[['summary','Zusammenfassung',summary],['add','Eintrag hinzufügen',children.find(n=>n.matches('button.full'))],['table','CKM-Tabelle',q('.ckm-card')]]);
  grid('ckmMetrics',summary,[['hours','Stunden'],['wage','Gehalt'],['tip','Trinkgeld'],['total','Gesamtverdienst']]);
 }else if(page==='settings'&&!settingsSection){
  const menu=q('.settings-menu');region('settings',menu,LAYOUT_DEFAULTS.settings.map(key=>[key,{model:'Arbeitszeitmodell',ckm:'CKM',appearance:'Darstellung',backup:'Datensicherung & Import',update:'App aktualisieren'}[key],menu?.querySelector('button[onclick="openSettingsSection(\''+key+'\')"]')]));
 }
}
function layoutRect(group){const rs=group.nodes.map(n=>n.getBoundingClientRect());return {left:Math.min(...rs.map(r=>r.left)),right:Math.max(...rs.map(r=>r.right)),top:Math.min(...rs.map(r=>r.top)),bottom:Math.max(...rs.map(r=>r.bottom))};}
function layoutCurrent(r){return r.groups.slice().sort((a,b)=>Array.from(r.parent.children).indexOf(a.nodes[0])-Array.from(r.parent.children).indexOf(b.nodes[0]));}
function applyLayoutOrder(r,order,animate){
 const current=layoutCurrent(r),next=order.map(id=>r.groups.find(g=>g.id===id)).filter(Boolean);
 if(next.length!==current.length||current.every((g,i)=>g===next[i]))return;
 const nodes=current.flatMap(g=>g.nodes),rects=animate?new Map(nodes.map(n=>[n,n.getBoundingClientRect()])):null;
 // The unmovable month bar, hints, setup message and footer stay at their original slots.
 const marker=document.createComment('layout-slot');r.parent.insertBefore(marker,nodes[0]);for(const g of next)for(const n of g.nodes)r.parent.insertBefore(n,marker);marker.remove();
 if(rects&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches)for(const n of nodes){const a=rects.get(n),b=n.getBoundingClientRect();if(n.animate&&(a.left!==b.left||a.top!==b.top))n.animate([{transform:'translate('+(a.left-b.left)+'px,'+(a.top-b.top)+'px)'},{transform:'none'}],{duration:190,easing:'ease-out'});}
}
function layoutAllowed(){return !!db&&!pending&&!form&&!updateBusy&&!document.hidden;}
function cancelLayoutHold(block=false){
 const g=layoutHold;layoutHold=null;if(!g)return;clearTimeout(g.timer);if(g.raf)cancelAnimationFrame(g.raf);if(g.active){g.group.nodes.forEach(n=>n.classList.remove('layout-picked'));g.ghost?.remove();g.marker?.remove();document.body.classList.remove('layout-dragging');layoutClickUntil=performance.now()+700;if(block)layoutBlockTouch=true;}
}
function layoutCandidate(target,x,y){
 const el=target.closest('[data-layout-id]');if(!el)return null;
 const r=layoutRegions.find(r=>r.id===el.dataset.layoutRegion),group=r?.groups.find(g=>g.id===el.dataset.layoutId);if(!group||r.groups.length<2)return null;
 const rect=layoutRect(group);return {r,group,x,y,offsetX:(rect.left+rect.right)/2-x,offsetY:(rect.top+rect.bottom)/2-y,fx:x,fy:y,active:false,index:layoutCurrent(r).indexOf(group)};
}
function layoutPreview(g){
 if(!g.active)return;
 // The two paired Home rows can be rearranged horizontally, or moved as
 // complete groups by dragging vertically after the long press.
 if((g.r.id==='homeStart'||g.r.id==='homeSummary')&&Math.abs(g.fy-g.y)>=18&&Math.abs(g.fy-g.y)>Math.abs(g.fx-g.x)*1.4){
  const outer=layoutCandidate(g.r.parent,g.x,g.y);
  if(outer){g.group.nodes.forEach(n=>n.classList.remove('layout-picked'));g.r=outer.r;g.group=outer.group;g.offsetX=outer.offsetX;g.offsetY=outer.offsetY;g.group.nodes.forEach(n=>n.classList.add('layout-picked'));g.ghost.textContent='↕ '+g.group.label;}
 }
 const all=layoutCurrent(g.r),others=all.filter(x=>x!==g.group),cx=g.fx+g.offsetX,cy=g.fy+g.offsetY;
 if(Math.hypot(g.fx-g.x,g.fy-g.y)<12&&!g.scrolled){g.index=all.indexOf(g.group);g.marker.hidden=true;}
 else if(g.r.grid){
  let best=all[0],dist=Infinity;for(const item of all){const r=layoutRect(item),d=Math.hypot(cx-(r.left+r.right)/2,cy-(r.top+r.bottom)/2);if(d<dist){dist=d;best=item;}}
  g.index=all.indexOf(best);const r=layoutRect(best);g.marker.hidden=best===g.group;Object.assign(g.marker.style,{left:r.left+'px',top:r.top+'px',width:(r.right-r.left)+'px',height:(r.bottom-r.top)+'px'});g.marker.className='layout-marker layout-grid-marker';
 }else{
  g.index=others.filter(item=>{const r=layoutRect(item);return cy>(r.top+r.bottom)/2;}).length;
  const next=others[g.index],prev=others[g.index-1],rect=layoutRect(next||prev);const at=next?rect.top:rect.bottom;g.marker.hidden=g.index===all.indexOf(g.group);Object.assign(g.marker.style,{left:rect.left+'px',top:(at-2)+'px',width:(rect.right-rect.left)+'px',height:'4px'});g.marker.className='layout-marker';
 }
 const vw=window.visualViewport?.width||innerWidth,vh=window.visualViewport?.height||innerHeight;const w=g.ghost.offsetWidth,h=g.ghost.offsetHeight;g.ghost.style.left=Math.max(4,Math.min(vw-w-4,g.fx-w/2))+'px';g.ghost.style.top=Math.max(4,Math.min(vh-h-4,g.fy+16))+'px';
}
function beginLayoutDrag(g){
 if(layoutHold!==g||!layoutAllowed()||!g.group.nodes.every(n=>n.isConnected))return;
 g.active=true;g.group.nodes.forEach(n=>n.classList.add('layout-picked'));document.body.classList.add('layout-dragging');g.ghost=document.createElement('div');g.ghost.className='layout-ghost';g.ghost.setAttribute('aria-hidden','true');g.ghost.textContent='↕ '+g.group.label;g.marker=document.createElement('div');g.marker.className='layout-marker';g.marker.setAttribute('aria-hidden','true');document.body.append(g.marker,g.ghost);layoutPreview(g);
 const tick=()=>{if(layoutHold!==g)return;if(!layoutAllowed()){cancelLayoutHold(true);return;}const nav=$('nav').getBoundingClientRect(),top=window.visualViewport?.offsetTop||0,edge=65,upper=top+edge,lower=nav.top-edge;let d=0;if(g.fy<upper)d=-Math.min(15,(upper-g.fy)/3);else if(g.fy>lower)d=Math.min(15,(g.fy-lower)/3);if(d&&Math.hypot(g.fx-g.x,g.fy-g.y)>=12){const old=scrollY;window.scrollBy(0,d);if(scrollY!==old){g.scrolled=true;layoutPreview(g);}}g.raf=requestAnimationFrame(tick);};g.raf=requestAnimationFrame(tick);
}
function commitLayoutDrag(g){
 const current=layoutCurrent(g.r),from=current.indexOf(g.group);if(g.index===from)return;
 const visible=current.filter(x=>x!==g.group);visible.splice(g.index,0,g.group);const next=visible.map(x=>x.id),full=layoutOrder(g.r.id);let i=0;const merged=full.map(id=>next.includes(id)?next[i++]:id);
 if(saveLayoutOrder(g.r.id,merged))applyLayoutOrder(g.r,merged,true);
}
function setupLayoutDrag(){
 const stop=e=>{if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();};
 document.addEventListener('touchstart',e=>{
  if(layoutHold?.active){cancelLayoutHold(true);stop(e);return;}
  cancelLayoutHold();if(e.touches.length!==1)return;layoutBlockTouch=false;layoutClickUntil=0;
  if(!layoutAllowed()||!e.target.closest('#main')||e.target.closest('input,textarea,select,[contenteditable],a,summary,.calendar button,.ckm-table tbody'))return;
  const t=e.touches[0];if(isBackEdge(t.clientX))return;const g=layoutCandidate(e.target,t.clientX,t.clientY);if(!g)return;g.id=t.identifier;g.page=page;layoutHold=g;g.timer=setTimeout(()=>beginLayoutDrag(g),500);
 },{capture:true,passive:false});
 document.addEventListener('touchmove',e=>{
  if(layoutBlockTouch){stop(e);return;}const g=layoutHold;if(!g)return;const t=e.touches[0];if(e.touches.length!==1||!t||t.identifier!==g.id||!layoutAllowed()||page!==g.page){cancelLayoutHold(g.active);if(g.active)stop(e);return;}
  if(!g.active){if(Math.hypot(t.clientX-g.x,t.clientY-g.y)>10)cancelLayoutHold();return;}
  stop(e);g.fx=t.clientX;g.fy=t.clientY;layoutPreview(g);
 },{capture:true,passive:false});
 document.addEventListener('touchend',e=>{
  if(layoutBlockTouch){stop(e);if(!e.touches.length){layoutBlockTouch=false;layoutClickUntil=performance.now()+700;}return;}
  const g=layoutHold;if(!g)return;if(!g.active){cancelLayoutHold();return;}stop(e);const t=Array.from(e.changedTouches).find(t=>t.identifier===g.id),valid=t&&!e.touches.length&&layoutAllowed()&&page===g.page;
  if(valid){g.fx=t.clientX;g.fy=t.clientY;layoutPreview(g);}cancelLayoutHold();if(valid)commitLayoutDrag(g);
 },{capture:true,passive:false});
 document.addEventListener('touchcancel',e=>{const active=layoutHold?.active;if(active||layoutBlockTouch){stop(e);layoutClickUntil=performance.now()+700;}cancelLayoutHold();layoutBlockTouch=false;},{capture:true,passive:false});
 document.addEventListener('contextmenu',e=>{if(layoutHold||layoutBlockTouch)stop(e);},{capture:true});
 document.addEventListener('click',e=>{if(layoutHold?.active||layoutBlockTouch||(e.detail!==0&&performance.now()<layoutClickUntil))stop(e);},{capture:true});
 window.addEventListener('blur',()=>cancelLayoutHold(true));document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelLayoutHold(true);});
}

function setupBackSwipe(){
 let gesture=null;
 const reset=()=>{gesture=null;};
 const markDirty=()=>{if(form)form.edgeDirty=true;};
 $('overlay').addEventListener('input',markDirty,true);
 $('overlay').addEventListener('change',markDirty,true);
 const same=g=>g&&g.page===page&&g.section===settingsSection&&g.form===form&&backSwipeTarget()===g.target;
 document.addEventListener('touchstart',e=>{
  reset();if(e.touches.length!==1||e.target.closest('input,textarea,select,[contenteditable],#nav'))return;
  const t=e.touches[0],target=backSwipeTarget();
  if(!target||!isBackEdge(t.clientX))return;
  gesture={id:t.identifier,x:t.clientX,y:t.clientY,page,section:settingsSection,form,target,axis:false};
 },{capture:true,passive:true});
 document.addEventListener('touchmove',e=>{
  const g=gesture;if(!g)return;
  if(e.touches.length!==1||!same(g)){reset();return;}
  const t=e.touches[0];if(t.identifier!==g.id){reset();return;}
  const dx=t.clientX-g.x,dy=Math.abs(t.clientY-g.y);
  if(!g.axis&&Math.max(Math.abs(dx),dy)>=12){if(dx>dy*1.5)g.axis=true;else if(dx<0||dy>Math.abs(dx)*1.2){reset();return;}}
  if(g.axis&&e.cancelable)e.preventDefault();
 },{capture:true,passive:false});
 document.addEventListener('touchend',e=>{
  const g=gesture;reset();if(!same(g)||e.touches.length!==0)return;
  const t=Array.from(e.changedTouches).find(t=>t.identifier===g.id);if(!t)return;
  const dx=t.clientX-g.x,dy=Math.abs(t.clientY-g.y);
  if(dx<65||dx<1.6*dy)return;
  if(e.cancelable)e.preventDefault();
  if(g.target==='dialog')closeForm();else openSettingsSection('');
 },{capture:true,passive:false});
 document.addEventListener('touchcancel',reset,{capture:true,passive:true});
}

// Swipe on the bottom navigation only: one visible tab per gesture, no wrap.
function setupNavSwipe(){
 const nav=$('nav');let gesture=null,suppressClickUntil=0;
 const allowed=()=>!pending&&!form&&!updateBusy&&!document.hidden;
 const same=g=>g&&allowed()&&g.page===page&&g.section===settingsSection&&g.ckm===ckmVisible;
 nav.addEventListener('touchstart',e=>{
  gesture=null;suppressClickUntil=0;
  if(!allowed()||e.touches.length!==1)return;
  const t=e.touches[0];gesture={id:t.identifier,x:t.clientX,y:t.clientY,page,section:settingsSection,ckm:ckmVisible,axis:false};
 },{passive:true});
 nav.addEventListener('touchmove',e=>{
  const g=gesture;if(!same(g)||e.touches.length!==1){gesture=null;return;}
  const t=e.touches[0];if(t.identifier!==g.id){gesture=null;return;}
  const x=Math.abs(t.clientX-g.x),y=Math.abs(t.clientY-g.y);
  if(!g.axis&&Math.max(x,y)>=12){if(x>1.4*y)g.axis=true;else if(y>1.2*x){gesture=null;return;}}
  if(g.axis&&e.cancelable)e.preventDefault();
 },{passive:false});
 nav.addEventListener('touchend',e=>{
  const g=gesture;gesture=null;if(!same(g)||e.touches.length!==0)return;
  const t=Array.from(e.changedTouches).find(t=>t.identifier===g.id);if(!t)return;
  const dx=t.clientX-g.x,dy=t.clientY-g.y;
  if(Math.abs(dx)<65||Math.abs(dx)<1.6*Math.abs(dy))return;
  if(e.cancelable)e.preventDefault();suppressClickUntil=performance.now()+500;
  const keys=navItems().map(([key])=>key),i=keys.indexOf(page),next=i+(dx<0?1:-1);
  if(i>=0&&next>=0&&next<keys.length)go(keys[next]);
 },{passive:false});
 nav.addEventListener('touchcancel',()=>{gesture=null;},{passive:true});
 nav.addEventListener('click',e=>{if(e.detail!==0&&performance.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
}

// A swipe changes only the selected month; no data or revision is changed.
function setupMonthSwipe(){
 const surface=$('main');let gesture=null;
 const allowed=()=> !!state.model&&(page==='calendar'||page==='reports')&&!pending&&$('overlay').classList.contains('hidden');
 const reset=()=>{gesture=null;};
 surface.addEventListener('touchstart',e=>{
   reset();if(!allowed()||e.touches.length!==1||e.target.closest('input,textarea,select,[contenteditable]'))return;
   const t=e.touches[0];if(isBackEdge(t.clientX))return;gesture={id:t.identifier,x:t.clientX,y:t.clientY,page,month,axis:null};
 },{passive:true});
 surface.addEventListener('touchmove',e=>{
   if(!gesture)return;if(e.touches.length!==1||!allowed()){reset();return;}
   const t=e.touches[0];if(t.identifier!==gesture.id){reset();return;}
   const x=Math.abs(t.clientX-gesture.x),y=Math.abs(t.clientY-gesture.y);
   if(!gesture.axis&&Math.max(x,y)>=12){if(x>y*1.4)gesture.axis='x';else if(y>x*1.2){reset();}}
   if(gesture&&gesture.axis==='x'&&e.cancelable)e.preventDefault();
 },{passive:false});
 surface.addEventListener('touchend',e=>{
   const g=gesture;reset();if(!g||!allowed()||page!==g.page||month!==g.month||e.touches.length!==0)return;
   const t=Array.from(e.changedTouches).find(t=>t.identifier===g.id);if(!t)return;
   const dx=t.clientX-g.x,dy=t.clientY-g.y;
   if(Math.abs(dx)<65||Math.abs(dx)<1.6*Math.abs(dy))return;
   if(e.cancelable)e.preventDefault();shiftMonth(dx<0?1:-1);window.scrollTo(0,0);
 },{passive:false});
 surface.addEventListener('touchcancel',reset,{passive:true});
}


function reportCSV(month){const r=monthReport(state,month,localDay(Date.now())),q=v=>'"'+String(v).replace(/"/g,'""')+'"';const rows=[['Datum','Soll Minuten','Arbeit Minuten','Gutschrift Minuten','Ist Minuten','Differenz Minuten','Status','Buchungsarten','Feiertag AT']];for(const d of r.days)rows.push([d.day,d.target,d.work,d.credit,d.actual,d.booked&&!d.active?d.diff:'',d.active?'Läuft':d.booked?'Gebucht':d.cs.some(c=>c.type==='URL')?'Urlaub':d.target?'Offen':'Frei',d.cs.map(c=>c.type).join(', '),holidayName(d.day)]);rows.push([],['KW','Von','Bis','Soll Minuten','Ist Minuten','MA Minuten','Minus Minuten','Ü50 Minuten','Differenz Minuten','Status']);for(const w of r.weeks)rows.push([weekNumber(w.start),w.start,w.end,w.target,w.actual,w.plus,w.minus,w.ot,w.diff,(w.complete?'Vollständig':'Vorläufig')+(w.carry?' · inkl. aggregiertem Übertrag '+signed(w.carryActual,false)+' Ist':'')]);rows.push([],['Kalendermonat','Arzt / Behörde (anrechenbare Minuten)'],[month,monthAB(state,month)]);return '\uFEFF'+rows.map(r=>r.map(q).join(';')).join('\r\n');}

// PWA storage. All data operations stay in the browser; only static assets use the network.
let db=null, offlineStatus='Offline-Bereitschaft wird geprüft …';
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('arbeitszeit-local-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('states');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Bitte andere TimeLog-Fenster schließen.'));});}
function readState(){return new Promise((resolve,reject)=>{const tx=db.transaction('states','readonly'),r=tx.objectStore('states').getAll();let value; r.onsuccess=()=>{try{const all=r.result,valid=[];for(const item of all){try{valid.push(checkStored(item));}catch{}}assert(!all.length||valid.length,'Keine lesbaren lokalen Daten. Es wird nichts überschrieben.');value=valid.sort((a,b)=>b.revision-a.revision)[0]||null;}catch(e){reject(e);}};tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Lesefehler'));});}
function checkStored(value){const checked=validateState(value);assert(!checked.octoberReference||checked.reference,'Private Referenzdaten fehlen.');return checked;}
function persist(next,expected){return new Promise((resolve,reject)=>{const tx=db.transaction('states','readwrite'),store=tx.objectStore('states'),r=store.getAll();let failure; r.onsuccess=()=>{try{const valid=[];for(const item of r.result){try{valid.push(checkStored(item));}catch{}}assert(!r.result.length||valid.length,'Lokale Daten beschädigt.');const latest=valid.sort((a,b)=>b.revision-a.revision)[0];assert((latest?latest.revision:0)===expected,'Daten wurden in einem anderen Fenster geändert. App bitte neu öffnen.');checkStored(next);store.put(next,next.revision%2);const v=store.get(next.revision%2);v.onsuccess=()=>{try{assert(JSON.stringify(v.result)===JSON.stringify(next),'Speicherprüfung fehlgeschlagen.');}catch(e){failure=e;tx.abort();}};}catch(e){failure=e;tx.abort();}};tx.oncomplete=()=>resolve(next);tx.onerror=tx.onabort=()=>reject(failure||tx.error||new Error('Speicherung fehlgeschlagen.'));});}
function downloadFile(text,name,mime){const file=new Blob([text],{type:mime});const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function privateProfileExport(s){
 const result={kind:'arbeitszeit-private-profile-v1',model:validateModel(s.model)};
 for(const key of ['pauseDaysHistory','fixedPauseConfig'])if(s[key]!==undefined)result[key]=s[key];
 const copy=JSON.parse(JSON.stringify(result));
 // Check the same structure that will be accepted on a new installation.
 applyProfile(emptyState(),copy);return copy;
}
function exportAction(a){
 if(a.type==='profileExport'){downloadFile(JSON.stringify(privateProfileExport(state),null,2),'TimeLog-Arbeitszeitmodell-'+localDay(Date.now())+'.json','application/json');return;}
 assert(a.type==='json','CSV-Export ist deaktiviert.');downloadFile(JSON.stringify(state,null,2),'TimeLog-Sicherung-'+localDay(Date.now())+'.json','application/json');
}
async function processRequest(req){let err='';try{const a=req.action;if(['csv','report','json','ckmCsv','profileExport'].includes(a.type)){exportAction(a);}else{const next=['import','profile','history'].includes(a.type)?a.value:change(state,a);state=await persist(next,state.revision);}}catch(e){err=String(e.message||e);}receive(req.seq,state,err);}
function prepareHistory(raw,current,now=Date.now()){
 const src=checkStored(JSON.parse(JSON.stringify(raw))),next=JSON.parse(JSON.stringify(current));
 assert(src.active===null&&src.model&&src.reference&&src.octoberReference,'Keine vollständige historische Importdatei.');
 const month=src.reference.month,today=localDay(now);
 assert(month<today.slice(0,7),'Nur abgeschlossene historische Monate importieren.');
 assert(src.entries.every(e=>localDay(e.start).slice(0,7)===month&&localDay(e.end)===localDay(e.start))&&src.credits.every(c=>c.day.slice(0,7)===month),'Die Datei enthält Buchungen außerhalb des Referenzmonats.');
 // Profile compare by known fields; do not replace or alter an installed profile.
 if(next.model){for(const k of Object.keys(src.model)){assert(JSON.stringify(next.model[k])===JSON.stringify(src.model[k]),'Das Arbeitszeitprofil weicht ab. Keine Daten verändert.');}}else next.model=src.model;
 if(next.reference){assert(next.reference.month===month&&JSON.stringify(next.reference.carry)===JSON.stringify(src.reference.carry)&&JSON.stringify(next.reference.rows)===JSON.stringify(src.reference.rows),'Vorhandene Referenzdaten weichen ab. Keine Daten verändert.');}else next.reference=src.reference;
 const days=[...new Set([...src.entries.map(e=>localDay(e.start)),...src.credits.map(c=>c.day)])].sort(),skipped=[],keptOpenings=[];let entries=0,credits=0;
 for(const day of days){
  const es=src.entries.filter(e=>localDay(e.start)===day),cs=src.credits.filter(c=>c.day===day);
  if(next.entries.some(e=>localDay(e.start)<=day&&localDay(e.end)>=day)||next.credits.some(c=>c.day===day)||(next.active&&localDay(next.active.start)<=day)||es.some(e=>next.entries.some(x=>x.id===e.id||e.start<x.end&&x.start<e.end)||(next.active&&(next.active.id===e.id||next.active.start<e.end)))||cs.some(c=>next.credits.some(x=>x.id===c.id))){skipped.push(day);continue;}
  next.entries.push(...es);next.credits.push(...cs);if(Object.prototype.hasOwnProperty.call(src.fixedPauseDays||{},day)){next.fixedPauseDays=next.fixedPauseDays||{};next.fixedPauseDays[day]=src.fixedPauseDays[day];}else if(next.fixedPauseDays)delete next.fixedPauseDays[day];entries+=es.length;credits+=cs.length;
 }
 for(const [k,v] of Object.entries(src.openings)){if(!Object.prototype.hasOwnProperty.call(next.openings,k))next.openings[k]=v;else if(next.openings[k]!==v)keptOpenings.push(k);}
 if(!next.octoberReference)next.octoberReference={entries,credits,skipped};
 next.revision=current.revision+1;checkStored(next);return {next,entries,credits,skipped,keptOpenings,month};
}
function openHistory(){if(pending||!db)return;openForm('Historische Buchungen ergänzen','<p>Private historische JSON-Datei auswählen. Vorhandene Tage, Salden, laufende Buchung und Einstellungen bleiben erhalten. Es werden nur freie Tage ergänzt.</p><label for="historyFile">Private Importdatei (.json)</label><input id="historyFile" type="file" accept=".json,application/json">'+btn('Import prüfen','previewHistory()','full primary'),null);}
let historyPreview=null;
async function previewHistory(){if(pending||!db)return;try{const f=form,rev=state.revision,raw=await readJSON($('historyFile').files[0]);assert(form===f&&!pending&&state.revision===rev,'Import abgebrochen. Bitte erneut prüfen.');const result=prepareHistory(raw,state);openForm('Import prüfen','<p>Referenzmonat: '+esc(result.month)+'</p><p>Neue Arbeitsbuchungen: '+result.entries+'<br>Neue Gutschriften: '+result.credits+'</p><p>Vorhandene Tage übersprungen: '+esc(result.skipped.join(', ')||'Keine')+'</p><p>Abweichende vorhandene Anfangssalden bleiben erhalten: '+esc(result.keptOpenings.join(', ')||'Keine')+'</p>'+btn('Jetzt lokal ergänzen','commitHistory()','full primary'),null);historyPreview={form,rev,result};}catch(e){if($('formError'))$('formError').textContent=String(e.message||e);}}
function commitHistory(){if(pending||!db)return;try{assert(historyPreview&&historyPreview.form===form&&historyPreview.rev===state.revision,'Importvorschau veraltet. Bitte erneut prüfen.');request({type:'history',value:historyPreview.result.next});historyPreview=null;}catch(e){$('formError').textContent=String(e.message||e);}}
function openProfile(){openForm('Privates Profil einrichten','<p>Nur die private Profil-Datei auswählen. Bestehende Buchungen bleiben erhalten.</p><label for="profileFile">Privates Arbeitszeitprofil (.json)</label><input id="profileFile" type="file" accept=".json,application/json">'+btn('Profil lokal speichern','importProfile()','full primary'),null);}
function openImport(){openForm('Lokale JSON-Sicherung importieren','<p>Wähle deine Sicherung aus „Auf meinem iPhone“. Der Import ersetzt den aktuellen PWA-Datenbestand. Ältere Sicherungen ohne CKM-Bereich behalten vorhandene CKM-Daten; Sicherungen mit CKM ersetzen auch diesen Bereich. Vorher eine JSON-Sicherung des aktuellen Stands erstellen.</p><label for="backupFile">TimeLog-Sicherung (.json)</label><input id="backupFile" type="file" accept=".json,application/json"><label for="refFile">Privates Arbeitszeitprofil (nur für reguläre Arbeitszeit erforderlich)</label><input id="refFile" type="file" accept=".json,application/json"><label class="check"><input id="importConfirm" type="checkbox"> Ich möchte den aktuellen Bestand ersetzen.</label>'+btn('Importieren','importLocal()','full primary'),null);}
async function readJSON(file){assert(file&&file.size<=20000000,'Bitte eine JSON-Datei bis 20 MB auswählen.');return JSON.parse(await file.text());}
function applyProfile(next,extra){assert(extra&&extra.kind==='arbeitszeit-private-profile-v1','Falsche private Profildatei.');assert(!next.model||JSON.stringify(next.model)===JSON.stringify(extra.model),'Die Sicherung enthält ein anderes Arbeitszeitprofil. Bitte ohne zusätzliche Profildatei importieren.');const hadModel=!!next.model;next.model=validateModel(extra.model);
 // Only initialize rules with a newly imported model; never overwrite rules in a full backup.
 if(!hadModel)for(const key of ['pauseDaysHistory','fixedPauseConfig'])if(next[key]===undefined&&extra[key]!==undefined)next[key]=JSON.parse(JSON.stringify(extra[key]));
 if(next.octoberReference&&!next.reference&&extra.reference)next.reference=extra.reference;return checkStored(next);
}
function prepareImport(raw,extra,current){const next=validateState(raw);if(next.ckm===undefined&&current.ckm!==undefined)next.ckm=JSON.parse(JSON.stringify(current.ckm));if(extra){if(extra.kind==='arbeitszeit-private-reference-v1'){assert(next.octoberReference&&!next.reference,'Referenz-Ergänzung nicht erforderlich.');next.reference=extra.reference;}else applyProfile(next,extra);}if(!next.model&&current.model)next.model=current.model;if(!next.model&&(next.entries.length||next.credits.length||next.active||Object.keys(next.openings).length||next.octoberReference||next.reference))modelOf(next);checkStored(next);next.revision=Math.max(next.revision,current.revision)+1;assert(Number.isSafeInteger(next.revision),'Ungültige Revision.');return next;}
async function importProfile(){if(pending||!db)return;try{assert(!state.model,'Profil bereits eingerichtet.');const f=form,extra=await readJSON($('profileFile').files[0]);const next=applyProfile(JSON.parse(JSON.stringify(state)),extra);assert(form===f&&!pending,'Import abgebrochen.');next.revision=state.revision+1;assert(Number.isSafeInteger(next.revision),'Ungültige Revision.');request({type:'profile',value:next});}catch(e){if($('formError'))$('formError').textContent=String(e.message||e);}}
async function importLocal(){if(pending||!db)return;try{assert($('importConfirm').checked,'Bitte Ersetzen bestätigen.');const f=form,backup=$('backupFile').files[0],supplement=$('refFile').files[0];const raw=await readJSON(backup),extra=supplement?await readJSON(supplement):null;const next=prepareImport(raw,extra,state);assert(form===f&&!pending,'Import abgebrochen.');request({type:'import',value:next});}catch(e){if($('formError'))$('formError').textContent=String(e.message||e);}}
let updateBusy=false,updateStatus='Für die Prüfung ist eine Internetverbindung erforderlich.';
function showUpdateStatus(message){updateStatus=message;const text=$('updateStatus'),button=$('updateButton');if(text)text.textContent=message;if(button)button.disabled=updateBusy;}
function updateTimeout(promise,ms=45000){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Zeitüberschreitung. Bitte online erneut versuchen.')),ms);})]).finally(()=>clearTimeout(timer));}
function workerVersion(worker){if(!worker)return Promise.resolve(null);const channel=new MessageChannel();return updateTimeout(new Promise((resolve,reject)=>{channel.port1.onmessage=e=>resolve(e.data&&e.data.type==='TIMELOG_VERSION'?e.data.version:null);try{worker.postMessage({type:'TIMELOG_GET_VERSION'},[channel.port2]);}catch(e){reject(e);}}),3000).catch(()=>null).finally(()=>channel.port1.close());}
function waitForWorker(reg,observed){return new Promise((resolve,reject)=>{const deadline=Date.now()+40000;const tick=()=>{if(observed.some(w=>w.state==='redundant')){reject(new Error('Neue Programmdateien konnten nicht installiert werden.'));return;}if(reg.waiting||(!reg.installing&&reg.active&&reg.active.state==='activated')){resolve();return;}if(Date.now()>=deadline){reject(new Error('Neue Programmdateien noch nicht vollständig installiert. Bitte erneut versuchen.'));return;}setTimeout(tick,200);};tick();});}
async function checkAppUpdate(){
 if(updateBusy||pending||form||!db)return;
 updateBusy=true;showUpdateStatus('Suche nach Updates …');
 try{
  assert('serviceWorker' in navigator,'Update-Funktion benötigt eine installierbare HTTPS-Web-App.');
  const sw=navigator.serviceWorker,reg=await updateTimeout(sw.getRegistration());assert(reg,'Offline-Installation noch nicht bereit. Bitte online neu öffnen.');
  const observed=reg.installing?[reg.installing]:[];const found=()=>{if(reg.installing&&!observed.includes(reg.installing))observed.push(reg.installing);};reg.addEventListener('updatefound',found);try{await updateTimeout(reg.update());found();await waitForWorker(reg,observed);}finally{reg.removeEventListener('updatefound',found);}
  if(reg.waiting){if(pending||form||page!=='settings'||settingsSection!=='update'||document.hidden){showUpdateStatus('Update bereit. Nach Abschluss der Eingaben erneut prüfen.');return;}showUpdateStatus('Neue Programmdateien installiert. Update wird aktiviert …');reg.waiting.postMessage({type:'TIMELOG_ACTIVATE_UPDATE'});const deadline=Date.now()+40000;while(reg.waiting||reg.installing||!reg.active||reg.active.state!=='activated'){assert(Date.now()<deadline,'Aktivierung noch nicht abgeschlossen. Bitte erneut prüfen.');await new Promise(r=>setTimeout(r,200));}}
  const latest=await workerVersion(reg.active);assert(latest&&/^\d+\.\d+\.\d+$/.test(latest),'Aktive Programmversion konnte nicht bestätigt werden. Bitte online neu öffnen.');
  if(latest===VERSION){showUpdateStatus('TimeLog '+VERSION+' ist aktuell.');return;}
  const deadline=Date.now()+10000;while(sw.controller!==reg.active){assert(Date.now()<deadline,'Update bereit. Bitte App online neu öffnen.');await new Promise(r=>setTimeout(r,100));}
  if(pending||form||page!=='settings'||settingsSection!=='update'||document.hidden){showUpdateStatus('Version '+latest+' ist bereit. Nach Abschluss der Eingaben und Speicherung TimeLog vollständig schließen und erneut öffnen.');return;}
  showUpdateStatus('Version '+latest+' ist vollständig vorbereitet. Bitte TimeLog im App-Umschalter vollständig schließen und über den Home-Bildschirm erneut öffnen. Kein Löschen der App erforderlich.');
 }catch(e){showUpdateStatus('Update nicht bestätigt: '+String(e.message||e)+' Die lokale Datensicherung bleibt unverändert.');}
 finally{updateBusy=false;showUpdateStatus(updateStatus);}
}
async function offlineSetup(){try{assert('serviceWorker' in navigator,'Offline-Funktion benötigt HTTPS.');await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Offline-Installation noch nicht abgeschlossen; bitte online neu öffnen.')),15000))]);offlineStatus='Offline-Dateien installiert. Offline-Start nach Schließen testen.';if(navigator.storage&&navigator.storage.persist){const yes=await navigator.storage.persist().catch(()=>false);offlineStatus+=' Dauerhafter Speicher: '+(yes?'gewährt':'nicht bestätigt')+'.';}}catch(e){offlineStatus='Offline-Installation nicht bestätigt: '+String(e.message||e);}if($('offlineStatus'))$('offlineStatus').textContent=offlineStatus;}
async function init(){try{applyTheme();setupSystemTheme();db=await openDB();const loaded=await readState();state=loaded||emptyState();saved=state.revision;status='Lokal gespeichert';render();setupNavViewport();setupLayoutDrag();setupBackSwipe();setupMonthSwipe();setupNavSwipe();setInterval(live,250);offlineSetup();}catch(e){if(db)db.close();db=null;status='Speicher nicht verfügbar';error=String(e.message||e);$('heading').textContent='Speicherfehler';$('main').textContent='Es wird nichts überschrieben. Bitte App erneut öffnen.';syncUI();}}
init();
