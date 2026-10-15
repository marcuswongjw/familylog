let lastDashboardRefresh=null;
function calendarStatusText(){
 const refreshed=data.calendarRefreshedAt?new Date(data.calendarRefreshedAt).toLocaleString('en-SG',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
 const previous=refreshed?' Showing the last calendar from '+refreshed+'.':' Calendar events are not available yet.';
 if(data.calendarState==='loading')return 'Refreshing calendar…'+previous;
 if(data.calendarState==='error')return 'Calendar could not refresh.'+previous;
 if(data.calendarState!=='ready')return 'Calendar has not refreshed yet.';
 return (refreshed?'Calendar last refreshed '+refreshed+'.':'Calendar loaded.')+(data.preparationState==='error'?' Preparation tasks could not refresh. Please retry the calendar.':'');
}
function updateCalendarStatus(){
 const offline=navigator.onLine===false,loading=data.calendarState==='loading';
 document.querySelectorAll('[data-calendar-status]').forEach(el=>{
  // Keep controls mounted so refreshes do not discard keyboard focus.
  if(!el.querySelector('[data-calendar-message]'))el.innerHTML='<p data-calendar-message role="status" aria-live="polite"></p><button type="button" class="btn btn-s btn-sm" onclick="retryFamilyCalendar(this)"></button>';
  el.querySelector('[data-calendar-message]').textContent=(offline?'Offline. ':'')+calendarStatusText();
  const button=el.querySelector('button');button.textContent=loading?'Refreshing calendar…':data.calendarState==='ready'&&data.preparationState!=='error'?'Refresh calendar':'Retry calendar';button.disabled=offline||loading;
  el.classList.toggle('calendar-status-error',data.calendarState==='error'||data.preparationState==='error');
 });
}
function updateConnectionStatus(){
 const el=document.getElementById('connection-status');if(!el)return;const offline=navigator.onLine===false,parent=typeof isParentApp==='function'&&isParentApp();
 const label=parent?'Parent details':'Family details';
 el.textContent=(offline?'Offline — changes cannot be saved. ':'')+label+' · '+(lastDashboardRefresh?'Last refreshed '+lastDashboardRefresh.toLocaleTimeString('en-SG',{hour:'2-digit',minute:'2-digit'}):'Not refreshed yet.')+(!parent&&data.calendarState==='loading'?' · Calendar refreshing…':!parent&&data.calendarState==='error'?' · Calendar could not refresh.':!parent&&data.preparationState==='error'?' · Preparation tasks need a retry.':'');
 el.classList.toggle('is-offline',offline);updateCalendarStatus();
}
function initConnectionStatus(){let el=document.getElementById('connection-status');if(!el){el=document.createElement('div');el.id='connection-status';el.setAttribute('role','status');el.setAttribute('aria-live','polite');document.querySelector('#app-screen').prepend(el);}window.addEventListener('online',updateConnectionStatus);window.addEventListener('offline',updateConnectionStatus);updateConnectionStatus();}
function resetConnectionStatus(){lastDashboardRefresh=null;delete data.calendarRefreshedAt;delete data.calendarState;delete data.preparationState;updateConnectionStatus();}
function markDashboardRefreshed(){lastDashboardRefresh=new Date();updateConnectionStatus();}
