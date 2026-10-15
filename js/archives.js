/* One archive page per dialog. Nothing is persisted or queued offline. */
let familyArchiveState=null,familyArchiveRevision=0;
function closeFamilyArchive(restore=true){
 const origin=familyArchiveState?.origin;familyArchiveRevision++;familyArchiveState=null;
 const dialog=document.getElementById('family-archive');if(dialog?.open)dialog.close();dialog?.remove();
 if(restore&&origin?.isConnected)origin.focus();
}
function openFamilyArchive(kind,habitId=''){
 if(kind==='school'&&!isAdultUser)return;
 closeFamilyArchive(false);
 const habit=(data.habits||[]).find(h=>h.id===habitId);
 familyArchiveState={kind,habitId,title:kind==='school'?'Saved announcements':(habit?.habit||'Habit')+' — history',member:isAdultUser?(typeof habitPerson!=='undefined'?habitPerson:'All'):user,origin:document.activeElement,items:[],nextCursor:null,cursors:[null],busy:false,error:''};
 const dialog=document.createElement('dialog');dialog.id='family-archive';dialog.setAttribute('aria-labelledby','family-archive-title');dialog.style.cssText='width:min(640px,calc(100vw - 32px));max-height:85vh;border:1px solid var(--border);border-radius:20px;padding:24px;background:var(--bg-card,#fff);color:var(--text)';
 dialog.addEventListener('cancel',e=>{e.preventDefault();closeFamilyArchive();});document.body.append(dialog);renderFamilyArchive();dialog.showModal();loadFamilyArchive();
}
function renderFamilyArchive(){
 const s=familyArchiveState,dialog=document.getElementById('family-archive');if(!s||!dialog)return;
 dialog.innerHTML=`<h2 id="family-archive-title">${escapeHtml(s.title)}</h2>${s.kind==='habits'&&isAdultUser?`<label>Person <select id="archive-person" ${s.busy?'disabled':''}>${['All','Marcus','Eleanor','Mikaela','Meaghan'].map(m=>`<option value="${m}" ${s.member===m?'selected':''}>${m==='All'?'Everyone':m}</option>`).join('')}</select></label>`:''}<div role="status">${s.busy?'Loading history…':`${s.items.length} records on this page`}</div><p role="alert">${escapeHtml(s.error)}</p><div aria-busy="${s.busy}">${s.items.map((item,i)=>s.kind==='school'?`<button type="button" class="school-inbox-item" data-archive-notice="${i}">${escapeHtml(item.title)} · ${escapeHtml(item.child)} <span>View source →</span></button>`:`<div style="padding:12px 0;border-bottom:1px solid var(--border)"><strong>${escapeHtml(item.member)} · ${escapeHtml(fmtDate(item.date))}</strong>${item.notes?`<p style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(item.notes)}</p>`:''}</div>`).join('')||(!s.busy&&!s.error?'<p>No records found.</p>':'')}</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px"><button class="btn btn-s" id="archive-newer" ${s.busy||s.cursors.length<2?'disabled':''}>Newer</button><button class="btn btn-s" id="archive-older" ${s.busy||!s.nextCursor?'disabled':''}>Older</button>${s.error?'<button class="btn btn-s" id="archive-retry">Retry</button>':''}<button class="btn btn-p" id="archive-close">Close</button></div>`;
 dialog.querySelector('#archive-close').onclick=()=>closeFamilyArchive();dialog.querySelector('#archive-newer').onclick=()=>loadFamilyArchive('newer');dialog.querySelector('#archive-older').onclick=()=>loadFamilyArchive('older');
 const person=dialog.querySelector('#archive-person');if(person)person.onchange=()=>{s.member=person.value;s.items=[];s.nextCursor=null;s.cursors=[null];loadFamilyArchive();};
 dialog.querySelector('#archive-retry')?.addEventListener('click',()=>loadFamilyArchive(s.retryDirection));
 dialog.querySelectorAll('[data-archive-notice]').forEach(button=>button.onclick=async()=>{const item=s.items[Number(button.dataset.archiveNotice)],origin=s.origin,account=currentUserEmail,generation=sessionGeneration;closeFamilyArchive(false);await openSchoolCapture(item.id,item);if(account===currentUserEmail&&generation===sessionGeneration)schoolReturnFocus=origin;});
}
async function loadFamilyArchive(direction='first'){
 const s=familyArchiveState;if(!s||s.busy)return;
 if(direction==='older'&&!s.nextCursor||direction==='newer'&&s.cursors.length<2)return;
 const cursors=direction==='older'?[...s.cursors,s.nextCursor]:direction==='newer'?s.cursors.slice(0,-1):[null];
 const revision=++familyArchiveRevision,account=currentUserEmail,generation=sessionGeneration,dashboard=dashboardGeneration;
 const active=()=>familyArchiveState===s&&revision===familyArchiveRevision&&account===currentUserEmail&&generation===sessionGeneration&&dashboard===dashboardGeneration;
 s.busy=true;s.error='';s.retryDirection=direction;renderFamilyArchive();document.querySelector('#archive-close')?.focus();
 try{
  const result=await gasRequest({action:'get_family_archive',kind:s.kind,habit_id:s.habitId,member:s.member,cursor:cursors.at(-1)});
  if(!active())return;
  if(!result||result.status!=='ok'||!Array.isArray(result.items))throw Error('Could not load history. Please retry.');
  s.items=result.items;s.nextCursor=result.nextCursor;s.cursors=cursors;
 }catch(_){if(active())s.error='Could not load history. Please retry.';}
 finally{
  if(familyArchiveState===s&&revision===familyArchiveRevision&&account===currentUserEmail&&generation===sessionGeneration){
   s.busy=false;if(dashboard!==dashboardGeneration)s.error='The family plan refreshed. Please retry to load current history.';renderFamilyArchive();document.querySelector('#archive-close')?.focus();
  }
 }
}
