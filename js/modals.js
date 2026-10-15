/* One dismissal path preserves keyboard focus and dialog semantics. */
const modalOrigins=new Map();
function modalOpened(id){
 const overlay=document.getElementById(id),modal=overlay?.querySelector('.modal')||(id==='menu-drawer'?overlay:null);if(!modal)return;
 modalOrigins.set(id,document.activeElement);modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('tabindex','-1');
 const title=modal.querySelector('.modal-title');if(title){title.id=title.id||id+'-title';modal.setAttribute('aria-labelledby',title.id);}
 overlay.classList.add('open');(modal.querySelector('input:not([type=hidden]):not([disabled]),textarea:not([disabled]),select:not([disabled]),button:not([disabled])')||modal).focus();
}
function closeM(id){const overlay=document.getElementById(id);if(!overlay)return;overlay.classList.remove('open');if(id==='menu-drawer')document.getElementById('drawer-overlay')?.classList.remove('open');const origin=modalOrigins.get(id);modalOrigins.delete(id);if(origin?.isConnected&&!origin.closest('#login-screen:not(.active)'))origin.focus();}
function initModalAccess(){
 document.querySelectorAll('.overlay').forEach(o=>o.addEventListener('click',event=>{if(event.target===o)closeM(o.id);}));
 document.querySelectorAll('.drawer-item').forEach(item=>{item.setAttribute('role','button');item.tabIndex=0;item.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();item.click();}});});
 document.addEventListener('keydown',event=>{const overlay=[...document.querySelectorAll('.overlay.open,.drawer.open')].at(-1);if(!overlay)return;
 if(event.key==='Escape'){event.preventDefault();closeM(overlay.id);return;}
 if(event.key!=='Tab')return;const modal=overlay.querySelector('.modal')||(overlay.id==='menu-drawer'?overlay:null);if(!modal)return;const controls=[...modal.querySelectorAll('a[href],button,input:not([type=hidden]),textarea,select,[tabindex]')].filter(el=>!el.disabled&&el.tabIndex>=0&&el.getClientRects().length);
 if(!controls.length){event.preventDefault();modal.focus();return;}const first=controls[0],last=controls.at(-1);if(event.shiftKey&&(document.activeElement===first||document.activeElement===modal)){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 });
}
