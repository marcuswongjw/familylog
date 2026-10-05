function rewardGoalArt(family) {
  if (!family.goalId || family.goalId === 'garden') return rewardHomeSVG(family.unlocked);
  return `<div class="reward-goal-art ${family.unlocked?'unlocked':''}" role="img" aria-label="${escapeHtml(family.name)}${family.unlocked?' unlocked':''}"><span>${family.emoji}</span><small>${family.unlocked?'Made possible together':'A little dream, shared'}</small></div>`;
}
/* Companions, accessory collection and a cooperative family goal. */
const rewardPending = new Set();
const rewardChecking = new Set();
const rewardHabitDrafts = new Map();
let rewardCelebrationTimer;
let rewardLoadState = { loading:false, error:'' };
function setRewardLoadState(loading,error='') {
  rewardLoadState={loading,error};
  if(section==='rewards')renderRewards();
}
function rewardProfile() { return data.rewards?.members?.find(p => p.member === user); }
function rewardStars(type, id) { return data.rewards?.rules?.find(r => r.type === type && r.sourceId === id)?.stars || 0; }
function rewardBadge(type, id) {
  const stars = rewardStars(type, id);
  return stars ? `<span class="reward-star-badge" aria-label="${stars} stars on completion">★ ${stars}</span>` : '';
}
function renderRewardHome() {
  const root = document.getElementById('reward-home');
  const profile = rewardProfile();
  if (!root) return;
  if (!profile) { root.innerHTML = ''; return; }
  const family = data.rewards.family;
  const progress = Math.min(100, Math.round(family.earned / family.goal * 100));
  root.innerHTML = `<section class="reward-welcome" aria-label="Your companion and family home">
    <div class="reward-welcome-person"><button type="button" class="reward-hello" aria-label="Say hello to ${escapeHtml(profile.name)}">${rewardCompanionSVG(profile)}</button>
      <div><span class="reward-eyebrow">SMALL WINS, BIG HEART</span><h2>${escapeHtml(profile.name)} is cheering you on.</h2>
      <p>${isAdultUser ? 'A few little wins. A happier family nest.' : 'One small step at a time. You’ve got this.'}</p>
      <button class="btn btn-s btn-sm reward-open" type="button">★ ${profile.balance} stars · Visit companions</button></div></div>
    <div class="reward-home-preview">${rewardGoalArt(family)}<div class="reward-goal-caption"><strong>${family.unlocked ? 'We reached our goal!' : escapeHtml(family.name || 'Our family garden')}</strong><span>${family.unlocked ? 'Everyone helped make this happen.' : family.earned + ' / ' + family.goal + ' stars earned together'}</span></div>
      <div class="reward-progress" role="progressbar" aria-label="Family goal progress" aria-valuenow="${Math.min(family.goal, family.earned)}" aria-valuemin="0" aria-valuemax="${family.goal}"><span style="width:${progress}%"></span></div></div>
  </section>`;
  root.querySelector('.reward-open').addEventListener('click', () => goTo('rewards'));
  root.querySelector('.reward-hello').addEventListener('click', e => rewardAnimate(e.currentTarget));
}
function rewardAnimate(root) {
  root.classList.remove('reward-happy'); void root.offsetWidth;
  root.classList.add('reward-happy');
  root.addEventListener('animationend', () => root.classList.remove('reward-happy'), { once: true });
}
function applyRewardResult(result, celebrate = true) {
  if (result.rewards) data.rewards = result.rewards;
  renderRewardHome();
  if (section === 'rewards') renderRewards();
  if (celebrate && (result.log || result.award)) document.querySelectorAll('#reward-home .reward-hello, #rewards-container .reward-hero-art').forEach(rewardAnimate);
  if (!celebrate || !result.award?.stars) return;
  const { stars, member } = result.award;
  const message = `${member === user ? 'You earned' : member + ' earned'} ${stars} ${stars === 1 ? 'star' : 'stars'}! A little step for our family nest.`;
  const notice = document.getElementById('reward-celebration');
  notice.textContent = message; notice.hidden = false;
  clearTimeout(rewardCelebrationTimer);
  rewardCelebrationTimer = setTimeout(() => { notice.hidden = true; }, 4500);
}
function resetRewards() {
  rewardHabitDrafts.clear();
  rewardPending.clear();
  rewardChecking.clear();
  rewardLoadState={loading:false,error:''};
  clearTimeout(rewardCelebrationTimer);
  document.getElementById('reward-celebration').hidden = true;
  document.getElementById('reward-home').innerHTML = '';
  document.getElementById('rewards-container').innerHTML = '';
}
function habitRewardSaveMatches(payload,result){
  return result?.status==='ok'&&Array.isArray(result.rewards?.rules)&&payload.rules.every(rule=>result.rewards.rules.some(saved=>saved.type==='habit'&&saved.sourceId===rule.source_id&&saved.stars===rule.stars));
}
async function rewardMutation(key, payload, success) {
  if (rewardPending.has(key)) return;
  const account = currentUserEmail, generation=sessionGeneration;
  const active=()=>account===currentUserEmail&&generation===sessionGeneration;
  rewardPending.add(key);
  renderRewards();
  try {
    let result = await gPost(payload);
    if (!active()) return;
    if ((!result || result.status !== 'ok') && key === 'habit-rules') {
      rewardChecking.add(key);renderRewards();
      const checked=await gasRequest({action:'get_rewards'});
      if(!active())return;
      if(habitRewardSaveMatches(payload,checked))result=checked;
    }
    if (!result || result.status !== 'ok') { showError('Save was not confirmed. Your star choices are still here. Please try saving again.'); return; }
    if (key === 'habit-rules') rewardHabitDrafts.clear();
    applyRewardResult(result, false);
    toast(success);
  } catch (error) {
    if (active()) showError("Could not save. Try again when connected.");
  } finally {
    if(active()){rewardChecking.delete(key);rewardPending.delete(key);if(section==='rewards')renderRewards();}
  }
}
function renderRewards() {
  const root = document.getElementById('rewards-container'); if (!root) return;
  const p = rewardProfile();
  if (!p) {
    const loading=rewardLoadState.loading;
    const message=loading?'Loading your companions…':rewardLoadState.error||'Your companion data has not loaded yet. Please try again.';
    root.innerHTML=`<div class="empty" role="${loading?'status':'alert'}" aria-live="polite"><p>${escapeHtml(message)}</p>${loading?'':'<button type="button" class="btn btn-p" id="reward-retry">Try again</button>'}</div>`;
    root.querySelector('#reward-retry')?.addEventListener('click',()=>loadData());
    return;
  }
  const family = data.rewards.family;
  const saving = rewardPending.has('profile');
  root.innerHTML = `<div class="reward-page-heading"><div><span class="reward-eyebrow">OUR LITTLE NEST</span><h2>Companions & stars</h2><p>Celebrate the small things. Build something together.</p></div><span class="reward-wallet">★ ${p.balance}<small>your stars</small></span></div>
    <section class="reward-hero"><div class="reward-hero-art">${rewardCompanionSVG(p)}</div><div><h3>Meet ${escapeHtml(p.name)}</h3><p>${p.earned ? p.earned + ' stars earned through little everyday wins.' : 'Your companion is ready to share your first little win.'}</p>
      <p class="reward-muted">Stars unlock accessories. Every star earned also grows your family nest.</p></div></section>
    ${isAdultUser ? rewardHabitRulesHTML() : ''}
    <section class="reward-profile-settings"><h3>Make your companion yours</h3>
      <form id="reward-profile-form"><fieldset ${saving ? 'disabled' : ''}>
        <div class="reward-species">${['fox', 'rabbit', 'bear', 'cat'].map(species => `<label class="reward-species-option"><input type="radio" name="reward-species" value="${species}" ${species === p.species ? 'checked' : ''}>${rewardCompanionSVG({ species, name: species, equipped: '' }, 'small')}<span>${species[0].toUpperCase() + species.slice(1)}</span></label>`).join('')}</div>
        <div class="reward-profile-actions"><label>Companion name<input id="reward-name" maxlength="24" required value="${escapeHtml(p.name)}"></label><button type="submit" class="btn btn-p">${saving ? 'Saving…' : 'Save companion'}</button></div>
      </fieldset></form>
    </section>
    <section class="reward-collection"><div class="reward-section-heading"><h3>A little wardrobe</h3><p>Earn, choose, collect.</p></div>
      <div class="reward-shop-grid">${data.rewards.catalog.map(item => {
        const owned = p.owned.includes(item.id), wearing = p.equipped === item.id, pending = rewardPending.has(item.id), canBuy = p.balance >= item.cost;
        return `<article class="reward-shop-item">${rewardCompanionSVG({ ...p, equipped: item.id }, 'small')}<h4>${escapeHtml(item.name)}</h4><p>${escapeHtml(item.description)}</p>
          <button class="btn ${owned ? 'btn-s' : 'btn-p'} btn-sm" type="button" data-accessory="${item.id}" ${pending || (owned && saving) || wearing || (!owned && !canBuy) ? 'disabled' : ''}>${pending ? 'Saving…' : wearing ? 'Wearing' : owned ? 'Wear it' : 'Unlock · ★ ' + item.cost}</button>
          ${!owned && !canBuy ? `<small>${item.cost - p.balance} more stars to go</small>` : '<small>' + (owned ? 'Yours to keep' : 'One-time unlock') + '</small>'}
        </article>`;
      }).join('')}</div>
      ${p.equipped ? `<button type="button" class="btn btn-s btn-sm" id="reward-remove-accessory" ${saving ? 'disabled' : ''}>Take accessory off</button>` : ''}
    </section>
    <section class="reward-family"><div><span class="reward-eyebrow">EVERYONE CONTRIBUTES</span><h3>${escapeHtml(family.name || 'Our family garden')}</h3><p>${family.unlocked ? 'You reached this goal together. Celebrate your little wins.' : 'Earn ' + family.goal + ' stars together. Every little win helps.'}</p><p class="reward-muted">Spending your stars keeps the family progress growing.</p></div>${rewardGoalArt(family)}
      <div class="reward-family-members">${data.rewards.members.map(m => `<div>${rewardCompanionSVG(m, 'small')}<strong>${escapeHtml(m.member)}</strong><span>${m.earned} stars contributed</span></div>`).join('')}</div>
      <div class="reward-progress" role="progressbar" aria-label="Family goal progress" aria-valuenow="${Math.min(family.goal, family.earned)}" aria-valuemin="0" aria-valuemax="${family.goal}"><span style="width:${Math.min(100, family.earned / family.goal * 100)}%"></span></div><p class="reward-muted">${family.earned} / ${family.goal} stars earned together</p>
    </section>
    ${isAdultUser ? `<section class="reward-rule-settings"><h3>Our next family goal</h3><p class="reward-muted">A shared milestone in our nest. Earned stars carry forward; choosing a goal does not spend them.</p><form id="family-goal-form"><label for="family-goal">Choose a goal</label><select id="family-goal">${(data.rewards.goals||[]).map(g=>`<option value="${g.id}" ${family.goalId===g.id?'selected':''}>${g.emoji} ${escapeHtml(g.name)} · ${g.stars} stars</option>`).join('')}</select><button class="btn btn-p" ${rewardPending.has('family-goal')?'disabled':''}>Save family goal</button></form></section>` : ''}
    ${isAdultUser ? rewardRulesHTML() : ''}
    <p class="reward-footnote">One reward per task, or per habit each day. Older habit entries can be recorded but earn no stars. Earned stars and accessories stay with you when a log is removed.</p>`;
  root.querySelector('#family-goal-form')?.addEventListener('submit', e => {e.preventDefault();rewardMutation('family-goal',{note:'set_family_goal',goal_id:root.querySelector('#family-goal').value},'Family goal updated.');});
  root.querySelector('#reward-profile-form').addEventListener('submit', e => {
    e.preventDefault();
    const species = root.querySelector('[name="reward-species"]:checked').value;
    const name = root.querySelector('#reward-name').value.trim();
    if (!name) return showError('Give your companion a name.');
    rewardMutation('profile', { note: 'save_companion', species, companion_name: name, equipped: p.equipped }, 'Your companion is ready.');
  });
  root.querySelectorAll('[data-accessory]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.accessory;
    rewardMutation(p.owned.includes(id) ? 'profile' : id, p.owned.includes(id) ? { note: 'save_companion', species: p.species, companion_name: p.name, equipped: id } : { note: 'buy_reward_item', item_id: id }, p.owned.includes(id) ? 'Looking lovely!' : 'Accessory unlocked. Choose “Wear it” to try it on.');
  }));
  root.querySelector('#reward-remove-accessory')?.addEventListener('click', () => rewardMutation('profile', { note: 'save_companion', species: p.species, companion_name: p.name, equipped: '' }, 'Accessory put away.'));

  root.querySelectorAll('[data-habit-stars]').forEach(input => input.addEventListener('input', () => {
    rewardHabitDrafts.set(currentUserEmail + ':' + input.dataset.habitStars, input.value);
  }));
  root.querySelector('#reward-habit-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const rules = Array.from(root.querySelectorAll('[data-habit-stars]')).map(input => ({source_id:input.dataset.habitStars,stars:Number(input.value)}));
    rewardMutation('habit-rules', {note:'set_habit_rewards',rules}, 'Habit stars saved.');
  });
  root.querySelector('#reward-rule-type')?.addEventListener('change', rewardRuleOptions);
  root.querySelector('#reward-rule-source')?.addEventListener('change', rewardRuleValue);
  root.querySelector('#reward-rule-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const type = v('reward-rule-type'), id = v('reward-rule-source');
    if (!id) return showError('Choose a task or habit first.');
    rewardMutation('rule', { note: 'set_reward_rule', source_type: type, source_id: id, stars: Number(v('reward-rule-stars')) }, 'Star reward saved.');
  });
  if (isAdultUser) rewardRuleOptions();
}
function rewardHabitRulesHTML() {
  const habits = data.habits || [];
  return `<section class="reward-habit-settings"><h3>Stars for every habit</h3><p class="reward-muted">Choose the stars each family member earns on a scheduled habit day. Set 0 to turn its reward off.</p>
    ${habits.length ? `<form id="reward-habit-form"><fieldset ${rewardPending.has('habit-rules') ? 'disabled' : ''}>
      <div class="reward-habit-list">${habits.map(h => `<div class="reward-habit-row"><div><strong>${escapeHtml(h.habit)}</strong><small>${escapeHtml(h.member)} · ${escapeHtml(habitScheduleLabel(h))}${h.state&&h.state!=='active'?' · '+escapeHtml(h.state):''}</small></div>
        <label>Stars<input type="number" data-habit-stars="${escapeHtml(h.id)}" value="${escapeHtml(rewardHabitDrafts.get(currentUserEmail + ':' + h.id) ?? rewardStars('habit',h.id))}" min="0" max="100" step="1" required aria-label="Stars for ${escapeHtml(h.habit)} (${escapeHtml(h.member)})"></label></div>`).join('')}</div>
      <div class="reward-habit-save"><button type="submit" class="btn btn-p">${rewardChecking.has('habit-rules') ? 'Checking save…' : rewardPending.has('habit-rules') ? 'Saving…' : 'Save habit stars'}</button><small>Whole numbers from 0 to 100. Earned once per member each day.</small></div>
    </fieldset></form>` : '<p class="reward-muted">Add a habit in Habits to choose its star reward here.</p>'}
  </section>`;
}
function rewardRulesHTML() {
  return `<section class="reward-rule-settings"><h3>Task rewards</h3><p class="reward-muted">Tasks earn stars once. Choose an open task and its reward.</p>
    <form id="reward-rule-form"><fieldset ${rewardPending.has('rule') ? 'disabled' : ''}><div class="reward-rule-fields">
      <input type="hidden" id="reward-rule-type" value="task">
      <label>Task<select id="reward-rule-source"></select></label>
      <label>Reward<select id="reward-rule-stars"><option value="0">No stars</option><option value="1">★ 1 star</option><option value="3">★ 3 stars</option><option value="5">★ 5 stars</option></select></label>
      <button type="submit" class="btn btn-p">${rewardPending.has('rule') ? 'Saving…' : 'Save reward'}</button></div></fieldset></form>
    <p class="reward-muted">Asking for help never costs stars.</p></section>`;
}
function rewardRuleOptions() {
  const type = v('reward-rule-type');
  const select = document.getElementById('reward-rule-source');
  const sources = type === 'habit' ? (data.habits || []).map(h => ({ id: h.id, title: h.habit, member: h.member })) : (data.todos || []).map(t => ({ id: t.id, title: t.task, member: t.assignee }));
  select.innerHTML = '<option value="">Choose an activity</option>' + sources.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.title)} · ${escapeHtml(s.member)}</option>`).join('');
  rewardRuleValue();
}
function rewardRuleValue() { document.getElementById('reward-rule-stars').value = String(rewardStars(v('reward-rule-type'), v('reward-rule-source'))); }
