/* Companions, accessory collection and a cooperative family goal. */
const rewardPending = new Set();
let rewardCelebrationTimer;
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
    <div class="reward-home-preview">${rewardHomeSVG(family.unlocked)}<div class="reward-goal-caption"><strong>${family.unlocked ? 'Our garden is blooming' : 'Let’s grow our family garden'}</strong><span>${family.unlocked ? 'Everyone helped make this happen.' : family.earned + ' / ' + family.goal + ' stars earned together'}</span></div>
      <div class="reward-progress" role="progressbar" aria-label="Family garden progress" aria-valuenow="${Math.min(family.goal, family.earned)}" aria-valuemin="0" aria-valuemax="${family.goal}"><span style="width:${progress}%"></span></div></div>
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
  if (!celebrate || !result.award?.stars) return;
  const { stars, member } = result.award;
  const message = `${member === user ? 'You earned' : member + ' earned'} ${stars} ${stars === 1 ? 'star' : 'stars'}! A little step for our family nest.`;
  const notice = document.getElementById('reward-celebration');
  notice.textContent = message; notice.hidden = false;
  clearTimeout(rewardCelebrationTimer);
  rewardCelebrationTimer = setTimeout(() => { notice.hidden = true; }, 4500);
  document.querySelectorAll('#reward-home .reward-hello, #rewards-container .reward-hero-art').forEach(rewardAnimate);
}
function resetRewards() {
  clearTimeout(rewardCelebrationTimer);
  document.getElementById('reward-celebration').hidden = true;
  document.getElementById('reward-home').innerHTML = '';
  document.getElementById('rewards-container').innerHTML = '';
}
async function rewardMutation(key, payload, success) {
  if (rewardPending.has(key)) return;
  const account = currentUserEmail;
  rewardPending.add(key);
  renderRewards();
  try {
    const result = await gPost(payload);
    if (account !== currentUserEmail) return;
    if (!result || result.status !== 'ok') { showError(result?.message || 'Could not save. Try again when connected.'); return; }
    applyRewardResult(result, false);
    toast(success);
  } catch (error) {
    if (account === currentUserEmail) showError("Could not save. Try again when connected.");
  } finally {
    rewardPending.delete(key);
    if (account === currentUserEmail && section === 'rewards') renderRewards();
  }
}
function renderRewards() {
  const root = document.getElementById('rewards-container'); if (!root) return;
  const p = rewardProfile();
  if (!p) { root.innerHTML = '<div class="empty">Refresh to load companions. This feature needs the updated family backend.</div>'; return; }
  const family = data.rewards.family;
  const saving = rewardPending.has('profile');
  root.innerHTML = `<div class="reward-page-heading"><div><span class="reward-eyebrow">OUR LITTLE NEST</span><h2>Companions & stars</h2><p>Celebrate the small things. Build something together.</p></div><span class="reward-wallet">★ ${p.balance}<small>your stars</small></span></div>
    <section class="reward-hero"><div class="reward-hero-art">${rewardCompanionSVG(p)}</div><div><h3>Meet ${escapeHtml(p.name)}</h3><p>${p.earned ? p.earned + ' stars earned through little everyday wins.' : 'Your companion is ready to share your first little win.'}</p>
      <p class="reward-muted">Stars unlock accessories. Every star earned also grows your family nest.</p></div></section>
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
    <section class="reward-family"><div><span class="reward-eyebrow">EVERYONE CONTRIBUTES</span><h3>${family.unlocked ? 'Our garden is blooming.' : 'Our first family garden'}</h3><p>${family.unlocked ? 'A little garden, grown by all of us.' : 'Earn ' + family.goal + ' stars together to bring flowers to our home.'}</p><p class="reward-muted">Spending your stars keeps the family progress growing.</p></div>${rewardHomeSVG(family.unlocked)}
      <div class="reward-family-members">${data.rewards.members.map(m => `<div>${rewardCompanionSVG(m, 'small')}<strong>${escapeHtml(m.member)}</strong><span>${m.earned} stars contributed</span></div>`).join('')}</div>
      <div class="reward-progress" role="progressbar" aria-label="Family garden progress" aria-valuenow="${Math.min(family.goal, family.earned)}" aria-valuemin="0" aria-valuemax="${family.goal}"><span style="width:${Math.min(100, family.earned / family.goal * 100)}%"></span></div><p class="reward-muted">${family.earned} / ${family.goal} stars earned together</p>
    </section>
    ${isAdultUser ? rewardRulesHTML() : ''}
    <p class="reward-footnote">One reward per task, or per habit each day. Older habit entries can be recorded but earn no stars. Earned stars and accessories stay with you when a log is removed.</p>`;
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
function rewardRulesHTML() {
  return `<section class="reward-rule-settings"><h3>Choose what earns stars</h3><p class="reward-muted">Parents choose the activities and star amounts. Tasks earn once; habits earn once per member each day. All four family members can take part.</p>
    <form id="reward-rule-form"><fieldset ${rewardPending.has('rule') ? 'disabled' : ''}><div class="reward-rule-fields">
      <label>Activity type<select id="reward-rule-type"><option value="task">Task</option><option value="habit">Habit</option></select></label>
      <label>Activity<select id="reward-rule-source"></select></label>
      <label>Reward<select id="reward-rule-stars"><option value="0">No stars</option><option value="1">★ 1 star</option><option value="3">★ 3 stars</option><option value="5">★ 5 stars</option></select></label>
      <button type="submit" class="btn btn-p">${rewardPending.has('rule') ? 'Saving…' : 'Save reward'}</button></div></fieldset></form>
    <p class="reward-muted">Start with preparation and practice: pack a school bag, read together, or practise an instrument. Asking for help never costs stars.</p></section>`;
}
function rewardRuleOptions() {
  const type = v('reward-rule-type');
  const select = document.getElementById('reward-rule-source');
  const sources = type === 'habit' ? (data.habits || []).map(h => ({ id: h.id, title: h.habit, member: h.member })) : (data.todos || []).map(t => ({ id: t.id, title: t.task, member: t.assignee }));
  select.innerHTML = '<option value="">Choose an activity</option>' + sources.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.title)} · ${escapeHtml(s.member)}</option>`).join('');
  rewardRuleValue();
}
function rewardRuleValue() { document.getElementById('reward-rule-stars').value = String(rewardStars(v('reward-rule-type'), v('reward-rule-source'))); }
