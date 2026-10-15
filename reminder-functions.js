'use strict';
const crypto=require('crypto');
const {FAMILY,PARENTS,settings,plan,singaporeClock,quiet}=require('./reminder-plan');
const GAS_URL=require('./scripts/project-config.cjs').serviceConfig('parents').url;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
module.exports=({functions,admin,db,storage,STORAGE_BUCKET,APP_URL})=>{
 const guarded=functions.runWith({secrets:['REMINDER_BRIDGE_SECRET'],timeoutSeconds:120,memory:'256MB',maxInstances:1});
 const updateReminderSettings=guarded.https.onCall(async(data,context)=>{
  const email=String(context.auth?.token?.email||'').toLowerCase();if(!FAMILY[email])throw new functions.https.HttpsError('permission-denied','Family members only.');
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(data?.device_id||''))throw new functions.https.HttpsError('invalid-argument','Device identity is missing. Reload and try again.');
  const token=typeof data.token==='string'?data.token:'';if(token.length>4096)throw new functions.https.HttpsError('invalid-argument','Invalid device token.');
  const ref=db.collection('users').doc(email),old=(await ref.get()).data()||{};let prefs;
  try{prefs=settings(data.settings||old.reminderSettings||{},PARENTS.includes(email));}catch(err){throw new functions.https.HttpsError('invalid-argument',err.message);}
  const bridge=db.collection('reminderBridge').doc('status');let ready=(await bridge.get()).data()?.ready===true;
  if(data.settings?.enabled&&PARENTS.includes(email)){
   const idToken=String(context.rawRequest.headers.authorization||'').replace(/^Bearer /i,'');
   const result=await fetch(GAS_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'write',note:'configure_reminder_bridge',idToken,bridge_secret:process.env.REMINDER_BRIDGE_SECRET}),signal:AbortSignal.timeout(35000)});
   const r=await result.json();if(r.status!=='ok')throw new functions.https.HttpsError('failed-precondition','Could not connect reminders to the family plan. Try again.');
   await bridge.set({ready:true,updatedAt:admin.firestore.FieldValue.serverTimestamp()});ready=true;
  }
  const batch=db.batch();
  // One browser token belongs to one current account, even after local storage resets.
  if(token){const matches=await db.collection('notificationDevices').where('tokenHash','==',hash(token)).get();matches.forEach(doc=>{if(doc.id!==hash(data.device_id))batch.delete(doc.ref);});}
  batch.set(db.collection('notificationDevices').doc(hash(data.device_id)),{email,uid:context.auth.uid,token,tokenHash:token?hash(token):'',updatedAt:admin.firestore.FieldValue.serverTimestamp()});
  if(data.settings)batch.set(ref,{email,name:FAMILY[email],reminderSettings:prefs},{merge:true});
  await batch.commit();return {settings:prefs,bridgeReady:ready};
 });
 const sendFamilyReminders=guarded.pubsub.schedule('every 15 minutes').timeZone('Asia/Singapore').onRun(async()=>{
  if(!(await db.collection('reminderBridge').doc('status').get()).data()?.ready)return null;
  const now=new Date(),clock=singaporeClock(now),profiles={};
  for(const email of Object.keys(FAMILY)){const raw=(await db.collection('users').doc(email).get()).data()?.reminderSettings||{};const prefs=settings(raw,PARENTS.includes(email));if(prefs.enabled&&prefs.hour===clock.hour&&!quiet(clock.hour,prefs.quietStart,prefs.quietEnd))profiles[email]=prefs;}
  if(!Object.keys(profiles).length)return null;
  const timestamp=Date.now(),signature=crypto.createHmac('sha256',process.env.REMINDER_BRIDGE_SECRET).update('reminder_snapshot|'+timestamp).digest('hex');
  let preparationReady=false;
  try {
   const preparation=await fetch(GAS_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'prepare_family_tasks',timestamp,signature}),signal:AbortSignal.timeout(15000)});
   preparationReady=preparation.ok!==false&&(await preparation.json()).status==='ok';
  } catch (_) { /* Existing habits and tasks remain independently available. */ }
  if(!preparationReady)console.warn('Calendar preparation unavailable; sending independent habit/task reminders.');
  const response=await fetch(GAS_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'reminder_snapshot',timestamp,signature}),signal:AbortSignal.timeout(35000)});
  const snapshot=await response.json();if(response.ok===false||snapshot.status!=='ok')throw new Error('Reminder snapshot unavailable.');
  if(!preparationReady)snapshot.todos=(snapshot.todos||[]).filter(t=>!String(t.sourceId||'').startsWith('cal_natb_'));
  const devices=await db.collection('notificationDevices').get();
  for(const email of Object.keys(profiles)){
   const reminder=plan(snapshot,email,profiles[email],now);if(!reminder)continue;
   const tokens=[...new Set(devices.docs.filter(d=>d.data().email===email).map(d=>d.data().token).filter(Boolean))].slice(0,100);if(!tokens.length)continue;
   // Respect earlier account receipts, then track new attempts per device token hash.
   if((await db.collection('ReminderDeliveries').doc(hash(reminder.id)).get()).data()?.state==='sent')continue;
   const attempts=[];
   for(const token of tokens){
    const ref=db.collection('ReminderDeliveries').doc(hash(reminder.id+'|'+hash(token))),lease=crypto.randomUUID();
    const claimed=await db.runTransaction(async tx=>{const old=(await tx.get(ref)).data();if(['sent','discarded'].includes(old?.state)||old?.at>Date.now()-300000)return false;tx.set(ref,{state:'sending',at:Date.now(),lease,expiresAt:admin.firestore.Timestamp.fromMillis(Date.now()+7*86400000)});return true;});
    if(claimed)attempts.push({token,ref,lease});
   }
   if(!attempts.length)continue;
   const finalize=(attempt,state)=>db.runTransaction(async tx=>{const old=(await tx.get(attempt.ref)).data();if(old?.lease!==attempt.lease||old?.state!=='sending')return;tx.set(attempt.ref,{...old,state,at:state==='retry'?0:Date.now()});});
   let result;
   try{
    result=await admin.messaging().sendEachForMulticast({tokens:attempts.map(a=>a.token),data:{recipient:email,reminderId:hash(reminder.id),title:reminder.title,body:reminder.body,screen:'home',url:APP_URL+'?open=home#home'},webpush:{headers:{TTL:'3600',Urgency:'normal'}}});
   }catch(err){await Promise.allSettled(attempts.map(a=>finalize(a,'retry')));throw err;}
   const dead=[];
   const receipts=await Promise.allSettled(attempts.map((attempt,i)=>{
    const response=result.responses[i],permanent=['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(response?.error?.code);
    if(permanent)dead.push(attempt.token);
    return finalize(attempt,response?.success?'sent':permanent?'discarded':'retry');
   }));
   if(dead.length){for(const device of devices.docs.filter(d=>dead.includes(d.data().token))){await db.runTransaction(async tx=>{const current=(await tx.get(device.ref)).data();if(current?.email===email&&dead.includes(current.token))tx.delete(device.ref);});}}
   if(receipts.some(r=>r.status==='rejected'))throw new Error('Reminder receipts were not fully confirmed.');
  }
  return null;
 });
 const cleanupAbandonedMemoryUploads=functions.runWith({timeoutSeconds:120,memory:'256MB',maxInstances:1}).pubsub.schedule('every day 03:00').timeZone('Asia/Singapore').onRun(async()=>{
  const [files]=await storage.bucket(STORAGE_BUCKET).getFiles({prefix:'memories/'});
  for(const file of files){const match=/^memories\/([^/]+)\/([a-f0-9-]{36})\.jpg$/.exec(file.name);if(!match||!FAMILY[match[1]])continue;
   const [meta]=await file.getMetadata();if(Date.now()-Date.parse(meta.updated||meta.timeCreated)<48*3600000)continue;
   const doc=await db.collection('memories').doc(match[2]).get();if(!doc.exists)await file.delete({ifGenerationMatch:Number(meta.generation),ifMetagenerationMatch:Number(meta.metageneration)});
  }
  // No private reminder content is retained. Expire the small operational receipts.
  const expired=await db.collection('ReminderDeliveries').where('expiresAt','<',admin.firestore.Timestamp.now()).limit(400).get();
  if(!expired.empty){const batch=db.batch();expired.forEach(doc=>batch.delete(doc.ref));await batch.commit();}
  return null;
 });
 return {updateReminderSettings,sendFamilyReminders,cleanupAbandonedMemoryUploads};
};
