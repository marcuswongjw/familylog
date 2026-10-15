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
  return Object.assign({status:'ok'},habitArchivePage_(ss,data,email,member));
}
function sheetRowById_(sheet,id,width) {
  var height=sheet.getLastRow()-1;if(height<1)return null;
  perfCount_('sheet_searches',1);perfCount_('search_cells',height);
  var match=sheet.getRange(2,1,height,1).createTextFinder(id).matchCase(true).matchEntireCell(true).useRegularExpression(false).matchFormulaText(false).findNext();
  if(!match)return null;
  var row=perfReadRange_(sheet,match.getRow(),1,1,width)[0];
  // Never return another row if a manual row deletion raced the point lookup.
  if(toStr(row[0])!==id)throw new Error('Record changed during loading. Please retry.');
  return row;
}
function schoolPlanById_(ss,id,email) {
  if(!isAdultEmail_(email))return {status:'error',message:'Announcements are available only to parents.'};
  if(typeof id!=='string'||!/^school_[a-f0-9]{64}$/.test(id))throw new Error('Invalid announcement');
  var sheet=ss.getSheetByName('SchoolAnnouncements');
  var row=sheet?sheetRowById_(sheet,id,7):null;
  return row?{status:'ok',plan:schoolStoredPlan_(row)}:{status:'error',message:'This announcement is no longer available. Refresh and try again.'};
}
function habitLogFromRow_(r) {
  var tz=Session.getScriptTimeZone();
  return {id:toStr(r[0]),habitId:toStr(r[1]),member:toStr(r[2]),habit:toStr(r[3]),date:r[4] instanceof Date?Utilities.formatDate(r[4],tz,'yyyy-MM-dd'):toStr(r[4]),notes:toStr(r[5]),loggedBy:toStr(r[6]),timestamp:r[7] instanceof Date?Utilities.formatDate(r[7],tz,"yyyy-MM-dd'T'HH:mm:ss'Z'"):toStr(r[7])};
}
function habitReadLogs_(ss,email,start,end) {
  var sheet=ss.getSheetByName('HabitLogs');if(!sheet)return [];
  var rows=(start||end)?habitWindowRows_(sheet,start,end):perfReadRows_(sheet),result=[],adult=!email||isAdultEmail_(email),member=memberNameFromEmail_(email);
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

// Avoid downloading old notes for a date window. Source rows remain authoritative;
// no persisted index or assumptions about append/date order are introduced.
var HABIT_SELECTIVE_READ_THRESHOLD_=500;
function habitReadLock_(work) {
  var lock=LockService.getScriptLock();
  perfStage_('lock_wait',function(){lock.waitLock(10000);});
  try{return work();}finally{lock.releaseLock();}
}
function selectedRowRuns_(positions) {
  var sorted=positions.slice().sort(function(a,b){return a-b;}),runs=[];
  sorted.forEach(function(row){var last=runs[runs.length-1];if(last&&row<=last.end+1)last.end=Math.max(last.end,row);else runs.push({start:row,end:row});});
  // Nearby matches fit one bounded range, avoiding many small remote calls.
  if(runs.length>1&&sorted[sorted.length-1]-sorted[0]+1<=sorted.length*2+32)return [{start:sorted[0],end:sorted[sorted.length-1]}];
  return runs;
}
function readSelectedHabitRows_(sheet,positions) {
  var result={},runs=selectedRowRuns_(positions);
  if(!positions.length)return result;
  // Sparse layouts use the original one-read path instead of unbounded RPC fan-out.
  if(runs.length>8){
    var rows=perfReadRows_(sheet);positions.forEach(function(row){result[row]=rows[row-1];});return result;
  }
  runs.forEach(function(run){var rows=perfReadRange_(sheet,run.start,1,run.end-run.start+1,8);rows.forEach(function(row,i){result[run.start+i]=row;});});
  return result;
}
function habitWindowRows_(sheet,start,end) {
  if(sheet.getLastRow()<=HABIT_SELECTIVE_READ_THRESHOLD_)return perfReadRows_(sheet);
  return habitReadLock_(function(){
    var height=sheet.getLastRow()-1;if(height<1)return [[]];
    var dates=perfReadRange_(sheet,2,5,height,1),positions=[];
    dates.forEach(function(row,i){var day=row[0] instanceof Date?Utilities.formatDate(row[0],'Asia/Singapore','yyyy-MM-dd'):toStr(row[0]);if(day&&(!start||day>=start)&&(!end||day<end))positions.push(i+2);});
    var selected=readSelectedHabitRows_(sheet,positions);
    // Preserve source row order and the legacy header slot expected by the reader.
    return [[]].concat(positions.map(function(row){return selected[row];}));
  });
}
function habitArchivePage_(ss,data,email,member) {
  var sheet=ss.getSheetByName('HabitLogs');if(!sheet)return {items:[],nextCursor:null};
  var adult=isAdultEmail_(email),owner=memberNameFromEmail_(email);
  var allowed=function(log){return (adult||log.member===owner)&&log.habitId===data.habit_id&&(member==='All'||log.member===member);};
  if(sheet.getLastRow()<=HABIT_SELECTIVE_READ_THRESHOLD_){
    var logs=habitReadLogs_(ss,email,'','').filter(allowed);
    return archivePage_(logs.map(function(log){return {key:log.date,item:log};}),data.cursor,50);
  }
  return habitReadLock_(function(){
    var height=sheet.getLastRow()-1;if(height<1)return {items:[],nextCursor:null};
    // Five small metadata columns; notes/timestamps are fetched only for this page.
    var metadata=perfReadRange_(sheet,2,1,height,5),records=[];
    metadata.forEach(function(row,i){if(!row[0]||!row[4])return;var log=habitLogFromRow_(row);if(!allowed(log))return;log.sourceRow=i+2;records.push({key:log.date,item:log});});
    var page=archivePage_(records,data.cursor,50),positions=page.items.map(function(log){return log.sourceRow;});
    var selected=readSelectedHabitRows_(sheet,positions);
    page.items=page.items.map(function(log){
      var loaded=habitLogFromRow_(selected[log.sourceRow]);
      // The lock coordinates app writes; revalidate selection against manual sheet edits too.
      if(loaded.id!==log.id || loaded.habitId!==log.habitId || loaded.member!==log.member || loaded.date!==log.date || !allowed(loaded))throw new Error('History changed during loading. Please retry.');
      return loaded;
    });
    return page;
  });
}
