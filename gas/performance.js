// Request-local diagnostics. Never store payloads, identities, IDs, URLs or error text.
var perfContext_ = null;
var PERF_ENDPOINTS_ = ['get_all','get_family_dashboard','get_family_core','get_family_calendar','get_parent_dashboard','get_events','get_todos','get_birthdays','get_rewards','write','reminder_snapshot','prepare_family_tasks','verify_reminder_snapshot'];
var PERF_STAGES_ = ['auth','family_forward','core','parent_dashboard','calendar_read','calendar_preparation','lock_wait','todos','habits','habit_logs','rewards','school_plans','school_health','activity','expenses','budgets','recurring','private_records'];
var PERF_COUNTS_ = ['sheet_reads','rows_scanned','calendar_pages','calendar_events','errors'];
function perfStage_(name, work) {
  if (!perfContext_ || PERF_STAGES_.indexOf(name)<0) return work();
  var context=perfContext_,start=Date.now(),reads=context.counts.sheet_reads||0,rows=context.counts.rows_scanned||0;
  try { return work(); } finally {
    var stage=context.stages[name]||(context.stages[name]={ms:0,calls:0,sheetReads:0,rowsScanned:0});stage.ms+=Math.max(0,Date.now()-start);stage.calls++;stage.sheetReads+=(context.counts.sheet_reads||0)-reads;stage.rowsScanned+=(context.counts.rows_scanned||0)-rows;
  }
}
function perfCount_(name,value) {
  if(perfContext_ && PERF_COUNTS_.indexOf(name)>=0 && Number.isFinite(value) && value>=0)perfContext_.counts[name]=(perfContext_.counts[name]||0)+value;
}
function perfReadRows_(sheet) {
  var rows=sheet.getDataRange().getValues();perfCount_('sheet_reads',1);perfCount_('rows_scanned',rows.length);return rows;
}
function perfSnapshot_() {
  var c=perfContext_;return {schema:1,service:FAMILY_BACKEND_MODE_?'family':'parents',endpoint:c.endpoint,totalMs:Math.max(0,Date.now()-c.start),stages:c.stages,counts:c.counts};
}
function perfJson_(value) {
  if(perfContext_ && value && value.status==='error')perfCount_('errors',1);
  if(perfContext_?.adult && value && !Array.isArray(value))value._performance=perfSnapshot_();
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) {
  var previous=perfContext_;
  perfContext_={start:Date.now(),endpoint:'other',stages:{},counts:{},adult:false};
  try { return doPostInner_(e); }
  finally {
    try { console.log(JSON.stringify({event:'nest.performance',...perfSnapshot_()})); } catch(ignore) {}
    perfContext_=previous;
  }
}

function verifyFirebaseToken() { var args=arguments; return perfStage_('auth',function(){return verifyFirebaseTokenMeasured_.apply(null,args);}); }
function familyForward_() { var args=arguments; return perfStage_('family_forward',function(){return familyForward_Measured_.apply(null,args);}); }
function getEvents() { var args=arguments; return perfStage_('calendar_read',function(){return getEventsMeasured_.apply(null,args);}); }
function calendarPreparation_() { var args=arguments; return perfStage_('calendar_preparation',function(){return calendarPreparation_Measured_.apply(null,args);}); }
function getTodos() { var args=arguments; return perfStage_('todos',function(){return getTodosMeasured_.apply(null,args);}); }
function getRewards_() { var args=arguments; return perfStage_('rewards',function(){return getRewards_Measured_.apply(null,args);}); }
function getExpensesData() { var args=arguments; return perfStage_('expenses',function(){return getExpensesDataMeasured_.apply(null,args);}); }
function getBudgets() { var args=arguments; return perfStage_('budgets',function(){return getBudgetsMeasured_.apply(null,args);}); }
function getAllDashboardData() { var args=arguments; return perfStage_('core',function(){return getAllDashboardDataMeasured_.apply(null,args);}); }
function getParentDashboardData() { var args=arguments; return perfStage_('parent_dashboard',function(){return getParentDashboardDataMeasured_.apply(null,args);}); }
function getHabits() { var args=arguments; return perfStage_('habits',function(){return getHabitsMeasured_.apply(null,args);}); }
function getHabitLogs() { var args=arguments; return perfStage_('habit_logs',function(){return getHabitLogsMeasured_.apply(null,args);}); }
function getActivityLog() { var args=arguments; return perfStage_('activity',function(){return getActivityLogMeasured_.apply(null,args);}); }
function schoolReadPlans_() { var args=arguments; return perfStage_('school_plans',function(){return schoolReadPlans_Measured_.apply(null,args);}); }
function schoolRecordWarnings_() { var args=arguments; return perfStage_('school_health',function(){return schoolRecordWarnings_Measured_.apply(null,args);}); }
function getRecurring() { var args=arguments; return perfStage_('recurring',function(){return getRecurringMeasured_.apply(null,args);}); }
function getFertilityData() { var args=arguments; return perfStage_('private_records',function(){return getFertilityDataMeasured_.apply(null,args);}); }
function getAppreciationsData() { var args=arguments; return perfStage_('private_records',function(){return getAppreciationsDataMeasured_.apply(null,args);}); }
function getLoveCheckinsData() { var args=arguments; return perfStage_('private_records',function(){return getLoveCheckinsDataMeasured_.apply(null,args);}); }
function getIntimacyLogData() { var args=arguments; return perfStage_('private_records',function(){return getIntimacyLogDataMeasured_.apply(null,args);}); }
function getBucketList() { var args=arguments; return perfStage_('private_records',function(){return getBucketListMeasured_.apply(null,args);}); }
