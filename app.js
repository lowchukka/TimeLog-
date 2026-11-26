
// TimeLog 3.0.24 — offline PWA; model parameters are imported locally.

const VERSION = '3.0.24';
const MIN = 60000;
function emptyState() { return {schema:1, revision:0, active:null, entries:[], credits:[], openings:{}}; }
function assert(ok, message) { if (!ok) throw new Error(message); }
function isTime(n) { return Number.isSafeInteger(n) && n > 0 && n < 8640000000000000; }
function cleanNote(s) { return String(s == null ? '' : s).trim().slice(0, 1000); }
function validEntry(e) {
  return e && typeof e.id === 'string' && e.id.length > 0 && isTime(e.start) && isTime(e.end) && e.end > e.start && Number.isSafeInteger(e.pauseMs) && e.pauseMs >= 0 && e.pauseMs <= e.end-e.start && typeof e.note === 'string' && (e.autoPauseMs===undefined || (Number.isSafeInteger(e.autoPauseMs) && e.autoPauseMs>=0 && e.autoPauseMs<=e.pauseMs)) && (e.autoPause===undefined || typeof e.autoPause==='boolean');
}
function validateState(s) {
  assert(s && s.schema === 1 && Number.isSafeInteger(s.revision) && s.revision >= 0 && Array.isArray(s.entries), 'Unbekanntes oder beschädigtes Datenformat.');
  if(s.credits===undefined)s.credits=[];
  if(s.openings===undefined)s.openings={};
  assert(Array.isArray(s.credits) && s.credits.every(c=>c && typeof c.id==='string' && validDay(c.day) && Object.keys(CREDIT_TYPES).includes(c.type) && Number.isInteger(c.minutes) && c.minutes>=0 && c.minutes<=1440 && typeof c.note==='string' && validCreditInterval(c)), 'Ungültige Abwesenheitsbuchung.');
  assert(new Set(s.credits.map(c=>c.id)).size===s.credits.length,'Doppelte Abwesenheits-ID.');
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
function change(state, action, now=Date.now()) {
  const s=JSON.parse(JSON.stringify(state));
  modelOf(s);const a=s.active;
  switch(action.type) {
    case 'start': {
      assert(!a,'Es läuft bereits ein Arbeitstag.');
      const start=action.start===undefined?now:parseLocal(action.start);
      assert(localDay(start)===localDay(now),'Bitte eine Beginnzeit für heute wählen.');
      assert(start<=now,'Der Arbeitsbeginn darf nicht in der Zukunft liegen.');
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
      const e={id:a.id,start:a.start,end,pauseMs:a.pauseMs+(a.pauseStart===null?0:end-a.pauseStart),note:cleanNote(action.note),autoPause:effectiveAutoDay(localDay(a.start),s),autoPauseMs:0};
      assert(validEntry(e),'Die Arbeitsdauer ist ungültig.');
      s.active=null; checkOverlap(s,e); s.entries.push(e); redistributePause(s,localDay(e.start)); break;
    }
    case 'fixedPauseConfig': {
      assert(Array.isArray(action.days)&&action.days.length===7&&action.days.every(v=>typeof v==='boolean')&&validWindow(action.window),'Bitte gültige Pausentage und ein Zeitfenster mit Ende nach Beginn wählen.');
      s.fixedPauseConfig={days:action.days.slice(),window:action.window.slice()};break;
    }
    case 'fixedPauseApply': {
      const day=action.day;assert(validDay(day)&&day<=localDay(now)&&dayHasData(day,s),'Bitte einen bereits gebuchten Tag auswählen.');
      assert(!a||localDay(a.start)!==day,'Bitte die laufende Buchung zuerst abschließen.');
      const w=action.useFixed?configuredWindow(day,s):null;
      assert(!action.useFixed||w,'Für diesen Wochentag ist kein festes Pausenfenster konfiguriert.');
      s.fixedPauseDays=s.fixedPauseDays||{};s.fixedPauseDays[day]=w?w.slice():null;
      updateTimedCredits(s,day,w);redistributePause(s,day);break;
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
      const previous=s.credits.find(c=>c.id===action.id);ensureFixedDay(s,action.day);const other=s.credits.filter(c=>c.id!==action.id);
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
function daily(s,day){
  const es=s.entries.filter(e=>localDay(e.start)===day),cs=s.credits.filter(c=>c.day===day);
  const work=Math.floor(es.reduce((n,e)=>n+e.end-e.start-e.pauseMs,0)/MIN);
  const credit=cs.reduce((n,c)=>n+c.minutes,0),target=dayTarget(day,s);
  const active=!!s.active&&localDay(s.active.start)===day;
  const booked=es.length>0||cs.length>0;
  return {day,work,credit,target,actual:work+credit,diff:booked&&!active?work+credit-target:null,booked,active,es,cs};
}
function weekReport(s,start,today){
  const days=Array.from({length:7},(_,i)=>daily(s,addDay(start,i)));
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
  const days=[];for(let d=first;d<next;d=addDay(d,1))days.push(daily(s,d));
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
    const d=daily(recorded,day);
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
function go(p){page=p;error='';render();window.scrollTo(0,0);}
function shiftMonth(n){let [y,m]=month.split('-').map(Number);month=localDay(new Date(y,m-1+n,1,12).getTime()).slice(0,7);selected=month===localDay(Date.now()).slice(0,7)?localDay(Date.now()):month+'-01';render();}
function monthBar(){return '<div class="month">'+btn('‹','shiftMonth(-1)')+'<strong>'+esc(monthName())+'</strong>'+btn('›','shiftMonth(1)')+(page==='calendar'?'<button class="weekendtoggle month-weekends" aria-label="'+(showWeekends?'Wochenenden ausblenden':'Wochenenden einblenden')+'" title="'+(showWeekends?'Wochenenden ausblenden':'Wochenenden einblenden')+'" onclick="toggleWeekends()">'+(showWeekends?'5 Tage':'7 Tage')+'</button>':'')+'</div>'+((page==='calendar'||page==='reports')?'<p class="swipe-hint">Monat wechseln: nach links oder rechts wischen</p>':'');}
function request(action){if(pending||!db)return;error='';pending={seq:++seq,action};status='Speicherung ausstehend …';syncUI();processRequest(pending);}
function receive(id,next,err){if(!pending||pending.seq!==id)return false;const kind=pending.action.type;pending=null;if(next){state=next;saved=next.revision;}error=err||'';status=err?'Aktion nicht bestätigt':'Lokal gespeichert';if(!err&&form){form=null;$('overlay').classList.add('hidden');}if(!err&&(kind==='csv'||kind==='json'||kind==='report'))status='Export bereitgestellt';if(!err&&kind==='import')status='Import lokal gespeichert';if(!err&&kind==='history')status='Historische Buchungen lokal ergänzt';if(!err||!form)render();else{ $('formError').textContent=error;syncUI(); }return true;}
function syncUI(){$('sync').textContent=status;$('sync').style.color=pending?'#fbbf24':error?'#ff9292':'#6ee7a3';$('error').textContent=error;document.querySelectorAll('button[data-write]').forEach(b=>b.disabled=!!pending||!db);}
function act(type){request({type,note:state.active?state.active.note:''});}
function openManualStart(){
 if(pending||!db||state.active)return;
 const now=Date.now(),today=localDay(now);
 openForm('Arbeitsbeginn festlegen','<p class="muted">'+esc(longDay(today))+'</p>'+field('Beginnzeit heute','fManualStart','time',localInput(now).slice(11),'required step="60"')+'<p class="sub muted">Der Timer rechnet ab dieser Uhrzeit. Bereits vergangene Pausen werden nicht automatisch als erfasste Pause angenommen.</p>','manualStart',today);
}
function openManualEnd(){
 if(pending||!db||!state.active)return;const now=Date.now(),a=state.active;
 openForm('Arbeitsende festlegen',field('Endzeit','fManualEnd','datetime-local',localInput(now),'required step="60"')+'<p class="sub muted">Beginn: '+esc(localInput(a.start).replace('T',' '))+'. Die Buchung wird mit der gewählten Endzeit abgeschlossen. Automatische Tagespause wie bisher.</p>','manualEnd',a.id);
}
function openWorkActions(){if(!state.active)return;openForm('Weitere Aktionen',btn(state.active.pauseStart===null?'Pause starten':'Pause beenden',"act('"+(state.active.pauseStart===null?'pause':'resume')+"')",'full warn')+btn('Notiz bearbeiten','editNote()','full')+btn('Laufende Buchung verwerfen','discard()','full'),null);}
function discard(){openForm('Laufenden Tag verwerfen','<p>Diese laufende Buchung wird ohne Speicherung beendet.</p>'+btn('Jetzt verwerfen',"act('discard')",'full danger'),null);}
function todayMs(day,now){const es=state.entries.filter(e=>localDay(e.start)===day);let work=es.reduce((n,e)=>n+e.end-e.start-e.pauseMs,0);const a=state.active;if(a&&localDay(a.start)===day)work+=Math.max(0,now-a.start-a.pauseMs-(a.pauseStart===null?0:Math.max(0,now-a.pauseStart)));return work;}
function timerSnapshot(now){
 const today=localDay(now),a=state.active,day=a?localDay(a.start):today,d=daily(state,day);
 const last=d.es.slice().sort((x,y)=>y.end-x.end)[0]||null;
 const pause=a?a.pauseMs+(a.pauseStart===null?0:Math.max(0,now-a.pauseStart)):last?last.pauseMs:0;
 const net=a?Math.max(0,now-a.start-pause):last?Math.max(0,last.end-last.start-last.pauseMs):0;
 return {day,d,a,last,pause,net,total:todayMs(day,now)};
}
function live(){if(page!=='home'||!$('timer'))return;const t=timerSnapshot(Date.now());$('timer').textContent=clock(t.net);$('pauseTime').textContent=clock(t.pause);$('dayTotal').textContent=clock(t.total);$('bar').style.width=(t.d.target?Math.min(100,(t.total/MIN+t.d.credit)/t.d.target*100):0)+'%';$('target').textContent='Soll '+signed(t.d.target,false)+' · Gutschrift '+signed(t.d.credit,false);}
function home(){const now=Date.now(),today=localDay(now),a=state.active,day=a?localDay(a.start):today,d=daily(state,day),w=weekReport(state,weekStart(today),today),za=dailyZABalance(state,today);const t=timerSnapshot(now),start=a?a.start:t.last?t.last.start:null;return '<div class="card"><div class="label">'+(a?'Laufende Arbeitszeit':t.last?'Letzte Arbeitszeit':'Netto-Arbeitszeit')+'</div><div id="timer" class="timer">00:00:00</div><p class="center '+(a?(a.pauseStart===null?'pos':''):'muted')+'">'+(a?(a.pauseStart===null?'Arbeitszeit läuft':'Pause läuft'):(d.booked?'Tag erfasst':'Bereit zum Einstempeln'))+'</p><div class="track"><div id="bar" class="bar"></div></div><small id="target"></small><div class="daily-total"><span class="muted">Tagessumme '+(day===today?'heute':esc(day))+'</span><strong id="dayTotal">00:00:00</strong></div></div><div class="grid">'+metric('Beginn',start?fmt(start):'–',a?'Aktuelle Buchung':t.last?'Letzte Buchung':'Noch keine Buchung')+'<div class="card"><div class="label">Pause</div><div id="pauseTime" class="num">00:00:00</div><small>'+ (a?((fixedWindow(day)||autoDay(day)&&pauseMinimumOn(day)>0)?'Auto Abzug':'Erfasst'):t.last?(t.last.autoPauseMs?'Auto Abzug':'Erfasst'):'Keine Buchung') +'</small></div></div>'+'<div class="grid home-summary">'+metric('KW '+weekNumber(today),signed(w.actual,false),'Wochensoll '+signed(weeklyTarget(state),false))+metric('ZA-Konto',za===null?'–':signed(za),'Tagesaktuell · vorläufig',za===null?'':color(za))+'</div><div class="card home-absence">'+line('Abwesenheit','Urlaub, Krank, Feiertag, Arzt','+',"editCredit(null,'"+today+"')")+'</div>'+(a?(a.pauseStart!==null?btn('Pause beenden',"act('resume')",'full warn'):'')+btn('Arbeit beenden',"act('stop')",'full danger')+btn('Endzeit manuell wählen','openManualEnd()','full')+btn('Weitere Aktionen','openWorkActions()','full home-more'):btn('Arbeit starten',"act('start')",'full primary')+btn('Beginnzeit manuell wählen','openManualStart()','full'));}
function isWeekend(day){const wd=dayDate(day).getDay();return wd===0||wd===6;}
function visibleSelection(day){if(showWeekends||!isWeekend(day))return day;const forward=addDay(day,dayDate(day).getDay()===6?2:1);return forward.slice(0,7)===month?forward:addDay(day,dayDate(day).getDay()===6?-1:-2);}
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
  add(hasCreditInterval(c)?c.absenceStart:Infinity,line(CREDIT_TYPES[c.type]+(w&&c.type==='AB'?' · AB':''),hasCreditInterval(c)?range(c.absenceStart,c.absenceEnd)+(c.note?' · '+c.note:''):c.note||'Zeitgutschrift',signed(c.minutes,false),act));
 }
 const merged=[];for(const p of mp.sort((a,b)=>a[0]-b[0])){const last=merged[merged.length-1];if(last&&p[0]<=last[1])last[1]=Math.max(last[1],p[1]);else merged.push(p.slice());}
 for(const [a,b] of merged)add(a,'<div class="listrow"><span>Mittagspause · MP<small>'+esc(range(a,b))+' · automatisch</small></span><span>'+esc(signed(Math.floor((b-a)/MIN),false))+'</span></div>');
 if(w&&!exactWork&&d.es.some(e=>e.pauseMs))add(Infinity,'<p class="sub muted">Erfasste Pausen sind ohne Zeitlage gespeichert; der Arbeitsanteil der Mittagspause ist bereits in den Arbeitsbuchungen berücksichtigt.</p>');
 return rows.sort((a,b)=>a.t-b.t).map(r=>r.h).join('');
}
function calendar(){selected=visibleSelection(selected);const today=localDay(Date.now()),r=monthReport(state,month,today),d=daily(state,selected);const visible=r.days.filter(x=>showWeekends||!isWeekend(x.day));let cells=(showWeekends?['Mo','Di','Mi','Do','Fr','Sa','So']:['Mo','Di','Mi','Do','Fr']).map(x=>'<div class="label center">'+x+'</div>').join('');for(let i=0;i<(dayDate(visible[0].day).getDay()+6)%7;i++)cells+='<div></div>';for(const x of visible){const holiday=holidayName(x.day),sick=x.cs.some(c=>c.type==='KRK'),vacation=x.cs.some(c=>c.type==='URL'),ft=!!holiday||x.cs.some(c=>c.type==='FT');const kind=ft?'holiday':sick?'sick':vacation?'vacation':(x.es.length||x.active)?'ok':x.booked?'credit':!x.target?'off':'';const detail=x.active?'Läuft':x.booked?signed(x.actual,false).replace(' h',''):ft?'FT':x.target?'·':'Frei';const label=(ft?'FT ':sick?'KRK ':vacation?'URL ':'')+(x.booked||x.active?detail:ft?'':detail);cells+='<button class="'+kind+' '+(x.day===selected?'picked':'')+(x.day===today?' today':'')+'" aria-label="'+esc(longDay(x.day)+(holiday?' · '+holiday:'')+(sick?' · Krankenstand':'')+(vacation?' · Urlaub':'')+' · '+detail)+'" onclick="selectDay(\''+x.day+'\')">'+Number(x.day.slice(8))+'<small>'+esc(label.trim())+'</small></button>';}
let rows=dayBookingRows(d);return monthBar()+'<div class="card calendar-month"><div class="calendar '+(showWeekends?'seven':'')+'">'+cells+'</div><div class="callegend"><span><i style="background:#24543e"></i>Arbeit</span><span><i style="background:#9f3043"></i>Krankenstand</span><span><i style="background:#a65b16"></i>Urlaub</span><span><i style="background:#285ca3"></i>Feiertag</span><span><i style="background:#45536a"></i>Sonstige Buchung</span></div>'+r.days.filter(x=>holidayName(x.day)).map(x=>'<p class="sub holidaytext">'+esc(x.day.slice(8)+'. '+holidayName(x.day))+'</p>').join('')+'</div><div class="card calendar-day"><h2>'+esc(longDay(selected))+'</h2>'+(holidayName(selected)?'<p class="holidaytext">'+esc(holidayName(selected))+'</p>':'')+'<div class="row"><small>Soll '+esc(signed(d.target,false))+'</small><strong class="'+color(d.diff)+'">'+(d.active?'Läuft':d.booked?esc(signed(d.diff)):d.target?'Offen':'Frei')+'</strong></div>'+ (rows||'<p class="muted">Keine abgeschlossene Buchung</p>')+(d.booked&&!d.active&&(configuredWindow(selected)||fixedWindow(selected))?btn(fixedWindow(selected)?'Pausenregel prüfen':'Pausenfenster anwenden',"openFixedDay('"+selected+"')",'full'):'')+'<div class="calendar-actions">'+btn('Arbeitszeit +',"editEntry(null,'"+selected+"')",'full primary')+btn('Abwesenheit +',"editCredit(null,'"+selected+"')",'full')+'</div></div>';}
function selectDay(d){selected=d;render();}
function reports(){const today=localDay(Date.now()),r=monthReport(state,month,today);return monthBar()+'<h2>Kalendermonat</h2><div class="grid">'+metric('Soll',signed(r.calendarTarget,false))+metric('Ist',signed(r.calendarWork+r.calendarCredit,false),'inkl. Gutschriften')+metric('Gebuchte Differenz',signed(r.recordedDiff),r.missing+' offene vergangene Solltage · ohne Minus',color(r.recordedDiff))+metric('Gutschriften',signed(r.calendarCredit,false))+'</div><div class="card"><h2>Abrechnung · volle Wochen</h2><p class="sub muted">Nur vollständige, abgelaufene Wochen zählen zum Saldo.</p><div class="report-summary"><p class="sub muted">'+r.closed.length+' / '+r.assigned.length+' Wochen vollständig · Soll gesamt '+esc(signed(r.soll,false))+'</p><div class="row report-row"><span>Soll (abgeschlossen)</span><strong>'+esc(signed(r.closedSoll,false))+'</strong></div><div class="row report-row"><span>Ist (abgeschlossen)</span><strong>'+esc(signed(r.actual,false))+'</strong></div></div><div class="row report-row"><span>Mehrarbeit</span><strong class="pos">'+esc(signed(r.plus))+'</strong></div><div class="row report-row"><span>Minusstunden</span><strong class="neg">'+esc(signed(r.minus))+'</strong></div><div class="row report-row"><span>Ü50 (Modell)</span><strong>'+esc(signed(r.ot,false))+'</strong></div><div class="row report-row report-total"><span>Monatssaldo</span><strong class="'+color(r.diff)+'">'+esc(signed(r.diff))+'</strong></div></div><div class="card"><div class="label">ZA-Konto · Modell</div><div class="num '+(r.opening===null?'':color(r.opening+r.diff))+'">'+(r.opening===null?'Nicht hinterlegt':esc(signed(r.opening+r.diff)))+'</div><small>Vormonat: '+(r.opening===null?'–':esc(signed(r.opening)))+'</small>'+btn('Anfangssaldo bearbeiten','editOpening()','full')+'</div><div class="card"><h2>Kalenderwochen</h2>'+r.weeks.map(w=>line('KW '+weekNumber(w.start),w.start.slice(5)+' – '+w.end.slice(5)+' · '+(w.end.slice(0,7)!==month?'Folgemonat':w.complete?'Vollständig':'Vorläufig'),signed(w.actual,false),"showWeek('"+w.start+"')")).join('')+'</div>';}
function showWeek(start){const w=weekReport(state,start,localDay(Date.now()));openForm('KW '+weekNumber(start),'<p class="muted">'+esc(w.start+' – '+w.end)+'</p>'+(w.carry?'<p class="sub holidaytext">Aggregierter Übertrag: '+esc(signed(w.carryActual,false))+' Ist ('+esc(signed(w.carryPlus))+'); keine Einzelzeiten vorhanden.</p>':'')+w.days.map(d=>'<div class="listrow"><span>'+esc(longDay(d.day))+'<small>'+esc(d.active?'Läuft':d.booked?signed(d.diff):d.target?'Offen':'Frei')+'</small></span><strong>'+esc(signed(d.actual,false))+'</strong></div>').join('')+'<p class="sub muted">'+w.missing.length+' offene Solltage · kein automatischer Minusabzug</p><p>MA '+esc(signed(w.plus))+' · Minus '+esc(signed(w.minus))+' · Ü50 '+esc(signed(w.ot,false))+'</p>',null);}
const PAUSE_DAY_NAMES=['So','Mo','Di','Mi','Do','Fr','Sa'];
function pauseDayLabel(days){return PAUSE_DAY_NAMES.filter((_,i)=>days[i]).join(', ')||'Keine';}
function pauseRulesLabel(day,s=state){const days=pauseDaysOn(day,s),mins=pauseMinimumsOn(day,s);return [1,2,3,4,5].filter(i=>days[i]).map(i=>PAUSE_DAY_NAMES[i]+' '+mins[i]+' min').join(' · ')||'Keine';}
function openPauseDays(){if(pending||!db)return;const today=localDay(Date.now()),tomorrow=addDay(today,1),blocked=(state.active&&localDay(state.active.start)>=today)||state.entries.some(e=>localDay(e.start)>=today);const from=blocked?tomorrow:today;const days=pauseDaysOn(from,state),mins=pauseMinimumsOn(from,state);openForm('Automatische Pausen je Wochentag','<label for="fPauseFrom">Gültig ab</label><select id="fPauseFrom" onchange="loadPauseDays()"><option value="'+today+'" '+(blocked?'disabled':'selected')+'>Heute</option><option value="'+tomorrow+'" '+(blocked?'selected':'')+'>Morgen</option></select>'+[1,2,3,4,5].map(i=>'<label class="check"><input type="checkbox" id="fPauseDay'+i+'" '+(days[i]?'checked':'')+'> '+PAUSE_DAY_NAMES[i]+' · Automatik</label>'+field(PAUSE_DAY_NAMES[i]+' – Mindestpause (Minuten)','fPauseMin'+i,'number',mins[i],'required min="0" max="'+modelOf(state).pauseThreshold+'" step="1"')).join('')+'<p class="sub muted">Schwelle: '+esc(signed(modelOf(state).pauseThreshold,false))+' Brutto. Bereits erfasste Pausen werden angerechnet. Ausgeschaltete Tage erhalten keinen Auto-Abzug. Die Einstellungen gelten ab dem gewählten Datum; bestehende Buchungen werden nicht geändert.</p>','pauseDays');}
function loadPauseDays(){const day=$('fPauseFrom').value,days=pauseDaysOn(day,state),mins=pauseMinimumsOn(day,state);for(const i of [1,2,3,4,5]){$('fPauseDay'+i).checked=days[i];$('fPauseMin'+i).value=mins[i];}}
function modelDetails(s){const m=modelOf(s),names=['So','Mo','Di','Mi','Do','Fr','Sa'];return '<p>'+esc(m.label)+' · '+esc(signed(weeklyTarget(s),false))+' / Woche</p><p class="muted">Überstundengrenze: '+esc(signed(m.overtimeLimit,false))+'<br>Automatische Pause ab '+esc(signed(m.pauseThreshold,false))+' Brutto<br>'+esc(pauseRulesLabel(localDay(Date.now()),s))+'</p>'+[1,2,3,4,5].map(i=>'<div class="row"><small>'+names[i]+' · '+esc(m.times[i].join(' – '))+'</small><strong>'+esc(signed(m.targets[i],false))+'</strong></div>').join('')+'<p class="sub muted">Privates Profil ist lokal gespeichert. Ein Profilwechsel könnte historische Auswertungen ändern; deshalb ist er nur über eine vollständige, bestätigte Wiederherstellung möglich.</p>';}

function openFixedConfig(){
 const p=state.fixedPauseConfig||{days:Array(7).fill(false),window:['','']};
 openForm('Festes Mittagspausenfenster',field('Beginn','fFixedStart','time',p.window[0],'required step="60"')+field('Ende','fFixedEnd','time',p.window[1],'required step="60"')+[1,2,3,4,5].map(i=>'<label class="check"><input type="checkbox" id="fFixedDay'+i+'" '+(p.days[i]?'checked':'')+'> '+PAUSE_DAY_NAMES[i]+'</label>').join('')+'<p class="sub muted">Für ausgewählte Tage ersetzt das Zeitfenster die dauerabhängige Automatik. Nur überlappende Arbeits-/Arztzeit wird abgezogen. Andere Tage behalten ihre bisherige Regel. Neue Tage übernehmen die Einstellung; vorhandene Tage werden nur über den Kalender ausdrücklich umgestellt. Erfasste Pausen ohne Zeitlage werden auf den Arbeitsanteil angerechnet.</p>','fixedConfig');
}
function openFixedDay(day){
 if(pending||!db)return;const d=daily(state,day),w=configuredWindow(day),old=fixedWindow(day);
 openForm('Pausenregel für diesen Tag','<p>'+esc(longDay(day))+'</p><p class="sub muted">Aktuell: '+esc(old?old.join(' – '):'Dauerregel')+'</p><label for="fFixedMode">Abrechnungsregel</label><select id="fFixedMode" onchange="previewFixedDay()">'+(w?'<option value="fixed">'+esc(w.join(' – '))+' · fest</option>':'')+'<option value="duration">Bisherige Dauerregel</option></select><p id="fFixedPreview" class="sub muted"></p><label class="check"><input type="checkbox" id="fFixedConfirm"> Neuberechnung dieses Tages bestätigen</label>','fixedDay',day);previewFixedDay();
}
function previewFixedDay(){
 $('fFixedConfirm').checked=false;try{const day=form.id,before=daily(state,day),next=change(state,{type:'fixedPauseApply',day,useFixed:$('fFixedMode').value==='fixed'}),after=daily(next,day);$('fFixedPreview').textContent='Arbeit: '+signed(before.work,false)+' → '+signed(after.work,false)+' · Gutschrift: '+signed(before.credit,false)+' → '+signed(after.credit,false)+' · Ist: '+signed(before.actual,false)+' → '+signed(after.actual,false)+' · Differenz: '+signed(before.diff)+' → '+signed(after.diff);}catch(e){$('fFixedPreview').textContent=String(e.message||e);}
}
function settings(){return '<div class="card"><h2>Arbeitszeitmodell</h2>'+modelDetails(state)+((state.pauseDaysHistory||[]).filter(p=>p.from>localDay(Date.now())).map(p=>'<p class="sub muted">Ab '+esc(p.from)+': '+esc(pauseRulesLabel(p.from,state))+'</p>').join(''))+btn('Automatische Pausen ändern','openPauseDays()','full')+'<p class="sub muted">Festes Pausenfenster: '+esc(state.fixedPauseConfig?state.fixedPauseConfig.window.join(' – ')+' · '+pauseDayLabel(state.fixedPauseConfig.days):'Nicht eingerichtet')+'</p>'+btn('Festes Pausenfenster einstellen','openFixedConfig()','full')+'</div><div class="card"><h2>Datensicherung & Export</h2>'+monthBar()+btn('Arbeitszeiten CSV',"request({type:'csv',month:month})",'full')+btn('Auswertung CSV',"request({type:'report',month:month})",'full')+btn('JSON-Sicherung',"request({type:'json'})",'full')+btn('Historische Buchungen ergänzen','openHistory()','full')+btn('JSON importieren / wiederherstellen','openImport()','full')+'<p class="sub muted">Daten bleiben in diesem Web-App-Speicher. Sicherungen unter „Auf meinem iPhone“ ablegen. Browserdaten können verloren gehen. Kein automatischer Abgleich mit Scriptable.</p><p id="offlineStatus" class="sub muted">'+esc(offlineStatus)+'</p></div><div class="footer">TimeLog 3.0.24 · PWA · Offline<br>Abrechnungsmodell, keine Lohnverrechnung</div>';}
const NAV_ICONS={"home":"<path d=\"m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z\"/>","calendar":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M16 3v4M8 3v4M3 10h18M8 14h2m4 0h2m-8 4h2m4 0h2\"/>","reports":"<path d=\"M3 3v18h18M7 16v-5m5 5V7m5 9V4\"/>","settings":"<rect x=\"5\" y=\"3\" width=\"14\" height=\"18\" rx=\"2\"/><path d=\"M9 7h6M9 11h6M9 15h6\"/>"};
function navIcon(p){return '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+NAV_ICONS[p]+'</svg>';}
function render(){document.body.classList.toggle('calendar-compact',!!state.model&&page==='calendar');document.body.classList.toggle('home-compact',!!state.model&&page==='home');document.body.classList.toggle('reports-compact',!!state.model&&page==='reports');if(!state.model){$('heading').textContent='TimeLog';$('subtitle').textContent='Einrichtung · '+VERSION;$('main').classList.remove('month-swipe');$('nav').innerHTML='';$('main').innerHTML='<div class="card"><h2>Privates Arbeitszeitprofil erforderlich</h2><p>Importiere dein privates Profil, damit Sollzeit, Pausen und Abrechnungen korrekt berechnet werden. Die Datei bleibt auf diesem Gerät.</p>'+btn('Privates Profil einrichten','openProfile()','full primary')+btn('Historische Buchungen ergänzen','openHistory()','full')+btn('Vorhandene JSON-Sicherung importieren','openImport()','full')+btn('Vorhandene Daten sichern',"request({type:'json'})",'full')+'<p id="offlineStatus" class="sub muted">'+esc(offlineStatus)+'</p></div>';syncUI();return;}const today=localDay(Date.now());$('heading').textContent={home:'TimeLog',calendar:'Kalender',reports:'Auswertung',settings:'Einstellungen'}[page];$('subtitle').textContent=page==='home'?longDay(today):'TimeLog · 3.0.24';$('main').classList.toggle('month-swipe',page==='calendar'||page==='reports');$('main').innerHTML=({home,calendar,reports,settings}[page])();$('nav').innerHTML=[['home','Heute'],['calendar','Kalender'],['reports','Auswertung'],['settings','Daten']].map(([p,t])=>'<button class="'+(page===p?'sel':'')+'" onclick="go(\''+p+'\')">'+navIcon(p)+'<span>'+t+'</span>'+'</button>').join('');document.querySelectorAll('#main button').forEach(b=>{if(/request\(|act\(|discard\(|openManualStart\(|openManualEnd\(|openPauseDays\(/ .test(b.getAttribute('onclick')||''))b.dataset.write='1';});syncUI();live();}
function field(label,id,type,value,extra=''){return '<label for="'+id+'">'+esc(label)+'</label><input id="'+id+'" type="'+type+'" value="'+esc(value)+'" '+extra+'>';}
function noteField(note){return '<label for="fNote">Notiz</label><textarea id="fNote" maxlength="1000">'+esc(note)+'</textarea>';}
function openForm(title,body,kind,id){if(pending)return;form={kind,id};$('overlay').innerHTML='<div class="row dialog-header"><h2>'+esc(title)+'</h2><button class="dialog-close" onclick="closeForm()" aria-label="Schließen">Schließen</button></div><div class="card">'+body+'<p id="formError" class="error"></p>'+(kind?'<button data-write class="full primary" onclick="submitForm()">'+(kind==='manualStart'?'Arbeit starten':kind==='manualEnd'?'Arbeit beenden':'Speichern')+'</button>':'')+(id&&['entry','credit'].includes(kind)?'<button id="deleteButton" data-write class="full danger" onclick="deleteForm()">Löschen</button><div id="deleteConfirm" class="confirmbox hidden"><p>Buchung dauerhaft löschen?</p><button data-write class="full danger" onclick="confirmDelete()">Endgültig löschen</button><button class="full" onclick="cancelDelete()">Abbrechen</button></div>':'')+'</div>';$('overlay').classList.remove('hidden');$('overlay').scrollTop=0;syncUI();}
function closeForm(){if(pending)return;form=null;$('overlay').classList.add('hidden');}
function editEntry(id,day){if(pending)return;const e=state.entries.find(x=>x.id===id),times=defaultTimes(day),automatic=e?e.autoPause===true:effectiveAutoDay(day);openForm(e?'Buchung bearbeiten':'Arbeitszeit hinzufügen',(e?field('Beginn','fStart','datetime-local',localInput(e.start))+field('Ende','fEnd','datetime-local',localInput(e.end)):'<p class="muted">'+esc(longDay(day))+'</p>'+field('Beginn','fStart','time',times[0],'required step="60"')+field('Ende','fEnd','time',times[1],'required step="60"')+'<label class="check"><input type="checkbox" id="fNextDay"> Ende am Folgetag</label>')+field('Erfasste Pause (Minuten)','fPause','number',e?Math.round((e.pauseMs-(e.autoPauseMs||0))/MIN*100)/100:0,'min="0" step="0.01"')+'<label class="check"><input type="checkbox" id="fAuto" '+(automatic?'checked':'')+'> Automatische Tagespause</label>'+(prospectiveWindow(e?localDay(e.start):day)?'<p class="sub muted">Festes Pausenfenster '+esc(prospectiveWindow(e?localDay(e.start):day).join(' – '))+'; nur Überschneidung, ohne zusätzlichen Dauerabzug. Ohne Haken gilt die erfasste Pause.</p>':'<p class="sub muted">Ab '+esc(signed(modelOf(state).pauseThreshold,false))+' Brutto insgesamt '+esc(signed(pauseMinimumOn(e?localDay(e.start):day,state),false))+' für den angezeigten Tag'+(e?' (bei geändertem Beginn gilt dessen Wochentagsregel)':'')+', sofern nicht bereits mehr Pause erfasst wurde. Ohne Haken gilt die eingegebene Pause; weitere automatische Buchungen des Tages können die Tagespause ergänzen.</p>')+(e&&e.autoPauseMs?'<p class="sub muted">Aktuell zusätzlich automatisch: '+esc(clock(e.autoPauseMs))+'</p>':'')+noteField(e?e.note:''),'entry',id);if(!e)form.entryDay=day;}
function editCredit(id,day){
 if(pending)return;
 const c=state.credits.find(x=>x.id===id),kind=c?c.type:holidayName(day)?'FT':'KRK',timed=!!c&&hasCreditInterval(c);
 openForm(c?'Gutschrift bearbeiten':'Abwesenheit / Gutschrift',field('Datum','fDay','date',c?c.day:day,'onchange="updateCreditPreview()"')+'<label for="fKind">Buchungsart</label><select id="fKind" onchange="defaultCredit()">'+Object.entries(CREDIT_TYPES).map(([k,v])=>'<option value="'+k+'" '+(kind===k?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select><div id="fABMode" class="hidden"><label class="check"><input type="checkbox" id="fABManual" onchange="updateCreditMode()" '+(c&&c.type==='AB'&&!timed?'checked':'')+'> Minuten manuell eingeben</label></div><div id="fABTimes" class="hidden">'+field('Ausstempeln','fABFrom','time',timed?localInput(c.absenceStart).slice(11):'','step="60" oninput="updateCreditPreview()"')+field('Einstempeln','fABTo','time',timed?localInput(c.absenceEnd).slice(11):'','step="60" oninput="updateCreditPreview()"')+'<p id="fABPreview" class="sub muted" aria-live="polite"></p><div id="fABSplit" class="hidden"><p id="fABSplitInfo" class="sub muted"></p><label class="check"><input type="checkbox" id="fABSplitConfirm"> Arbeitsbuchung entsprechend aufteilen</label></div></div><div id="fMinuteFields">'+field('Anrechenbare Minuten','fMinutes','number',c?c.minutes:dayTarget(day),'min="0" max="1440" step="1"')+'</div>'+noteField(c?c.note:'')+'<p class="sub muted">ZA/Frei: 0 Minuten; die Sollzeit wird als Minus gebucht. Arzt/Behörde: Zeit zwischen Aus- und Einstempeln oder tatsächliche Minuten.</p>','credit',id);
 if(form&&form.kind==='credit')updateCreditMode();
}
function updateCreditMode(){const ab=$('fKind').value==='AB',timed=ab&&!$('fABManual').checked;$('fABMode').classList.toggle('hidden',!ab);$('fABTimes').classList.toggle('hidden',!timed);$('fMinuteFields').classList.toggle('hidden',timed);updateCreditPreview();}
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
function submitForm(){if(!form||pending)return;try{let a;if(form.kind==='manualStart'){assert(/^([01]\d|2[0-3]):[0-5]\d$/.test($('fManualStart').value),'Bitte eine gültige Beginnzeit eingeben.');a={type:'start',start:form.id+'T'+$('fManualStart').value};}else if(form.kind==='manualEnd'){assert(state.active&&state.active.id===form.id,'Die laufende Buchung hat sich geändert.');a={type:'stop',end:$('fManualEnd').value,note:state.active.note};}else if(form.kind==='fixedConfig'){a={type:'fixedPauseConfig',window:[$('fFixedStart').value,$('fFixedEnd').value],days:Array.from({length:7},(_,i)=>i===0||i===6?!!(state.fixedPauseConfig&&state.fixedPauseConfig.days[i]):$('fFixedDay'+i).checked)};}else if(form.kind==='fixedDay'){assert($('fFixedConfirm').checked,'Bitte Neuberechnung bestätigen.');a={type:'fixedPauseApply',day:form.id,useFixed:$('fFixedMode').value==='fixed'};}else if(form.kind==='pauseDays'){a={type:'pauseDays',from:$('fPauseFrom').value,days:Array.from({length:7},(_,i)=>i===0||i===6?pauseDaysOn($('fPauseFrom').value,state)[i]:$('fPauseDay'+i).checked),minimums:Array.from({length:7},(_,i)=>{if(i===0||i===6)return pauseMinimumsOn($('fPauseFrom').value,state)[i];const v=$('fPauseMin'+i).value.trim();assert(/^\d+$/.test(v),'Bitte ganze Pausenminuten eingeben.');return Number(v);})};}else if(form.kind==='entry'){const times=form.entryDay?entryFormTimes(form.entryDay,$('fStart').value,$('fEnd').value,$('fNextDay').checked):{start:$('fStart').value,end:$('fEnd').value};a={type:'save',id:form.id,...times,pause:$('fPause').value,autoPause:$('fAuto').checked,note:$('fNote').value};}else if(form.kind==='credit'){a={type:'credit',id:form.id,day:$('fDay').value,kind:$('fKind').value,note:$('fNote').value};if(a.kind==='AB'&&!$('fABManual').checked){a.fromTime=$('fABFrom').value;a.toTime=$('fABTo').value;if(form.splitEntryId&&$('fABSplitConfirm').checked)a.splitEntryId=form.splitEntryId;}else{assert(/^\d+$/.test($('fMinutes').value),'Bitte ganze Minuten eingeben.');a.minutes=Number($('fMinutes').value);}}else if(form.kind==='opening')a={type:'opening',month,value:$('fOpening').value.trim()?parseSigned($('fOpening').value):null};else if(form.kind==='note')a={type:'saveNote',note:$('fNote').value};else return;change(state,a);request(a);}catch(e){$('formError').textContent=String(e.message||e);}}
function deleteForm(){if(!form||!form.id||pending)return;const box=$('deleteConfirm');box.classList.remove('hidden');$('deleteButton').classList.add('hidden');box.scrollIntoView({block:'nearest'});}
function cancelDelete(){$('deleteConfirm').classList.add('hidden');$('deleteButton').classList.remove('hidden');}
function confirmDelete(){if(form&&form.id&&!pending)request({type:form.kind==='credit'?'deleteCredit':'delete',id:form.id});}
// A swipe changes only the selected month; no data or revision is changed.
function setupMonthSwipe(){
 const surface=$('main');let gesture=null;
 const allowed=()=> (page==='calendar'||page==='reports')&&!pending&&$('overlay').classList.contains('hidden');
 const reset=()=>{gesture=null;};
 surface.addEventListener('touchstart',e=>{
   reset();if(!allowed()||e.touches.length!==1||e.target.closest('input,textarea,select,[contenteditable]'))return;
   const t=e.touches[0];gesture={id:t.identifier,x:t.clientX,y:t.clientY,page,month,axis:null};
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


function reportCSV(month){const r=monthReport(state,month,localDay(Date.now())),q=v=>'"'+String(v).replace(/"/g,'""')+'"';const rows=[['Datum','Soll Minuten','Arbeit Minuten','Gutschrift Minuten','Ist Minuten','Differenz Minuten','Status','Buchungsarten','Feiertag AT']];for(const d of r.days)rows.push([d.day,d.target,d.work,d.credit,d.actual,d.booked&&!d.active?d.diff:'',d.active?'Läuft':d.booked?'Gebucht':d.target?'Offen':'Frei',d.cs.map(c=>c.type).join(', '),holidayName(d.day)]);rows.push([],['KW','Von','Bis','Soll Minuten','Ist Minuten','MA Minuten','Minus Minuten','Ü50 Minuten','Differenz Minuten','Status']);for(const w of r.weeks)rows.push([weekNumber(w.start),w.start,w.end,w.target,w.actual,w.plus,w.minus,w.ot,w.diff,(w.complete?'Vollständig':'Vorläufig')+(w.carry?' · inkl. aggregiertem Übertrag '+signed(w.carryActual,false)+' Ist':'')]);return '\uFEFF'+rows.map(r=>r.map(q).join(';')).join('\r\n');}

// PWA storage. All data operations stay in the browser; only static assets use the network.
let db=null, offlineStatus='Offline-Bereitschaft wird geprüft …';
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('arbeitszeit-local-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('states');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Bitte andere TimeLog-Fenster schließen.'));});}
function readState(){return new Promise((resolve,reject)=>{const tx=db.transaction('states','readonly'),r=tx.objectStore('states').getAll();let value; r.onsuccess=()=>{try{const all=r.result,valid=[];for(const item of all){try{valid.push(checkStored(item));}catch{}}assert(!all.length||valid.length,'Keine lesbaren lokalen Daten. Es wird nichts überschrieben.');value=valid.sort((a,b)=>b.revision-a.revision)[0]||null;}catch(e){reject(e);}};tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Lesefehler'));});}
function checkStored(value){const checked=validateState(value);assert(!checked.octoberReference||checked.reference,'Private Referenzdaten fehlen.');return checked;}
function persist(next,expected){return new Promise((resolve,reject)=>{const tx=db.transaction('states','readwrite'),store=tx.objectStore('states'),r=store.getAll();let failure; r.onsuccess=()=>{try{const valid=[];for(const item of r.result){try{valid.push(checkStored(item));}catch{}}assert(!r.result.length||valid.length,'Lokale Daten beschädigt.');const latest=valid.sort((a,b)=>b.revision-a.revision)[0];assert((latest?latest.revision:0)===expected,'Daten wurden in einem anderen Fenster geändert. App bitte neu öffnen.');checkStored(next);store.put(next,next.revision%2);const v=store.get(next.revision%2);v.onsuccess=()=>{try{assert(JSON.stringify(v.result)===JSON.stringify(next),'Speicherprüfung fehlgeschlagen.');}catch(e){failure=e;tx.abort();}};}catch(e){failure=e;tx.abort();}};tx.oncomplete=()=>resolve(next);tx.onerror=tx.onabort=()=>reject(failure||tx.error||new Error('Speicherung fehlgeschlagen.'));});}
function downloadFile(text,name,mime){const file=new Blob([text],{type:mime});const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function exportAction(a){if(a.type!=='json'){modelOf(state);assert(/^\d{4}-(0[1-9]|1[0-2])$/.test(a.month),'Ungültiger Monat.');}const name=a.type==='json'?'TimeLog-Sicherung-'+localDay(Date.now())+'.json':'TimeLog-'+a.month+(a.type==='report'?'-Auswertung':'')+'.csv';downloadFile(a.type==='json'?JSON.stringify(state,null,2):a.type==='csv'?csvMonth(state,a.month):reportCSV(a.month),name,a.type==='json'?'application/json':'text/csv;charset=utf-8');}
async function processRequest(req){let err='';try{const a=req.action;if(['csv','report','json'].includes(a.type)){exportAction(a);}else{const next=['import','profile','history'].includes(a.type)?a.value:change(state,a);state=await persist(next,state.revision);}}catch(e){err=String(e.message||e);}receive(req.seq,state,err);}
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
function openImport(){openForm('Lokale JSON-Sicherung importieren','<p>Wähle deine Sicherung aus „Auf meinem iPhone“. Der Import ersetzt den aktuellen PWA-Datenbestand vollständig. Vorher eine JSON-Sicherung des aktuellen Stands erstellen.</p><label for="backupFile">TimeLog-Sicherung (.json)</label><input id="backupFile" type="file" accept=".json,application/json"><label for="refFile">Privates Arbeitszeitprofil (bei älteren Sicherungen erforderlich, wenn noch nicht eingerichtet)</label><input id="refFile" type="file" accept=".json,application/json"><label class="check"><input id="importConfirm" type="checkbox"> Ich möchte den aktuellen Bestand ersetzen.</label>'+btn('Importieren','importLocal()','full primary'),null);}
async function readJSON(file){assert(file&&file.size<=20000000,'Bitte eine JSON-Datei bis 20 MB auswählen.');return JSON.parse(await file.text());}
function applyProfile(next,extra){assert(extra&&extra.kind==='arbeitszeit-private-profile-v1','Falsche private Profildatei.');assert(!next.model||JSON.stringify(next.model)===JSON.stringify(extra.model),'Die Sicherung enthält ein anderes Arbeitszeitprofil. Bitte ohne zusätzliche Profildatei importieren.');next.model=validateModel(extra.model);if(next.octoberReference&&!next.reference&&extra.reference)next.reference=extra.reference;return checkStored(next);}
function prepareImport(raw,extra,current){const next=validateState(raw);if(extra){if(extra.kind==='arbeitszeit-private-reference-v1'){assert(next.octoberReference&&!next.reference,'Referenz-Ergänzung nicht erforderlich.');next.reference=extra.reference;}else applyProfile(next,extra);}if(!next.model&&current.model)next.model=current.model;modelOf(next);checkStored(next);next.revision=Math.max(next.revision,current.revision)+1;assert(Number.isSafeInteger(next.revision),'Ungültige Revision.');return next;}
async function importProfile(){if(pending||!db)return;try{assert(!state.model,'Profil bereits eingerichtet.');const f=form,extra=await readJSON($('profileFile').files[0]);const next=applyProfile(JSON.parse(JSON.stringify(state)),extra);assert(form===f&&!pending,'Import abgebrochen.');next.revision=state.revision+1;assert(Number.isSafeInteger(next.revision),'Ungültige Revision.');request({type:'profile',value:next});}catch(e){if($('formError'))$('formError').textContent=String(e.message||e);}}
async function importLocal(){if(pending||!db)return;try{assert($('importConfirm').checked,'Bitte Ersetzen bestätigen.');const f=form,backup=$('backupFile').files[0],supplement=$('refFile').files[0];const raw=await readJSON(backup),extra=supplement?await readJSON(supplement):null;const next=prepareImport(raw,extra,state);assert(form===f&&!pending,'Import abgebrochen.');request({type:'import',value:next});}catch(e){if($('formError'))$('formError').textContent=String(e.message||e);}}
async function offlineSetup(){try{assert('serviceWorker' in navigator,'Offline-Funktion benötigt HTTPS.');await navigator.serviceWorker.register('./sw.js');await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Offline-Installation noch nicht abgeschlossen; bitte online neu öffnen.')),15000))]);offlineStatus='Offline-Dateien installiert. Offline-Start nach Schließen testen.';if(navigator.storage&&navigator.storage.persist){const yes=await navigator.storage.persist().catch(()=>false);offlineStatus+=' Dauerhafter Speicher: '+(yes?'gewährt':'nicht bestätigt')+'.';}}catch(e){offlineStatus='Offline-Installation nicht bestätigt: '+String(e.message||e);}if($('offlineStatus'))$('offlineStatus').textContent=offlineStatus;}
async function init(){try{db=await openDB();const loaded=await readState();state=loaded||emptyState();saved=state.revision;status='Lokal gespeichert';render();setupMonthSwipe();setInterval(live,250);offlineSetup();}catch(e){if(db)db.close();db=null;status='Speicher nicht verfügbar';error=String(e.message||e);$('heading').textContent='TimeLog – Speicherfehler';$('main').textContent='Es wird nichts überschrieben. Bitte App erneut öffnen.';syncUI();}}
init();
