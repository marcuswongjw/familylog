// Separate Apps Script runtimes; family writes have one script lock owner.
var FAMILY_BACKEND_MODE_ = false;
var FAMILY_SERVICE_FORWARDING_ = true;
var FAMILY_SERVICE_URL_ = 'https://script.google.com/macros/s/AKfycbxm__4eECo8jb61787ZSIEZpK7y7xXpaWs9IjD8kyPvpE5mpvFSVGOcWNazZUTcPZORGQ/exec';
var FAMILY_READ_ACTIONS_ = ['get_family_core','get_family_calendar','get_family_dashboard','get_rewards','get_events','get_todos','get_birthdays'];
var FAMILY_WRITE_NOTES_ = ['save_school_draft','publish_school_draft','set_reward_rule','set_habit_rewards','buy_reward_item','save_companion','set_family_goal','add_event','delete_event','update_event_date','add_todo','complete_todo','help_todo','delete_todo','edit_todo','add_birthday','log_habit','delete_habit_log','add_habit','edit_habit','set_habit_state','delete_habit'];
function familyReadAction_(action) { return FAMILY_READ_ACTIONS_.indexOf(action) !== -1; }
function familyWriteNote_(note) { return FAMILY_WRITE_NOTES_.indexOf(toStr(note).toLowerCase().trim()) !== -1; }
function familyForward_(payload) {
  if (!payload.idToken) return {status:'error',message:'Unauthorized'};
  var response = UrlFetchApp.fetch(FAMILY_SERVICE_URL_, {method:'post',contentType:'text/plain;charset=utf-8',payload:JSON.stringify(payload),muteHttpExceptions:true});
  if(response.getResponseCode() !== 200) throw new Error('Family backend unavailable');
  var result = JSON.parse(response.getContentText());
  // Never fall back to local writes: a lost response may follow a committed save.
  return result;
}
function activitySheetName_() { return FAMILY_BACKEND_MODE_ ? 'FamilyActivityLog' : 'ActivityLog'; }
function operationSheetName_() { return FAMILY_BACKEND_MODE_ ? 'FamilyOperations' : 'Operations'; }

function legacySplitDashboard_(payload,email) {
  var family = familyForward_({action:'get_family_dashboard',idToken:payload.idToken});
  if (family.status === 'error' || !isAdultEmail_(email)) return family;
  return Object.assign({},family,getParentDashboardData(email));
}
