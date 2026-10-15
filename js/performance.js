/* Bounded, session-local timing samples. No payloads, identities, paths or URLs. */
const NEST_PERF_ENDPOINTS=['get_all','get_family_dashboard','get_completed_tasks','get_family_core','get_family_calendar','get_parent_dashboard','get_events','get_todos','get_birthdays','get_rewards','write','reminder_snapshot','prepare_family_tasks','verify_reminder_snapshot','startup','core_ready','calendar_ready','memories_ready','memories_page','other'];
const NEST_PERF_STAGES=['token','network','server','parse','render','load','dom_ready','sdk_load','auth','family_forward','core','parent_dashboard','calendar_read','calendar_preparation','lock_wait','todos','habits','habit_logs','rewards','school_plans','school_health','activity','expenses','budgets','recurring','private_records'];
const NEST_PERF_COUNTS=['sheet_reads','rows_scanned','calendar_pages','calendar_events','errors','resources','transfer_bytes'];
let nestPerformanceSamples=[];
function nestPerfNow(){return typeof performance!=='undefined'?performance.now():Date.now();}
function cleanNestSample(input,source){
 if(!input||!Number.isFinite(input.totalMs)||input.totalMs<0)return null;
 const clean={schema:1,source:source==='server'?'server':'browser',service:['family','parents'].includes(input.service)?input.service:'browser',endpoint:NEST_PERF_ENDPOINTS.includes(input.endpoint)?input.endpoint:'other',totalMs:Math.round(input.totalMs),stages:{},counts:{}};
 for(const name of NEST_PERF_STAGES){const s=input.stages?.[name];if(s&&Number.isFinite(s.ms)&&s.ms>=0&&Number.isFinite(s.calls)&&s.calls>=0){clean.stages[name]={ms:Math.round(s.ms),calls:Math.round(s.calls)};for(const key of ['sheetReads','rowsScanned'])if(Number.isFinite(s[key])&&s[key]>=0)clean.stages[name][key]=Math.round(s[key]);}}
 for(const name of NEST_PERF_COUNTS){const n=input.counts?.[name];if(Number.isFinite(n)&&n>=0)clean.counts[name]=Math.round(n);}
 return clean;
}
function recordNestPerformance(input,source='browser'){const sample=cleanNestSample(input,source);if(sample){nestPerformanceSamples.push(sample);nestPerformanceSamples=nestPerformanceSamples.slice(-200);}}
function startNestTiming(endpoint,phase='token'){const now=nestPerfNow();return {endpoint,phase,start:now,last:now,stages:{}};}
function advanceNestTiming(t,phase){if(!t)return;const now=nestPerfNow(),stage=t.stages[t.phase]||{ms:0,calls:0};stage.ms+=Math.max(0,now-t.last);stage.calls++;t.stages[t.phase]=stage;t.last=now;t.phase=phase;}
function finishNestTiming(t,success=true){if(!t)return;advanceNestTiming(t,t.phase);recordNestPerformance({endpoint:t.endpoint,totalMs:Math.max(0,nestPerfNow()-t.start),stages:t.stages,counts:{errors:success?0:1}});}
function resetNestPerformance(){nestPerformanceSamples=[];}
function nestPercentile(values,p){const a=values.slice().sort((x,y)=>x-y);return a.length?a[Math.max(0,Math.ceil(a.length*p)-1)]:null;}
function nestPerformanceSummary(samples=nestPerformanceSamples){
 const groups=new Map();for(const row of samples){const key=row.source+':'+row.service+':'+row.endpoint;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 return [...groups].map(([key,rows])=>{
  const ok=rows.filter(r=>!r.counts.errors),times=ok.map(r=>r.totalMs),stages=[];
  for(const name of NEST_PERF_STAGES){const values=ok.map(r=>r.stages[name]).filter(Boolean);if(values.length)stages.push({name,samples:values.length,p50Ms:nestPercentile(values.map(s=>s.ms),.5),p95Ms:nestPercentile(values.map(s=>s.ms),.95),p50RowsScanned:nestPercentile(values.map(s=>s.rowsScanned).filter(Number.isFinite),.5)});}
  const counts={};for(const name of NEST_PERF_COUNTS){const values=ok.map(r=>r.counts[name]).filter(Number.isFinite);if(values.length)counts[name]={p50:nestPercentile(values,.5),p95:nestPercentile(values,.95)};}
  return {key,samples:ok.length,failures:rows.length-ok.length,p50Ms:nestPercentile(times,.5),p95Ms:nestPercentile(times,.95),stages,counts};
 });
}
function captureNestStartup(){
 if(typeof performance==='undefined'||!performance.getEntriesByType||nestPerformanceSamples.some(s=>s.endpoint==='startup'))return;
 const nav=performance.getEntriesByType('navigation')[0];if(!nav?.loadEventEnd)return;
 const resources=performance.getEntriesByType('resource').filter(r=>{try{return new URL(r.name).origin===location.origin;}catch(_){return false;}});
 const sdk=resources.filter(r=>/\/assets\/firebase-(app|auth|firestore|storage|functions|messaging)-compat-9[.]23[.]0[.]js(?:[?]|$)/.test(r.name));
 recordNestPerformance({endpoint:'startup',totalMs:nav.loadEventEnd,stages:{dom_ready:{ms:nav.domContentLoadedEventEnd,calls:1},sdk_load:{ms:sdk.length?Math.max(...sdk.map(r=>r.responseEnd))-Math.min(...sdk.map(r=>r.startTime)):0,calls:sdk.length}},counts:{resources:resources.length,transfer_bytes:resources.reduce((n,r)=>n+(r.transferSize||0),0)}});
}
function exportNestPerformance(){captureNestStartup();return {schema:1,samples:nestPerformanceSamples.map(r=>cleanNestSample(r,r.source)),summary:nestPerformanceSummary()};}
function showLoadingCheck(){
 if(!isAdultUser)return;const summary=exportNestPerformance().summary,labels={get_family_core:'Family overview',get_family_calendar:'Calendar',get_parent_dashboard:'Parents’ overview',write:'Saving',core_ready:'Overview ready on screen',calendar_ready:'Calendar ready on screen',memories_ready:'Photos ready',memories_page:'Older photos',startup:'App shell startup'};
 const body=document.getElementById('loading-check-body');body.replaceChildren();
 const info=document.createElement('p');info.textContent='This tab only. Median and slower (95th percentile) times use successful requests; failures are counted separately. Small samples are only an initial guide.';body.appendChild(info);
 const table=document.createElement('table');table.style.cssText='width:100%;font-size:13px';const header=table.createTHead().insertRow();const tbody=table.createTBody();for(const text of ['Stage','Samples','Median','Slower','Failed']){const cell=document.createElement('th');cell.textContent=text;header.appendChild(cell);}
 for(const r of summary){const row=tbody.insertRow(),parts=r.key.split(':');for(const value of [(parts[0]==='server'?'Server: ':'')+(labels[parts[2]]||'Other request'),r.samples,r.p50Ms==null?'—':r.p50Ms+' ms',r.p95Ms==null?'—':r.p95Ms+' ms',r.failures])row.insertCell().textContent=value;}
 body.appendChild(table);
 const stageLabels={token:'Session check',network:'Server round trip',server:'Server processing',parse:'Reading response',render:'Screen update',load:'Waiting for data',dom_ready:'Page ready',sdk_load:'Firebase files',auth:'Account check',family_forward:'Family connection',core:'Family overview total',parent_dashboard:'Parents’ overview total',calendar_read:'Reading calendar',calendar_preparation:'Preparation tasks',lock_wait:'Waiting to update',todos:'Tasks',habits:'Habits',habit_logs:'Habit history',rewards:'Companions and stars',school_plans:'School notices',school_health:'Notice checks',activity:'Recent activity',expenses:'Expenses',budgets:'Budgets',recurring:'Recurring costs',private_records:'Private records'};
 for(const r of summary){
  const detail=document.createElement('details'),title=document.createElement('summary');title.textContent=(r.key.startsWith('server:')?'Server breakdown: ':'Browser breakdown: ')+(labels[r.key.split(':')[2]]||'Other request');detail.appendChild(title);
  const stages=document.createElement('table');stages.style.cssText='width:100%;font-size:12px';
  for(const s of r.stages){const row=stages.insertRow();for(const value of [stageLabels[s.name]||'Other step',s.p50Ms+' ms median',s.p95Ms+' ms slower',s.p50RowsScanned==null?'':s.p50RowsScanned+' rows scanned'])row.insertCell().textContent=value;}
  detail.appendChild(stages);const note=document.createElement('p');note.textContent='Nested stages overlap; do not add them together. Rows scanned include repeat reads and headers.';detail.appendChild(note);body.appendChild(detail);
 }
 if(!summary.length){const p=document.createElement('p');p.textContent='Refresh the app to collect a loading sample.';body.appendChild(p);}
 if(!document.getElementById('m-loading-check').classList.contains('open'))modalOpened('m-loading-check');
}
async function measureLoadingRefresh(){
 if(!isAdultUser)return;const account=currentUserEmail,session=sessionGeneration,button=document.getElementById('loading-check-refresh');button.disabled=true;
 try{await loadData();if(account===currentUserEmail&&session===sessionGeneration&&document.getElementById('m-loading-check').classList.contains('open'))showLoadingCheck();}finally{button.disabled=false;}
}
function downloadLoadingCheck(){if(!isAdultUser)return;const url=URL.createObjectURL(new Blob([JSON.stringify(exportNestPerformance(),null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='loading-check.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
if(typeof module!=='undefined')module.exports={cleanNestSample,nestPerformanceSummary,nestPercentile};
