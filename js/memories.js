/* Keep an upload until metadata is confirmed, and page older memories on demand. */
let memoryDraft=null;
let memoryLatest=new Map(),memoryOlder=new Map(),memoryCursor=null,memoryHasMore=false,memoryLoadingOlder=false;
const MEMORY_PAGE_SIZE=50;
async function saveMemoryDraft(input,active) {
  if(!memoryDraft)memoryDraft={id:crypto.randomUUID(),imagePath:'',imageUrl:''};
  const draft=memoryDraft;
  const ref=db.collection('memories').doc(draft.id);
  const payload={loggedBy:input.member,loggedByEmail:input.email,date:input.date,type:input.type,person:input.person,memory:input.text};
  const existing=await ref.get({source:'server'});if(!active())return;
  if(existing.exists){
    const old=existing.data();
    if(Object.keys(payload).some(k=>old[k]!==payload[k]))throw new Error('This memory was already saved before the response was lost. Check Memories before starting another.');
    return;
  }
  if(input.image){
    if(!draft.imagePath)draft.imagePath=`memories/${input.email}/${draft.id}.jpg`;
    const file=storage.ref(draft.imagePath);
    let uploaded=false;try{await file.getMetadata();uploaded=true;}catch(err){if(err.code!=='storage/object-not-found')throw err;}
    if(!active())return;
    if(!uploaded)await file.put(dataURItoBlob(input.image),{contentType:'image/jpeg'});
    if(!active())return;
    await file.updateMetadata({customMetadata:{lastDraftAttempt:String(Date.now())}});
    if(!active())return;
    draft.imageUrl=await file.getDownloadURL();
  }
  if(!active())return;
  await ref.set({...payload,imageUrl:draft.imageUrl||'',imagePath:draft.imagePath||'',timestamp:firebase.firestore.FieldValue.serverTimestamp()});
}
function discardMemoryUpload() {
  const draft=memoryDraft;if(!draft?.imagePath)return;
  memoryDraft=null;
  // Never delete a photo after an uncertain metadata result without checking the server.
  db.collection('memories').doc(draft.id).get({source:'server'}).then(doc=>{
    if(!doc.exists)return storage.ref(draft.imagePath).delete();
  }).catch(()=>{}); // Server cleanup handles abandoned uploads after 48 hours.
}
function resetMemorySession(){const body=typeof document!=='undefined'?document.querySelector('#m-memory .modal-body'):null;if(body)body.inert=false;memoryDraft=null;memoryLatest.clear();memoryOlder.clear();memoryCursor=null;memoryHasMore=false;memoryLoadingOlder=false;}
function memoryFromDoc(doc){
  const d=doc.data();return {id:doc.id,loggedBy:d.loggedBy||'Unknown',date:d.date?fmtDate(d.date):'',dateRaw:d.date||'',type:d.type||'Moment',person:d.person||'Everyone',memory:d.memory||'',imageUrl:d.imageUrl||'',timestamp:d.timestamp?.toDate?.()||new Date(0)};
}
function mergeMemoryPages(){
  const map=new Map([...memoryOlder,...memoryLatest]);
  data.memories=[...map.values()].sort((a,b)=>b.timestamp-a.timestamp||b.id.localeCompare(a.id));
  if(section==='memories')renderMemories();
}
function startMemoriesListener(){
  if(memoriesUnsubscribe||!db)return;
  const account=currentUserEmail,generation=sessionGeneration;
  memoriesUnsubscribe=db.collection('memories').orderBy('timestamp','desc').limit(MEMORY_PAGE_SIZE).onSnapshot(snapshot=>{
    if(account!==currentUserEmail||generation!==sessionGeneration)return;
    memoryLatest=new Map(snapshot.docs.map(doc=>[doc.id,memoryFromDoc(doc)]));
    if(!memoryOlder.size&&!memoryLoadingOlder){memoryCursor=snapshot.docs.at(-1)||null;memoryHasMore=snapshot.docs.length===MEMORY_PAGE_SIZE;}
    mergeMemoryPages();
  },()=>{if(account===currentUserEmail&&generation===sessionGeneration)showError('Could not load memories.');});
}
function stopMemoriesListener(){if(memoriesUnsubscribe){memoriesUnsubscribe();memoriesUnsubscribe=null;}}
async function loadOlderMemories(){
  if(memoryLoadingOlder||!memoryHasMore||!memoryCursor)return;
  const account=currentUserEmail,generation=sessionGeneration;memoryLoadingOlder=true;renderMemories();
  try{
    const page=await db.collection('memories').orderBy('timestamp','desc').startAfter(memoryCursor).limit(MEMORY_PAGE_SIZE).get({source:'server'});
    if(account!==currentUserEmail||generation!==sessionGeneration)return;
    page.docs.forEach(doc=>memoryOlder.set(doc.id,memoryFromDoc(doc)));memoryCursor=page.docs.at(-1)||memoryCursor;memoryHasMore=page.docs.length===MEMORY_PAGE_SIZE;mergeMemoryPages();
  }catch(_){if(account===currentUserEmail&&generation===sessionGeneration)showError('Could not load older memories. Try again when connected.');}
  finally{if(account===currentUserEmail&&generation===sessionGeneration){memoryLoadingOlder=false;renderMemories();}}
}

    // ─── MEMORIES ──────────────────────────────────────────────
    function renderMemories() {
      const mems = data.memories || [];
      const el   = document.getElementById('mem-list');
      if (!mems.length) { el.innerHTML = '<div class="empty"><div class="ei">💛</div>What would you like to remember about today?</div>'; return; }

      const getIcon = t => t.includes('Milestone') ? '🏆' : t.includes('Quote') ? '💬' : '💛';

      el.innerHTML = `
        <div style="padding:16px;display:flex;flex-direction:column;gap:12px;">
          ${mems.map(m => {
            const icon = getIcon(m.type);
            const isQuote = m.type.includes('Quote');

            let contentHtml = '';
            if (isQuote) {
              contentHtml = `
                <blockquote style="font-size:15px;font-style:italic;font-family:Georgia,serif;color:var(--primary);line-height:1.5;margin:8px 0;padding-left:14px;border-left:3px solid var(--primary);">
                  “${escapeHtml(m.memory)}”
                </blockquote>
              `;
            } else if (m.memory) {
              contentHtml = `<div class="mem-text" style="font-size:14px;color:#1a1a2e;line-height:1.5;margin:8px 0;">${escapeHtml(m.memory)}</div>`;
            }

            const imageHtml = mediaImgHtml(m.imageUrl, 'max-width:100%;max-height:220px;object-fit:cover;border-radius:8px;margin:8px 0;cursor:pointer;display:block;box-shadow:0 1px 3px rgba(0,0,0,0.05);');

            return `
              <div class="card" style="padding:16px;box-shadow:0 2px 8px rgba(0,0,0,0.03);border:1.5px solid #e4e6ef;background:var(--bg-card);border-radius:12px;margin-bottom:0;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                  <span class="badge ${getMemberBadgeClass(m.person)}" style="font-size:11px;">${escapeHtml(m.person)}</span>
                  <span style="font-size:11px;font-weight:700;color:#a85f89;text-transform:uppercase;letter-spacing:0.5px;">${icon} ${escapeHtml(m.type)}</span>
                </div>
                ${contentHtml}
                ${imageHtml}
                <div style="font-size:11px;color:var(--text-muted);margin-top:8px;border-top:1px solid #f1f5f9;padding-top:8px;display:flex;justify-content:space-between;">
                  <span>📅 ${escapeHtml(m.date)}</span>
                  <span>Logged by <strong>${escapeHtml(m.loggedBy)}</strong></span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
      if (memoryHasMore) {
        const button=document.createElement('button');button.className='btn btn-s memory-load-more';button.textContent=memoryLoadingOlder?'Loading…':'Load older memories';button.disabled=memoryLoadingOlder;button.onclick=loadOlderMemories;el.appendChild(button);
      }
    }
