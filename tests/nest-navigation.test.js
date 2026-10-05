'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture(adult = true) {
  function element(id) {
    const classes=new Set(), attrs={};
    return {id,dataset:{},textContent:'',classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),toggle:(v,on)=>on?classes.add(v):classes.delete(v),contains:v=>classes.has(v)},setAttribute:(k,v)=>attrs[k]=v,removeAttribute:k=>delete attrs[k],getAttribute:k=>attrs[k]};
  }
  const ids=['home','tasks','calendar','expenses','budgets','recurring','us','fertility','memories','birthdays','travel','rewards','habits','more'];
  const pages=ids.map(id=>element('s-'+id)), nav=['home','calendar','tasks','rewards','more'].map(id=>{const e=element('nav-'+id);e.dataset.nestRoute=id;return e;});
  const elements=Object.fromEntries([...pages,...nav,...['fab','hav','hname','hdate','nest-current-page'].map(element)].map(e=>[e.id,e]));
  const renders=[],messages=[];
  const c=vm.createContext({window:{addEventListener(){}},document:{getElementById:id=>elements[id],querySelectorAll:q=>q==='.section'?pages:q.includes('nest-sidebar')?[]:nav},
    section:'home',user:adult?'Marcus':'Mikaela',MEMBERS:[{name:adult?'Marcus':'Mikaela',emoji:'avatar'}],isAdultUser:adult,timelineInterval:null,
    location:{hash:'',search:''},URLSearchParams,savePreference(){},startMemoriesListener(){},stopMemoriesListener(){},render:id=>renders.push(id),toast:m=>messages.push(m)});
  vm.runInContext(fs.readFileSync(require.resolve('../js/nest.js'),'utf8'),c);
  const source=require('./helpers/app-source.cjs').readAppSource();
  vm.runInContext(source.slice(source.indexOf('    const NAV_SECONDARY'),source.indexOf('    function onFab')),c);
  return {c,pages,nav,renders,messages};
}
test('every redesigned destination activates a real section',()=>{
  const h=fixture();
  for(const page of h.pages){const id=page.id.slice(2);h.c.goTo(id);assert.equal(h.pages.filter(p=>p.classList.contains('active')).length,1);assert.ok(page.classList.contains('active'));assert.equal(h.renders.at(-1),id);}
});
test('Nest is selected directly and additional destinations select More on mobile',()=>{
  const h=fixture();h.c.goTo('rewards');assert.equal(h.nav.find(n=>n.getAttribute('aria-current')==='page').dataset.nestRoute,'rewards');
  h.c.goTo('habits');assert.equal(h.nav.find(n=>n.getAttribute('aria-current')==='page').dataset.nestRoute,'more');
});
test('new navigation retains parent gates, including direct links',()=>{
  const h=fixture(false);
  for(const id of ['expenses','budgets','recurring','us','fertility']){h.c.goTo(id);assert.equal(h.c.section,'home');assert.ok(h.pages.find(p=>p.id==='s-home').classList.contains('active'));}
  assert.equal(h.messages.length,5);h.c.goTo('rewards');assert.equal(h.c.section,'rewards');
});
test('secondary screens support notification and hash deep links',()=>{
  const h=fixture();for(const id of ['habits','memories','rewards','more','budgets','travel']){h.c.location.hash='#'+id;assert.equal(h.c.screenFromLocation(),id);}
  h.c.location.search='?open=calendar';assert.equal(h.c.screenFromLocation(),'calendar');
});

test('unknown notification destinations return home instead of a blank screen',()=>{
  const h=fixture();h.c.goTo('missing');assert.equal(h.c.section,'home');assert.equal(h.renders.at(-1),'home');
});

test('children have Habits in primary navigation instead of Plan',()=>{
  const h=fixture(false); h.c.goTo('habits');
  const button=h.nav.find(n=>n.id==='nav-calendar');
  assert.equal(button.dataset.nestRoute,'habits');
  assert.equal(button.getAttribute('aria-current'),'page');
  assert.equal(h.nav.find(n=>n.id==='nav-more').getAttribute('aria-current'),undefined);
});
test('child data excludes siblings and parents while retaining shared items',()=>{
  const h=fixture(false); h.c.data={todos:[{assignee:'Mikaela'},{assignee:'Meaghan'},{assignee:'Everyone'}],schoolTasks:[{assignee:'Marcus'}],events:[{tags:['Meaghan']},{tags:['Mikaela']},{tags:['Family']},{tags:[]}],habits:[{member:'Mikaela'},{member:'Meaghan'},{member:'Everyone'}],habitLogs:[{member:'Mikaela'},{member:'Meaghan'}]};
  h.c.nestFilterChildData();
  assert.equal(h.c.data.todos.length,2);assert.equal(h.c.data.schoolTasks.length,0);assert.equal(h.c.data.events.length,2);assert.equal(h.c.data.habits.length,2);assert.equal(h.c.data.habitLogs.length,1);
});
