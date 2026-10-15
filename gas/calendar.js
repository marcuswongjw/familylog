// Authoritative Calendar read and task reconciliation share the family writer lock.
function calendarPreparation_(ss, strict) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var lock = LockService.getScriptLock(), held = false, events;
  try {
    lock.waitLock(30000); held = true;
    events = getEvents();
    reconcileCalendarTasks_(ss, events);
    return {events:events, preparationState:'ready'};
  } catch (err) {
    if (strict) throw err;
    // Reading events can still succeed when preparation is temporarily unavailable.
    return {events:events || getEvents(), preparationState:'error'};
  } finally { if (held) lock.releaseLock(); }
}

function reconcileCalendarTasks_(ss,events){
  var today=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd');
  var horizon=new Date(today+'T00:00:00Z');horizon.setUTCDate(horizon.getUTCDate()+7);var end=horizon.toISOString().slice(0,10);
  var existing=ensureTodoIds_(ss),rows=existing.getDataRange().getValues(),sources={},desired={};
  rows.slice(1).forEach(function(r,i){if(r[8])sources[r[8]]={row:i+2,value:r};});
  events.forEach(function(ev){if(!ev.id||!/nat b training/i.test(ev.title||'')||!/^\d{4}-\d{2}-\d{2}$/.test(ev.dateRaw||''))return;
    var d=new Date(ev.dateRaw+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-1);var due=d.toISOString().slice(0,10),key='cal_natb_'+(ev.seriesId?schoolHash_(ev.id):toStr(ev.id).replace(/[^a-zA-Z0-9]/g,'_'));
    [['bag','Pack sailing bag (life jacket, watch, clothes, rashguard, towel)'],['box','Pack sailing box (shoes, slippers)']].forEach(function(item){desired[key+'_'+item[0]]={task:item[1],due:due,eventDate:ev.dateRaw,title:ev.title,legacySource:ev.seriesId?'cal_natb_'+toStr(ev.seriesId).replace(/[^a-zA-Z0-9]/g,'_')+'_'+item[0]:''};});
  });
  Object.keys(desired).forEach(function(source){var plan=desired[source],old=sources[source],due=parseEventDate(plan.due,'');
    var legacy=plan.legacySource&&sources[plan.legacySource];
    if(!old&&legacy&&legacy.value[3]&&Utilities.formatDate(new Date(legacy.value[3]),Session.getScriptTimeZone(),'yyyy-MM-dd')===plan.due){
      existing.getRange(legacy.row,9).setValue(source);legacy.value[8]=source;sources[source]=legacy;delete sources[plan.legacySource];old=legacy;
    }
    if(old){if(['Done','Deleted'].indexOf(old.value[5])<0){var oldDate=old.value[3]?Utilities.formatDate(new Date(old.value[3]),Session.getScriptTimeZone(),'yyyy-MM-dd'):'';if(oldDate!==plan.due)existing.getRange(old.row,4).setValue(due);}return;}
    if(plan.eventDate<today||plan.eventDate>end)return;
    existing.appendRow([new Date(),schoolCell_(plan.task),'Mikaela',due,'System','Open','',Utilities.getUuid(),source,'packing','Mikaela','Calendar: '+plan.title]);
  });
  rows.slice(1).forEach(function(r,i){if(!/^cal_natb_/.test(toStr(r[8]))||desired[r[8]]||['Done','Deleted'].indexOf(r[5])>=0)return;var due=r[3]?Utilities.formatDate(new Date(r[3]),Session.getScriptTimeZone(),'yyyy-MM-dd'):'';var yesterday=new Date(today+'T00:00:00Z');yesterday.setUTCDate(yesterday.getUTCDate()-1);if(due>=yesterday.toISOString().slice(0,10))existing.getRange(i+2,6).setValue('Deleted');});
}

function memberEvents_(events, verifiedEmail) {
  if (isAdultEmail_(verifiedEmail)) return events;
  var member = memberNameFromEmail_(verifiedEmail);
  return member ? events.filter(function(e) { return (e.tags || []).indexOf(member) !== -1 || (e.tags || []).indexOf('Everyone') !== -1 || (e.tags || []).indexOf('Family') !== -1; }) : [];
}
// Expanded REST instances have stable occurrence IDs, including moved exceptions.
function calendarApi_(method, path, body, etag) {
  var headers = {Authorization:'Bearer '+ScriptApp.getOAuthToken()};
  if (etag) headers['If-Match'] = etag;
  var options = {method:method,headers:headers,muteHttpExceptions:true};
  if (body) { options.contentType='application/json'; options.payload=JSON.stringify(body); }
  var response;
  try { response=UrlFetchApp.fetch('https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(CALENDAR_ID)+'/events'+path, options); } catch(e) { throw new Error('Could not read or update the family calendar. Please refresh again.'); }
  var code = response.getResponseCode();
  if ((code === 404 || code === 410) && path.charAt(0) === '/' && method === 'get') return null;
  if (code < 200 || code >= 300) {
    var reason='';
    try { var error=JSON.parse(response.getContentText()).error; reason=error.errors&&error.errors[0]?error.errors[0].reason:''; } catch(ignore) {}
    var failure=new Error(code === 412 ? 'This event changed. Refresh Calendar before trying again.' : 'Could not update or read the family calendar (HTTP '+code+'). Please refresh again.');
    failure.calendarStatus=code;failure.calendarReason=reason;throw failure;
  }
  return code === 204 ? {} : JSON.parse(response.getContentText());
}
function getEvents() {
  var now = new Date(), start = new Date(now), end = new Date(now);
  start.setDate(now.getDate()-30); end.setDate(now.getDate()+90);
  var base = '?singleEvents=true&orderBy=startTime&maxResults=2500&timeMin='+encodeURIComponent(start.toISOString())+'&timeMax='+encodeURIComponent(end.toISOString());
  var links=schoolEventLinks_(), manual=manualEventMembers_(), result=[], token='', seen={};
  do {
    var page=calendarApi_('get',base+(token?'&pageToken='+encodeURIComponent(token):''));
    if (!page || (!Array.isArray(page.items) && !(page.kind === 'calendar#events' && page.items === undefined))) throw new Error('Could not read the family calendar. Please refresh again.');
    (page.items||[]).forEach(function(raw){
      if(raw.status === 'cancelled')return;
      var title=raw.summary||'',desc=raw.description||'',ical=raw.iCalUID||raw.id;
      var link=links[ical]||links[raw.id], props=raw.extendedProperties||{};
      var tag=(props.private||{}).familylogMember||(props.shared||{}).familylogMember||(props.private||{}).member||(link&&link.child)||manual[ical]||'';
      var tags=tag === 'Everyone'||tag === 'Family'?['Family','Marcus','Eleanor','Mikaela','Meaghan']:tag?[tag]:FAMILY_MEMBERS.filter(function(m){return m!=='Everyone'&&(title+' '+desc).toLowerCase().indexOf(m.toLowerCase())!==-1;});
      var allDay=!!raw.start.date, tz=Session.getScriptTimeZone();
      var first=allDay?parseEventDate(raw.start.date,''):new Date(raw.start.dateTime);
      var last=allDay?parseEventDate(raw.end.date,''):new Date(raw.end.dateTime);
      result.push({id:raw.recurringEventId?'instance:'+raw.id:ical,seriesId:raw.recurringEventId?ical:'',
        originalStart:raw.originalStartTime?(raw.originalStartTime.dateTime||raw.originalStartTime.date):'',
        title:title,notes:desc,location:raw.location||'',tags:tags,sourceId:link?link.sourceId:'',
        date:Utilities.formatDate(first,tz,'dd MMM yyyy'),dateRaw:allDay?raw.start.date:Utilities.formatDate(first,tz,'yyyy-MM-dd'),
        time:allDay?'All day':Utilities.formatDate(first,tz,'h:mm a'),endTime:allDay?'':Utilities.formatDate(last,tz,'h:mm a'),allDay:allDay,
        duration:(last-first)/3600000,examNote:/EYE/.test(title+' '+desc)?'End Year Exams':''});
    });
    token=page.nextPageToken||'';
    if(token&&seen[token])throw new Error('Incomplete calendar response. Please refresh again.');
    seen[token]=true;
  } while(token);
  return result;
}
function calendarTarget_(id) {
  if(id.indexOf('instance:')===0){
    var instance=id.slice(9);
    if(!/^[a-zA-Z0-9_-]{1,1024}$/.test(instance))throw new Error('Invalid calendar occurrence. Refresh Calendar.');
    var raw=calendarApi_('get','/'+encodeURIComponent(instance));
    if(!raw||raw.status==='cancelled')return null;
    if(schoolEventLinks_()[raw.iCalUID]||schoolEventLinks_()[raw.id])throw new Error('School events are linked to a reviewed plan. Edit them in Google Calendar.');
    return {raw:raw,id:id};
  }
  var nativeEvent=CalendarApp.getCalendarById(CALENDAR_ID).getEventById(id);
  if(nativeEvent&&typeof nativeEvent.isRecurringEvent==='function'&&nativeEvent.isRecurringEvent())throw new Error('Refresh Calendar before changing a recurring event. Choose one occurrence.');
  return nativeEvent?{nativeEvent:nativeEvent,id:id}:null;
}
function calendarMove_(target,newDate) {
  if(target.raw){
    var raw=target.raw,patch;
    if(raw.start.date){
      var days=Math.round((new Date(raw.end.date+'T00:00:00Z')-new Date(raw.start.date+'T00:00:00Z'))/86400000);
      var end=new Date(newDate+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+days);
      patch={start:{date:newDate},end:{date:end.toISOString().slice(0,10)}};
    }else{
      var oldStart=new Date(raw.start.dateTime),oldEnd=new Date(raw.end.dateTime);
      var next=parseEventDate(newDate,Utilities.formatDate(oldStart,Session.getScriptTimeZone(),'HH:mm'));
      next.setSeconds(oldStart.getSeconds(),oldStart.getMilliseconds());
      patch={start:{dateTime:next.toISOString(),timeZone:Session.getScriptTimeZone()},end:{dateTime:new Date(next.getTime()+(oldEnd-oldStart)).toISOString(),timeZone:Session.getScriptTimeZone()}};
    }
    calendarApi_('patch','/'+encodeURIComponent(raw.id)+'?sendUpdates=none',patch,raw.etag);
    return raw.summary||'';
  }
  var ev=target.nativeEvent,start=ev.getStartTime(),end=ev.getEndTime();
  if(ev.isAllDayEvent()){
    var next=parseEventDate(newDate,''),last=new Date(next);last.setDate(last.getDate()+Math.round((end-start)/86400000));
    ev.setAllDayDates(next,last);
  }else{
    var next=parseEventDate(newDate,Utilities.formatDate(start,Session.getScriptTimeZone(),'HH:mm'));
    next.setSeconds(start.getSeconds(),start.getMilliseconds());
    ev.setTime(next,new Date(next.getTime()+(end-start)));
  }
  return ev.getTitle();
}
function calendarDelete_(target){
  if(!target)return '';
  if(target.raw){calendarApi_('delete','/'+encodeURIComponent(target.raw.id)+'?sendUpdates=none',null,target.raw.etag);return target.raw.summary||'';}
  var title=target.nativeEvent.getTitle();target.nativeEvent.deleteEvent();return title;
}
