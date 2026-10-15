// Archives stay in their original sheets. Read authorization precedes parsing/pagination.
function archivePage_(items, cursor, size) {
  var before=null;
  if(cursor!=null && cursor!=='') {
    if(typeof cursor!=='string' || cursor.length>512)throw new Error('Invalid archive cursor');
    before=JSON.parse(cursor);
    if(!before || typeof before.key!=='string' || before.key.length>40 || typeof before.id!=='string' || !before.id || before.id.length>200)throw new Error('Invalid archive cursor');
  }
  items.sort(function(a,b){return a.key===b.key ? (a.item.id<b.item.id?1:a.item.id>b.item.id?-1:0) : a.key<b.key?1:-1;});
  if(before)items=items.filter(function(r){return r.key<before.key || r.key===before.key && r.item.id<before.id;});
  var page=items.slice(0,size),last=page[page.length-1];
  return {items:page.map(function(r){return r.item;}),nextCursor:items.length>size?JSON.stringify({key:last.key,id:last.item.id}):null};
}
function schoolSummary_(plan) {
  return {id:plan.id,title:plan.title,child:plan.child,status:plan.status,revision:plan.revision,summaryOnly:true};
}
function schoolCoreRecords_(rows, adult, deferArchives) {
  if(!adult)return {plans:[],warnings:[]};
  var plans=[],bad=0,published=0;
  // Stored rows are in append order. All unfinished reviews remain available.
  rows.slice().reverse().forEach(function(row){
    try {var plan=schoolStoredPlan_(row);if(!deferArchives || plan.status!=='published')plans.push(plan);else if(published++<20)plans.push(schoolSummary_(plan));}
    catch(ignore){bad++;}
  });
  return {plans:plans,warnings:bad?[bad+' school record(s) could not load. Other family data is available. Ask a parent to repair the SchoolAnnouncements records.']:[]};
}
function familyArchive_(ss, data, email) {
  if(data.kind==='school') {
    if(!isAdultEmail_(email))return {status:'error',message:'Announcements are available only to parents.'};
    var records=[];
    schoolStoredRows_(ss).forEach(function(row){try{
      var plan=schoolStoredPlan_(row);
      if(plan.status!=='published')return;
      var updated=new Date(row[5]),key=isNaN(updated.getTime())?'':updated.toISOString();
      records.push({key:key,item:schoolSummary_(plan)});
    }catch(ignore){}});
    return Object.assign({status:'ok'},archivePage_(records,data.cursor,20));
  }
  if(data.kind!=='habits')throw new Error('Invalid archive kind');
  if(typeof data.habit_id!=='string' || !data.habit_id || data.habit_id.length>200)throw new Error('Invalid habit');
  var member=isAdultEmail_(email)?(data.member||'All'):memberNameFromEmail_(email);
  if(['All','Marcus','Eleanor','Mikaela','Meaghan'].indexOf(member)<0)throw new Error('Invalid member');
  var logs=habitReadLogs_(ss,email,'','').filter(function(l){return l.habitId===data.habit_id && (member==='All'||l.member===member);});
  return Object.assign({status:'ok'},archivePage_(logs.map(function(l){return {key:l.date,item:l};}),data.cursor,50));
}
function schoolPlanById_(ss,id,email) {
  if(!isAdultEmail_(email))return {status:'error',message:'Announcements are available only to parents.'};
  if(typeof id!=='string'||!/^school_[a-f0-9]{64}$/.test(id))throw new Error('Invalid announcement');
  var row=schoolStoredRows_(ss).find(function(r){return r[0]===id;});
  return row?{status:'ok',plan:schoolStoredPlan_(row)}:{status:'error',message:'This announcement is no longer available. Refresh and try again.'};
}
function habitLogFromRow_(r) {
  var tz=Session.getScriptTimeZone();
  return {id:toStr(r[0]),habitId:toStr(r[1]),member:toStr(r[2]),habit:toStr(r[3]),date:r[4] instanceof Date?Utilities.formatDate(r[4],tz,'yyyy-MM-dd'):toStr(r[4]),notes:toStr(r[5]),loggedBy:toStr(r[6]),timestamp:r[7] instanceof Date?Utilities.formatDate(r[7],tz,"yyyy-MM-dd'T'HH:mm:ss'Z'"):toStr(r[7])};
}
function habitReadLogs_(ss,email,start,end) {
  var sheet=ss.getSheetByName('HabitLogs');if(!sheet)return [];
  var rows=perfReadRows_(sheet),result=[],adult=!email||isAdultEmail_(email),member=memberNameFromEmail_(email);
  for(var i=1;i<rows.length;i++){
    var r=rows[i];if(!r[0]||!r[4]||!adult&&r[2]!==member)continue;
    var log=habitLogFromRow_(r);if(start&&log.date<start || end&&log.date>=end)continue;result.push(log);
  }
  return result.reverse();
}
function habitLogWindow_() {
  var today=Utilities.formatDate(new Date(),'Asia/Singapore','yyyy-MM-dd');
  var cutoff=new Date(today+'T00:00:00Z');cutoff.setUTCDate(cutoff.getUTCDate()-45);
  return {start:cutoff.toISOString().slice(0,10)};
}
function habitWeekRead_(ss,date,email) {
  schoolDate_(date,false);
  var start=new Date(date+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-((start.getUTCDay()+6)%7));
  var first=start.toISOString().slice(0,10);start.setUTCDate(start.getUTCDate()+7);var end=start.toISOString().slice(0,10);
  return {status:'ok',start:first,end:end,items:habitReadLogs_(ss,email,first,end).map(habitProgressLog_)};
}
function habitProgressLog_(log) {
  // Notes belong in the on-demand history view, not every overview refresh.
  return {id:log.id,habitId:log.habitId,member:log.member,habit:log.habit,date:log.date,loggedBy:log.loggedBy,timestamp:log.timestamp};
}
