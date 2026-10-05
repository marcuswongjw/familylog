function syncCalendarEventTasks_(ss, events) {
  if (!Array.isArray(events)) return;
  ss=ss||SpreadsheetApp.getActiveSpreadsheet();
  var lock=LockService.getScriptLock();lock.waitLock(1000);
  try { reconcileCalendarTasks_(ss,events); } finally {lock.releaseLock();}
}
function reconcileCalendarTasks_(ss,events){
  var today=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd');
  var horizon=new Date(today+'T00:00:00Z');horizon.setUTCDate(horizon.getUTCDate()+7);var end=horizon.toISOString().slice(0,10);
  var existing=ensureTodoIds_(ss),rows=existing.getDataRange().getValues(),sources={},desired={};
  rows.slice(1).forEach(function(r,i){if(r[8])sources[r[8]]={row:i+2,value:r};});
  events.forEach(function(ev){if(!ev.id||!/nat b training/i.test(ev.title||'')||!/^\d{4}-\d{2}-\d{2}$/.test(ev.dateRaw||''))return;
    var d=new Date(ev.dateRaw+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-1);var due=d.toISOString().slice(0,10),key='cal_natb_'+toStr(ev.id).replace(/[^a-zA-Z0-9]/g,'_');
    [['bag','Pack sailing bag (life jacket, watch, clothes, rashguard, towel)'],['box','Pack sailing box (shoes, slippers)']].forEach(function(item){desired[key+'_'+item[0]]={task:item[1],due:due,eventDate:ev.dateRaw,title:ev.title};});
  });
  Object.keys(desired).forEach(function(source){var plan=desired[source],old=sources[source],due=parseEventDate(plan.due,'');
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
function getEvents() {
  try {
    var calendar        = CalendarApp.getCalendarById(CALENDAR_ID);
    var now             = new Date();
    var thirtyDaysAgo   = new Date(); thirtyDaysAgo.setDate(now.getDate() - 30);
    var thirtyDaysLater = new Date(); thirtyDaysLater.setFullYear(now.getFullYear() + 1);
    var schoolLinks = schoolEventLinks_();
    var manualMembers = manualEventMembers_();
    var events          = calendar.getEvents(thirtyDaysAgo, thirtyDaysLater);
    var tz              = Session.getScriptTimeZone();
    var result          = [];
    for (var i = 0; i < events.length; i++) {
      var ev        = events[i];
      var rawTitle  = ev.getTitle();
      var desc      = ev.getDescription() || '';
      var titleDesc = rawTitle + ' ' + desc;
      var explicitTag = '';
      try { if (typeof ev.getTag === 'function') explicitTag = ev.getTag('familylogMember'); } catch (te) {}
      if (!explicitTag && schoolLinks[ev.getId()]) explicitTag = schoolLinks[ev.getId()].child;
      if (!explicitTag) explicitTag = manualMembers[ev.getId()] || '';
      var tags;
      if (explicitTag === 'Family' || explicitTag === 'Everyone') {
        tags = ['Family', 'Marcus', 'Eleanor', 'Mikaela', 'Meaghan'];
      } else if (explicitTag) {
        tags = [explicitTag];
      } else {
        tags = FAMILY_MEMBERS.filter(function(m) { return m !== 'Everyone' && titleDesc.toLowerCase().indexOf(m.toLowerCase()) !== -1; });
      }
      var duration  = 0;
      try {
        duration = (ev.getEndTime().getTime() - ev.getStartTime().getTime()) / (1000 * 60 * 60);
      } catch (de) {}

      var isEYE = (rawTitle.indexOf('EYE') !== -1 || desc.indexOf('EYE') !== -1);
      var examNote = isEYE ? 'End Year Exams' : '';

      result.push({
        id:      ev.getId(),
        title:   rawTitle,
        examNote: examNote,
        date:    Utilities.formatDate(ev.getStartTime(), tz, 'dd MMM yyyy'),
        dateRaw: Utilities.formatDate(ev.getStartTime(), tz, 'yyyy-MM-dd'),
        time:    ev.isAllDayEvent() ? 'All day' : Utilities.formatDate(ev.getStartTime(), tz, 'h:mm a'),
        endTime: ev.isAllDayEvent() ? '' : Utilities.formatDate(ev.getEndTime(), tz, 'h:mm a'),
        allDay:  ev.isAllDayEvent(),
        notes:   desc,
        location: ev.getLocation() || '',
        tags:    tags,
        sourceId: schoolLinks[ev.getId()] ? schoolLinks[ev.getId()].sourceId : '',
        duration: duration
      });
    }
    return result;
  } catch (e) { throw new Error('Could not read the family calendar. Please refresh again.'); }
}

