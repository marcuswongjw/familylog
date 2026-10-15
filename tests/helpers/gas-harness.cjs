// Node workers emulate the Apps Script manifest's timezone, including on UTC CI hosts.
process.env.TZ = 'Asia/Singapore';
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto');
const {URL}=require('node:url');
// Model the actual Sheets/Calendar boundaries, including a lost response AFTER an
// external write, so retries are tested rather than just successful code paths.
function harness() {
  class Sheet {
    constructor(rows = []) { this.rows = rows; this.failAppendAfter = false; }
    appendRow(row) { this.rows.push([...row]); if (this.failAppendAfter) { this.failAppendAfter = false; throw new Error('Lost Sheets response'); } }
    getLastRow() { return this.rows.length; }
    deleteRow(index) { this.rows.splice(index - 1, 1); }
    getDataRange() { return { getValues: () => this.rows.map(r => [...r]) }; }
    getRange(row, col, height = 1, width = 1) {
      return { getValues: () => Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>this.rows[row+i-1]?.[col+j-1] ?? '')), setValue: value => this.getRange(row, col).setValues([[value]]), setValues: values => {
        for (let i = 0; i < height; i++) for (let j = 0; j < width; j++) { this.rows[row + i - 1] ||= []; this.rows[row + i - 1][col + j - 1] = values[i][j]; }
      } };
    }
  }
  const sheets = {}, properties = {};
  const ss = { getSheetByName: name => sheets[name] || null, insertSheet: name => sheets[name] = new Sheet() };
  const calendar = new Map();
  const calendarEvents = [];
  let failCalendarAfter = false;
  function nativeTarget(id){
    const raw=[...calendar.values()].find(e=>e.iCalUID===id&&e.status!=='cancelled');
    const e=calendarEvents.find(e=>(e.id===id||e.seriesId===id)&&e.status!=='cancelled');
    if(!raw&&!e)return null;
    const date=part=>new Date(part.dateTime||part.date+'T00:00:00+08:00');
    return {getId:()=>id,getTitle:()=>raw?raw.summary:e.title,isRecurringEvent:()=>raw?!!raw.recurringEventId:!!e.recurring,
      getStartTime:()=>raw?date(raw.start):e.start,getEndTime:()=>raw?date(raw.end):e.end,isAllDayEvent:()=>raw?!!raw.start.date:!!e.allDay,
      deleteEvent(){if(raw)raw.status='cancelled';if(e)e.status='cancelled';},
      setTime(start,end){if(end<=start)throw Error('Invalid Calendar interval');if(raw){raw.start={dateTime:start.toISOString()};raw.end={dateTime:end.toISOString()};}if(e){e.start=start;e.end=end;}},
      setAllDayDates(start,end){if(end<=start)throw Error('Invalid all-day Calendar interval');if(raw){raw.start={date:c.Utilities.formatDate(start,'Asia/Singapore','yyyy-MM-dd')};raw.end={date:c.Utilities.formatDate(end,'Asia/Singapore','yyyy-MM-dd')};}if(e){e.start=start;e.end=end;}}
    };
  }

  const c = vm.createContext({ console: { log() {} }, Date, JSON, PropertiesService: { getScriptProperties: () => ({ getProperties: () => properties, getProperty:key=>properties[key], setProperty:(key,value)=>properties[key]=value }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Session: { getScriptTimeZone: () => 'Asia/Singapore' }, ScriptApp: { getOAuthToken: () => 'test-token' },
    CalendarApp: {
      getCalendarById: () => ({
        getName: () => 'Family Calendar',
        getEventById: nativeTarget,
        getEvents: () => calendarEvents.map(e => ({
          getId: () => e.id,
          getTitle: () => e.title,
          getDescription: () => e.description || '',
          getTag: () => '',
          getLocation: () => e.location || '',
          getStartTime: () => e.start,
          getEndTime: () => e.end,
          isAllDayEvent: () => !!e.allDay
        }))
      })
    },
    Utilities: { getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' },
      computeHmacSha256Signature:(value,key)=>[...crypto.createHmac('sha256',key).update(value).digest()],
      computeDigest: (_, value) => [...crypto.createHash('sha256').update(value).digest()],
      formatDate: (date, zone, format) => {
        const d=new Date(date),parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d).map(p=>[p.type,p.value]));
        const month=new Intl.DateTimeFormat('en-GB',{timeZone:zone,month:'short'}).format(d),hour=Number(parts.hour);
        return format.replace(/yyyy|MMMM|MMM|MM|dd|HH|hh|h|mm|ss|a|'T'/g,t=>({yyyy:parts.year,MMMM:new Intl.DateTimeFormat('en-GB',{timeZone:zone,month:'long'}).format(d),MMM:month,MM:parts.month,dd:parts.day,HH:parts.hour,hh:String(hour%12||12).padStart(2,'0'),h:String(hour%12||12),mm:parts.minute,ss:parts.second,a:hour<12?'AM':'PM',"'T'":'T'}[t]));
      } },
    UrlFetchApp: { fetch: (url, opts = {}) => {
      const u=new URL(url), tail=decodeURIComponent(u.pathname.split('/events')[1]||''),method=opts.method||'get';
      let code=200,saved;
      const nativeRaw=e=>({id:e.restId||e.id,iCalUID:e.seriesId||e.id,summary:e.title,description:e.description||'',location:e.location||'',status:e.status||'confirmed',
        start:e.allDay?{date:new Date(e.start.getTime()+8*3600000).toISOString().slice(0,10)}:{dateTime:e.start.toISOString()},
        end:e.allDay?{date:new Date(e.end.getTime()+8*3600000).toISOString().slice(0,10)}:{dateTime:e.end.toISOString()},
        ...(e.recurring?{recurringEventId:e.seriesId||e.id,originalStartTime:e.originalStartTime||{dateTime:e.start.toISOString()}}:{})});
      const native=calendarEvents.find(e=>(e.restId||e.id)===tail.slice(1));
      if(method==='post'){
        const event=JSON.parse(opts.payload);
        if(calendar.has(event.id)){code=409;saved={};}
        else {saved={...event,iCalUID:event.id+'@google.com'};calendar.set(event.id,saved);if(failCalendarAfter){failCalendarAfter=false;throw Error('Lost Calendar response');}}
      }else if(!tail){
        const all=[...new Map([...calendar.values(),...calendarEvents.map(nativeRaw)].map(e=>[e.id,e])).values()],min=Date.parse(u.searchParams.get('timeMin')),max=Date.parse(u.searchParams.get('timeMax'));
        saved={items:all.filter(e=>e.status!=='cancelled'&&(!Number.isFinite(min)||Date.parse(e.end.dateTime||e.end.date)>min)&&(!Number.isFinite(max)||Date.parse(e.start.dateTime||e.start.date)<max))};
      }else{
        saved=calendar.get(tail.slice(1))||(native&&nativeRaw(native));code=saved?200:404;
        if(saved&&method==='patch'){
          saved={...saved,...JSON.parse(opts.payload)};calendar.set(saved.id,saved);
          if(native){native.start=new Date(saved.start.dateTime||saved.start.date+'T00:00:00+08:00');native.end=new Date(saved.end.dateTime||saved.end.date+'T00:00:00+08:00');}
        }
        if(saved&&method==='delete'){calendar.set(saved.id,{...saved,status:'cancelled'});if(native)native.status='cancelled';code=204;}
      }
      return {getResponseCode:()=>code,getContentText:()=>JSON.stringify(saved)};
    } }
  });
  vm.runInContext(['Code.js','gas/performance.js','gas/auth.js','gas/rewards.js','gas/money.js','gas/calendar.js','gas/tasks.js','gas/backend.js'].map(file=>fs.readFileSync(require.resolve('../../'+file),'utf8')).join('\n'),c);
  c.FAMILY_SERVICE_FORWARDING_ = false;
  return { c, ss, sheets, calendar, calendarEvents, Sheet, failCalendar: () => { failCalendarAfter = true; }, write: (payload, email = 'marcuswongjw@gmail.com') => c.handleWrite({ ...payload, _verifiedEmail: email }) };
}

module.exports = { harness };
