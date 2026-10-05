/* Preferences belong to an account; delivery belongs to the active device account. */
let reminderPreferences=null,reminderBusy=false,reminderForegroundBound=false;
function reminderDevice(){let id=localStorage.getItem('nest_reminder_device');if(!id){id=crypto.randomUUID();localStorage.setItem('nest_reminder_device',id);}return id;}
function reminderAccount(email){if(!navigator.serviceWorker)return;const generation=sessionGeneration;navigator.serviceWorker.ready.then(r=>{if(generation===sessionGeneration)r.active?.postMessage({type:'NOTIFICATION_ACCOUNT',email});});}
function resetReminders(){reminderPreferences=null;reminderBusy=false;document.getElementById('reminder-dialog')?.remove();document.getElementById('notifBell')?.classList.remove('on');reminderAccount(null);}
async function reminderToken(){if(!messaging||!navigator.serviceWorker)throw new Error('This browser does not support push reminders.');return messaging.getToken({vapidKey:VAPID_KEY,serviceWorkerRegistration:await navigator.serviceWorker.ready});}
async function initReminders(){
 const email=currentUserEmail,generation=sessionGeneration;if(!email)return;reminderAccount(null);
 if(messaging&&!reminderForegroundBound){reminderForegroundBound=true;messaging.onMessage(payload=>{navigator.serviceWorker.ready.then(r=>r.active?.postMessage({type:'REMINDER_MESSAGE',data:payload.data}));});}
 try{const call=firebase.functions().httpsCallable('updateReminderSettings');let result=(await call({device_id:reminderDevice(),token:''})).data;
 if(email!==currentUserEmail||generation!==sessionGeneration)return;
 reminderPreferences=result.settings;
 if(result.settings.enabled&&typeof Notification!=='undefined'&&Notification.permission==='granted'){
 const token=await reminderToken();if(email!==currentUserEmail||generation!==sessionGeneration)return;await call({device_id:reminderDevice(),token});
 }
 if(email===currentUserEmail&&generation===sessionGeneration){reminderAccount(reminderPreferences.enabled?email:null);document.getElementById('notifBell')?.classList.toggle('on',!!reminderPreferences.enabled);}
 }catch(_){/* Settings remain explicitly unavailable until opened/retried. */}
}
async function toggleNotifications(){
 if(!reminderPreferences){await initReminders();if(!reminderPreferences){showError('Could not load reminder settings. Please try again.');return;}}
 document.getElementById('reminder-dialog')?.remove();const dialog=document.createElement('dialog');dialog.id='reminder-dialog';dialog.setAttribute('aria-labelledby','reminder-title');
 const p=reminderPreferences,hours=key=>Array.from({length:24},(_,h)=>`<option value="${h}" ${p[key]===h?'selected':''}>${String(h).padStart(2,'0')}:00</option>`).join('');
 dialog.innerHTML=`<h2 id="reminder-title">Little reminders</h2><p>One daily nudge for unfinished tasks and habits. Times are Singapore time.</p>${[['enabled','Enable reminders'],['packing','Things to bring'],['habits','Unfinished habits'],['overdue',isAdultUser?'Due tasks, consent and payments':'Due tasks'],...(isAdultUser?[['includeChildren','Include the children’s tasks and habits']]:[])].map(([k,label])=>`<label class="reminder-option"><input type="checkbox" id="reminder-${k}" ${p[k]?'checked':''}> ${label}</label>`).join('')}<label>Daily reminder <select id="reminder-hour">${hours('hour')}</select></label><div class="reminder-quiet"><label>Quiet from<select aria-label="Quiet hours start" id="reminder-quietStart">${hours('quietStart')}</select></label><label>Until<select aria-label="Quiet hours end" id="reminder-quietEnd">${hours('quietEnd')}</select></label></div><p style="font-size:13px">A parent must enable reminders once to connect the family plan. Browser permission is requested only when you enable them.</p><p id="reminder-error" role="alert"></p><button id="reminder-save" class="btn btn-p">Save reminders</button> <button id="reminder-close" class="btn btn-s">Close</button>`;
 document.body.append(dialog);dialog.showModal();dialog.querySelector('#reminder-close').onclick=()=>dialog.remove();dialog.querySelector('#reminder-save').onclick=()=>saveReminders(dialog);
}
async function saveReminders(dialog){
 if(reminderBusy)return;const email=currentUserEmail,generation=sessionGeneration,active=()=>email===currentUserEmail&&generation===sessionGeneration;
 const prefs={};for(const key of ['enabled','packing','habits','overdue','includeChildren'])prefs[key]=!!dialog.querySelector('#reminder-'+key)?.checked;for(const key of ['hour','quietStart','quietEnd'])prefs[key]=Number(dialog.querySelector('#reminder-'+key).value);
 reminderBusy=true;dialog.querySelector('#reminder-save').disabled=true;
 try{if(prefs.enabled&&(prefs.quietStart!==prefs.quietEnd&&(prefs.quietStart<prefs.quietEnd?prefs.hour>=prefs.quietStart&&prefs.hour<prefs.quietEnd:prefs.hour>=prefs.quietStart||prefs.hour<prefs.quietEnd)))throw new Error('Choose a reminder time outside your quiet hours.');let token='';if(prefs.enabled){if(typeof Notification==='undefined')throw new Error('This browser does not support reminders.');if(await Notification.requestPermission()!=='granted')throw new Error('Allow notifications in your browser settings to enable reminders.');if(!active())return;token=await reminderToken();if(!token)throw new Error('Could not register this device. Try again.');}
 if(!active())return;const result=(await firebase.functions().httpsCallable('updateReminderSettings')({device_id:reminderDevice(),token,settings:prefs})).data;if(!active())return;
 reminderPreferences=result.settings;reminderAccount(prefs.enabled?email:null);document.getElementById('notifBell')?.classList.toggle('on',prefs.enabled);dialog.remove();toast(prefs.enabled&&!result.bridgeReady?'Saved. Ask a parent to enable reminders to connect the family plan.':'Reminder settings saved.');
 }catch(err){if(active())dialog.querySelector('#reminder-error').textContent=err.message||'Could not save reminders.';}finally{if(active()){reminderBusy=false;dialog.querySelector('#reminder-save').disabled=false;}}
}
