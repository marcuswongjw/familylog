/* Wong’s Nest: shared presentation only. Existing services own family data. */
const NEST_PAGES = {
  home: ['Our nest', 'A little less juggling. A little more together.'],
  tasks: ['Little things, done', 'Make space for the things that matter.'],
  calendar: ['The family plan', 'School days, adventures and everything in between.'],
  rewards: ['Companions & stars', 'Small steps. A nest we grow together.'],
  habits: ['Everyday rhythms', 'Practice, prepare, and find your own rhythm.'],
  memories: ['The good stuff', 'Ordinary days worth keeping.'],
  expenses: ['Household money', 'A clear picture of what comes in and goes out.'],
  budgets: ['Room in the budget', 'Plan for the everyday and the unexpected.'],
  recurring: ['On repeat', 'The household costs that come around again.'],
  birthdays: ['Days to celebrate', 'Keep your favourite people close.'],
  travel: ['Places we’ve been', 'Little outings. Big adventures. Our family story.'],
  us: ['Just the two of us', 'A private corner for Marcus and Eleanor.'],
  fertility: ['Cycle & wellbeing', 'Personal notes, held with care.'],
  more: ['Around the nest', 'All the little corners of family life.']
};
function nestIcon(name) {
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
    tasks: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="m8 9 1.5 1.5L12 8m2 1h2m-8 6h8"/>',
    rewards: '<path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.6l6.3-.9Z"/>',
    habits: '<path d="M12 21V10M12 15C4 15 3 10 3 6c6 0 9 3 9 9ZM12 11c0-6 4-8 9-8 0 6-3 8-9 8Z"/>',
    memories: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
    expenses: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 10h18m-6 5h3"/>',
    budgets: '<path d="M5 20V10m7 10V4m7 16v-7"/>',
    recurring: '<path d="M20 7a9 9 0 0 0-15-2L2 8m0-5v5h5M4 17a9 9 0 0 0 15 2l3-3m0 5v-5h-5"/>',
    birthdays: '<path d="M4 21v-9h16v9M4 16h16M8 12V8m4 4V8m4 4V8M7 5l1-2 1 2m2 0 1-2 1 2m2 0 1-2 1 2"/>',
    travel: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16"/>',
    us: '<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-4 4 2 10 8 15 6-5 12-11 8-15Z"/>',
    fertility: '<path d="M12 3c4 5 7 8 7 12a7 7 0 0 1-14 0c0-4 3-7 7-12Z"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    bell: '<path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9m3 12h6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.home}</svg>`;
}
function initNest() {
  const rail = document.getElementById('nest-sidebar');
  const groups = [
    ['DAY TO DAY', [['home','Our nest'],['calendar','Family plan'],['tasks','Tasks'],['habits','Habits'],['rewards','Companions']]],
    ['MAKE MEMORIES', [['memories','Memories'],['birthdays','Celebrations'],['travel','Adventures']]],
    ['PARENTS’ CORNER', [['expenses','Expenses'],['budgets','Budgets'],['recurring','Recurring costs'],['us','Just us'],['fertility','Wellbeing']], true]
  ];
  rail.innerHTML = `<button class="nest-brand" onclick="goTo('home')" aria-label="Wong’s Nest home"><img src="assets/nest-mark.svg" alt=""><span>Wong’s Nest<small>Our family, together.</small></span></button>
    <nav aria-label="Main navigation">${groups.map(([label,items,adult])=>`<div class="nest-nav-group ${adult?'adult-only':''}"><p>${label}</p>${items.map(([id,title])=>`<button data-nest-route="${id}" onclick="goTo('${id}')">${nestIcon(id)}<span>${title}</span></button>`).join('')}</div>`).join('')}</nav>
    <div class="nest-rail-note"><span class="nest-sprig">${nestIcon('habits')}</span><p>A place for our plans.<br>A little room to grow.</p></div>`;
  Object.entries(NEST_PAGES).forEach(([id,[title,description]])=>{
    const page = document.getElementById('s-'+id);
    if (!page || ['home','rewards','habits'].includes(id)) return;
    const heading = document.createElement('header'); heading.className='nest-page-heading';
    heading.innerHTML=`<span class="nest-kicker">${['us','fertility','expenses','budgets','recurring'].includes(id)?'PARENTS’ CORNER':'FAMILY LIFE'}</span><h1>${title}</h1><p>${description}</p>`;
    page.prepend(heading);
  });
  document.querySelectorAll('.drawer-item').forEach(item=>{
    item.setAttribute('role','button'); item.tabIndex=0;
    item.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();item.click();}});
  });
  document.getElementById('menu-btn').innerHTML=nestIcon('menu');
  const bell=document.getElementById('notifBell');
  bell.insertAdjacentHTML('afterbegin',nestIcon('bell'));
  document.querySelectorAll('.nav-it[data-nest-route]').forEach(b=>b.innerHTML=nestIcon(b.dataset.nestRoute)+`<span>${b.dataset.label}</span>`);
  updateNestShell();
}
function updateNestShell() {
  const planButton = document.getElementById('nav-calendar');
  if (planButton) {
    const route = isAdultUser ? 'calendar' : 'habits';
    planButton.dataset.nestRoute = route;
    planButton.dataset.label = isAdultUser ? 'Plan' : 'Habits';
    planButton.onclick = () => goTo(route);
    planButton.innerHTML = nestIcon(route) + `<span>${planButton.dataset.label}</span>`;
  }
  document.querySelectorAll('#nest-sidebar [data-nest-route="calendar"]').forEach(button => { button.hidden = !isAdultUser; });
  const primary = isAdultUser ? ['home','calendar','tasks','rewards'] : ['home','habits','tasks','rewards'];

  document.querySelectorAll('[data-nest-route]').forEach(button=>{
    const selected=button.dataset.nestRoute===section || (button.dataset.nestRoute==='more' && !primary.includes(section));
    button.classList.toggle('act',selected);
    if(selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  });
  const m = MEMBERS.find(m=>m.name===user);
  if(m){document.getElementById('hav').textContent=m.emoji;document.getElementById('hname').textContent=user;document.getElementById('hdate').textContent=isAdultUser?'Parent':'Little nest member';}
  const crumb=document.getElementById('nest-current-page');
  if(crumb)crumb.textContent=NEST_PAGES[section]?.[0] || 'Our nest';
}
function updateNestThemeIcon() {
  const dark=document.body.classList.contains('dark-mode');
  const toggle=document.getElementById('darkToggle');
  toggle.innerHTML=nestIcon(dark?'sun':'moon');
  toggle.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');
  document.querySelector('meta[name="theme-color"]').content=dark?'#25212E':'#F8F6F2';
}
window.addEventListener('DOMContentLoaded',initNest);

function nestVisibleHabits() {
  return (data.habits || []).filter(h => isAdultUser || h.member === user || h.member === 'Everyone');
}
function nestFilterChildData() {
  if (isAdultUser) return;
  const related = t => t.assignee === user || t.assignee === 'Everyone';
  data.todos = (data.todos || []).filter(related);
  data.schoolTasks = (data.schoolTasks || []).filter(related);
  data.events = (data.events || []).filter(e => (e.tags || []).some(tag => [user,'Everyone','Family'].includes(tag)));
  data.habits = nestVisibleHabits();
  data.habitLogs = (data.habitLogs || []).filter(l => l.member === user);
}
