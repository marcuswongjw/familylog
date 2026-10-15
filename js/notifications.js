/* Preferences belong to an account; delivery belongs to the active device account. */
let reminderPreferences=null,reminderBusy=false,reminderForegroundBound=false;
let reminderInit=null,reminderOpening=false,reminderLoadError='';
let reminderUpdates=Promise.resolve();
function reminderDevice(){let id=localStorage.getItem('nest_reminder_device');if(!id){id=crypto.randomUUID();localStorage.setItem('nest_reminder_device',id);}return id;}
function reminderAccount(email){
 if(!navigator.serviceWorker)return;
 const generation=sessionGeneration;
 // Keep a pending clear for a slow first worker install; it never blocks the page.
 navigator.serviceWorker.ready.then(r=>{if(generation===sessionGeneration)r.active?.postMessage({type:'NOTIFICATION_ACCOUNT',email});}).catch(()=>{});
}
function resetReminders(){
 reminderPreferences=null;reminderBusy=false;reminderInit=null;reminderOpening=false;reminderLoadError='';
 document.getElementById('reminder-dialog')?.remove();
 const bell=document.getElementById('notifBell');bell?.classList.remove('on');if(bell){bell.disabled=false;bell.removeAttribute('aria-busy');}
 reminderAccount(null);
}
function reminderDeadline(work,ms,message){
 let timer;
 return Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),ms);})]).finally(()=>clearTimeout(timer));
}
function updateReminderDevice(payload,active){
 // A new account's binding follows any in-flight update in this tab.
 const update=reminderUpdates.catch(()=>{}).then(async()=>{
  if(!active())return null;
  const service=await ensureFunctionServices();if(!active())return null;
  return service.httpsCallable('updateReminderSettings',{timeout:payload.settings?.enabled?60000:20000})(payload);
 });
 reminderUpdates=update.catch(()=>{});return update;
}
function bindReminderForeground(service){
 if(reminderForegroundBound)return;
 service.onMessage(payload=>{
  const email=currentUserEmail,generation=sessionGeneration;
  if(!email||!reminderPreferences?.enabled||payload.data?.recipient!==email||!navigator.serviceWorker)return;
  navigator.serviceWorker.ready.then(r=>{
   if(email===currentUserEmail&&generation===sessionGeneration&&reminderPreferences?.enabled)r.active?.postMessage({type:'REMINDER_MESSAGE',data:payload.data});
  }).catch(()=>{});
 });
 reminderForegroundBound=true;
}
async function reminderToken(active=()=>true){
 if(!navigator.serviceWorker)throw new Error('This browser does not support push reminders.');
 const service=await ensurePushMessaging();if(!active())return '';
 bindReminderForeground(service);
 const registration=await reminderDeadline(navigator.serviceWorker.ready,15000,'Reminders are still preparing. Please try again.');
 if(!active())return '';
 return reminderDeadline(service.getToken({vapidKey:VAPID_KEY,serviceWorkerRegistration:registration}),20000,'Could not register reminders in time. Please retry.');
}
function initReminders(){
 const email=currentUserEmail,generation=sessionGeneration;
 if(!email||typeof isParentApp==='function'&&isParentApp())return Promise.resolve(false);
 if(reminderInit?.email===email&&reminderInit.generation===generation)return reminderInit.promise;
 reminderAccount(null);reminderLoadError='';
 const active=()=>email===currentUserEmail&&generation===sessionGeneration;
 const entry={email,generation};reminderInit=entry;
 entry.promise=(async()=>{
  try{
   // Always revoke the old device token on sign-in, including opted-out accounts.
   const result=await updateReminderDevice({device_id:reminderDevice(),token:''},active);
   if(!active())return false;
   const prefs=result.data.settings;
   if(prefs.enabled&&typeof Notification!=='undefined'&&Notification.permission==='granted'){
    const token=await reminderToken(active);if(!active())return false;
    if(!token)throw new Error('Could not register this device. Try again.');
    await updateReminderDevice({device_id:reminderDevice(),token},active);if(!active())return false;
   }
   reminderPreferences=prefs;reminderAccount(prefs.enabled?email:null);
   document.getElementById('notifBell')?.classList.toggle('on',!!prefs.enabled);return true;
  }catch(error){if(active())reminderLoadError=error.message||'Could not load reminders. Please retry.';return false;}
  finally{if(reminderInit===entry)reminderInit=null;}
 })();return entry.promise;
}
function closeReminderDialog(dialog){
 if(!dialog.isConnected)return;
 dialog.close();dialog.remove();document.getElementById('notifBell')?.focus();
}
async function toggleNotifications(){
 if(reminderOpening)return;
 const email=currentUserEmail,generation=sessionGeneration,active=()=>email===currentUserEmail&&generation===sessionGeneration;
 const bell=document.getElementById('notifBell');reminderOpening=true;if(bell){bell.disabled=true;bell.setAttribute('aria-busy','true');}
 try{if(!reminderPreferences||reminderInit)await initReminders();if(!active())return;if(!reminderPreferences){showError(reminderLoadError||'Could not load reminder settings. Please try again.');return;}

 document.getElementById('reminder-dialog')?.remove();const dialog=document.createElement('dialog');dialog.id='reminder-dialog';dialog.setAttribute('aria-labelledby','reminder-title');
 const p=reminderPreferences,hours=key=>Array.from({length:24},(_,h)=>`<option value="${h}" ${p[key]===h?'selected':''}>${String(h).padStart(2,'0')}:00</option>`).join('');
 dialog.innerHTML=`<h2 id="reminder-title">Little reminders</h2><p>One daily nudge for unfinished tasks and habits. Times are Singapore time.</p>${[['enabled','Enable reminders'],['packing','Things to bring'],['habits','Unfinished habits'],['overdue',isAdultUser?'Due tasks, consent and payments':'Due tasks'],...(isAdultUser?[['includeChildren','Include the children’s tasks and habits']]:[])].map(([k,label])=>`<label class="reminder-option"><input type="checkbox" id="reminder-${k}" ${p[k]?'checked':''}> ${label}</label>`).join('')}<label>Daily reminder <select id="reminder-hour">${hours('hour')}</select></label><div class="reminder-quiet"><label>Quiet from<select aria-label="Quiet hours start" id="reminder-quietStart">${hours('quietStart')}</select></label><label>Until<select aria-label="Quiet hours end" id="reminder-quietEnd">${hours('quietEnd')}</select></label></div><p style="font-size:13px">A parent must enable reminders once to connect the family plan. Browser permission is requested only when you enable them.</p><p id="reminder-error" role="alert"></p><button id="reminder-save" class="btn btn-p">Save reminders</button> <button id="reminder-close" class="btn btn-s">Close</button>`;
 document.body.append(dialog);dialog.showModal();dialog.addEventListener('cancel',event=>{event.preventDefault();closeReminderDialog(dialog);});dialog.querySelector('#reminder-close').onclick=()=>closeReminderDialog(dialog);dialog.querySelector('#reminder-save').onclick=()=>saveReminders(dialog);
 }finally{if(active()){reminderOpening=false;if(bell){bell.disabled=false;bell.removeAttribute('aria-busy');}}}
}
async function saveReminders(dialog){
 if(reminderBusy)return;const email=currentUserEmail,generation=sessionGeneration,active=()=>email===currentUserEmail&&generation===sessionGeneration;
 const prefs={};for(const key of ['enabled','packing','habits','overdue','includeChildren'])prefs[key]=!!dialog.querySelector('#reminder-'+key)?.checked;for(const key of ['hour','quietStart','quietEnd'])prefs[key]=Number(dialog.querySelector('#reminder-'+key).value);
 reminderBusy=true;dialog.querySelector('#reminder-save').disabled=true;
 try{if(prefs.enabled&&(prefs.quietStart!==prefs.quietEnd&&(prefs.quietStart<prefs.quietEnd?prefs.hour>=prefs.quietStart&&prefs.hour<prefs.quietEnd:prefs.hour>=prefs.quietStart||prefs.hour<prefs.quietEnd)))throw new Error('Choose a reminder time outside your quiet hours.');let token='';if(prefs.enabled){if(typeof Notification==='undefined')throw new Error('This browser does not support reminders.');if(await Notification.requestPermission()!=='granted')throw new Error('Allow notifications in your browser settings to enable reminders.');if(!active())return;token=await reminderToken(active);if(!token)throw new Error('Could not register this device. Try again.');}
 if(!active())return;const response=await updateReminderDevice({device_id:reminderDevice(),token,settings:prefs},active);if(!active())return;const result=response.data;
 reminderPreferences=result.settings;reminderAccount(prefs.enabled?email:null);document.getElementById('notifBell')?.classList.toggle('on',prefs.enabled);closeReminderDialog(dialog);toast(prefs.enabled&&!result.bridgeReady?'Saved. Ask a parent to enable reminders to connect the family plan.':'Reminder settings saved.');
 }catch(err){if(active()){const message=err.message||'Could not save reminders.';if(dialog.isConnected)dialog.querySelector('#reminder-error').textContent=message;else showError(message);}}finally{if(active()){reminderBusy=false;dialog.querySelector('#reminder-save').disabled=false;}}
}
