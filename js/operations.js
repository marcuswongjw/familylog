/* Stable create IDs retain only a digest and UUID, scoped to the account. */
const pendingOperations=new Map();
const CREATE_ACTIONS = new Set(['add_todo','add_event','add_expense','add_trip','add_birthday']);
async function retrySafePayload(payload, account) {
  if (!CREATE_ACTIONS.has(String(payload.note||'').toLowerCase()) || payload.operation_id) return payload;
  const canonical=Object.keys(payload).sort().reduce((o,k)=>(o[k]=payload[k],o),{});
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical)));
  const hash=[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
  const key=`nest_operation_${account}_${hash}`;
  let id;
  try{id=localStorage.getItem(key);}catch(_){}
  id=id||pendingOperations.get(key)||crypto.randomUUID();
  pendingOperations.set(key,id);
  try{localStorage.setItem(key,id);}catch(_){}
  return {...payload,operation_id:id,_clientOperationKey:key};
}
function confirmOperation(payload) {
  pendingOperations.delete(payload._clientOperationKey);
  if(payload._clientOperationKey)try{localStorage.removeItem(payload._clientOperationKey);}catch(_){}
}
