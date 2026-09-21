/* School capture and daily plan. Confirmed records stay in Sheets/Calendar. */
let schoolDraft = null;
let schoolImageUrl = '';
let schoolBusy = false;
let schoolReturnFocus = null;
let schoolDay = '';

function schoolToday(offset = 0) {
  const date = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
  date.setDate(date.getDate() + offset);
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}
function schoolDayOffset(dateStr, offset = -1) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const parts = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + offset));
  return d.toISOString().slice(0, 10);
}
const ACTIVITY_TEMPLATES = {
  sailing: {
    child: 'Mikaela',
    tasks: [
      { title: 'Pack booties & lifejacket', kind: 'packing' },
      { title: 'Pack rashguard & cap', kind: 'packing' },
      { title: 'Pack towel & dry change of clothes', kind: 'packing' },
      { title: 'Pack sunscreen & water bottle', kind: 'packing' }
    ]
  },
  ballet: {
    child: 'Meaghan',
    tasks: [
      { title: 'Pack leotard & tights', kind: 'packing' },
      { title: 'Pack ballet shoes', kind: 'packing' },
      { title: 'Pack hairpins & hairnet', kind: 'packing' },
      { title: 'Pack water bottle & cardigan', kind: 'packing' }
    ]
  },
  swim: {
    child: '',
    tasks: [
      { title: 'Pack swimsuit & goggles', kind: 'packing' },
      { title: 'Pack towel & dry clothes', kind: 'packing' },
      { title: 'Pack swim cap & kickboard', kind: 'packing' }
    ]
  }
};
function schoolOptions(values, selected) {
  return values.map(value => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value || 'Choose child')}</option>`).join('');
}
function schoolMessage(message, error = false) {
  const el = document.getElementById('school-feedback');
  el.textContent = message; el.classList.toggle('school-error', error);
}
function schoolReset() {
  schoolDraft = null;
  if (schoolImageUrl.startsWith('blob:')) URL.revokeObjectURL(schoolImageUrl);
  schoolImageUrl = '';
  const dialog = document.getElementById('school-dialog');
  if (dialog?.open) dialog.close();
  document.getElementById('school-review').innerHTML = '';
  document.getElementById('school-text').value = '';
  document.getElementById('school-file').value = '';
}
function openSchoolCapture(id) {
  if (!isAdultUser) return;
  schoolReturnFocus = document.activeElement;
  schoolReset();
  document.getElementById('school-capture').hidden = !!id;
  document.getElementById('school-dialog').showModal();
  schoolMessage('');
  if (id) {
    const saved = (data.schoolPlans || []).find(p => p.id === id);
    if (!saved) { schoolMessage('Refresh Home to load this draft.', true); return; }
    schoolDraft = JSON.parse(JSON.stringify(saved));
    renderSchoolReview();
  } else document.getElementById('school-text').focus();
}
function closeSchoolCapture() {
  if (schoolBusy) return;
  if (schoolDraft && schoolDraft.status === 'draft' && !confirm('Close this review? Unsaved edits will be lost.')) return;
  schoolReset(); schoolReturnFocus?.focus();
}
function schoolOptimizeImage(file) {
  return new Promise((resolve, reject) => {
    if (file.type === 'application/pdf') {
      if (file.size > 5 * 1024 * 1024) return reject(new Error('PDF must be under 5 MB.'));
      return resolve(file);
    }
    if (!file.type.startsWith('image/')) return reject(new Error('Choose an image screenshot or PDF.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.onload = e => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not parse image.'));
      img.onload = () => {
        const MAX_DIM = 1600;
        let width = img.width, height = img.height;
        if (width > height) {
          if (width > MAX_DIM) { height = Math.round((height * MAX_DIM) / width); width = MAX_DIM; }
        } else {
          if (height > MAX_DIM) { width = Math.round((width * MAX_DIM) / height); height = MAX_DIM; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => {
          if (!blob) return reject(new Error('Could not compress image.'));
          resolve(blob);
        }, 'image/jpeg', 0.85);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
async function schoolUpload() {
  const file = document.getElementById('school-file').files[0];
  if (!file) return '';
  const isPdf = file.type === 'application/pdf';
  schoolMessage(isPdf ? 'Preparing PDF announcement…' : 'Optimizing screenshot…');
  const blob = await schoolOptimizeImage(file);
  if (blob.size >= 5 * 1024 * 1024) throw new Error('File too large (max 5 MB).');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');
  const email = (firebase.auth().currentUser?.email || '').toLowerCase();
  if (!email) throw new Error('Sign in as a parent to upload school messages.');
  const path = 'school/' + email + '/' + hash;
  const storageInstance = window.storage || firebase.storage();
  const ref = storageInstance.ref(path);
  schoolMessage(isPdf ? 'Uploading PDF announcement…' : 'Uploading screenshot…');
  try {
    await ref.getMetadata();
  } catch (err) {
    const uploadPromise = ref.put(blob, { contentType: isPdf ? 'application/pdf' : 'image/jpeg' });
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Upload timed out. Check connection or enter manually.')), 25000));
    await Promise.race([uploadPromise, timeoutPromise]);
  }
  if (!isPdf) {
    if (schoolImageUrl.startsWith('blob:')) URL.revokeObjectURL(schoolImageUrl);
    schoolImageUrl = URL.createObjectURL(blob);
  }
  return path;
}
async function extractSchool(manual) {
  if (schoolBusy || !isAdultUser) return;
  schoolBusy = true;
  const capture = document.getElementById('school-capture-fields'); capture.disabled = true;
  schoolMessage(manual ? 'Preparing your review…' : 'Reading your message…');
  try {
    const text = document.getElementById('school-text').value.trim();
    if (!text && !document.getElementById('school-file').files.length) throw new Error('Paste a message or choose a screenshot first.');
    const sourcePath = await schoolUpload();
    let extracted = { title: '', child: '', event: {}, tasks: [], warnings: [] };
    if (!manual) {
      schoolMessage('Reading announcement with Gemini AI…');
      extracted = (await firebase.functions().httpsCallable('extractSchoolAnnouncement', { timeout: 45000 })({ text, imagePath: sourcePath })).data;
    }
    const eventDate = extracted.event?.date || '';
    const prepDate = schoolDayOffset(eventDate, -1);
    schoolDraft = {
      title: extracted.title || '', child: extracted.child || '',
      sourceText: text || extracted.sourceText || '', sourcePath, warnings: extracted.warnings || [],
      event: { enabled: !!extracted.event?.title, title: extracted.event?.title || '', date: extracted.event?.date || '', time: extracted.event?.time || '', endTime: extracted.event?.endTime || '', location: extracted.event?.location || '', evidence: extracted.event?.evidence || '' },
      tasks: (extracted.tasks || []).map(t => ({
        ...t,
        assignee: extracted.child || '',
        due: (eventDate && (!t.due || t.due === eventDate)) ? prepDate : (t.due || '')
      })),
      status: 'draft', revision: 0
    };
    document.getElementById('school-capture').hidden = true;
    renderSchoolReview();
    schoolMessage(manual ? 'Enter the details below. Nothing is saved until you choose Save draft.' : 'Check the source and confirm the child, dates and task owners. Nothing has been added yet.');
  } catch (err) { schoolMessage((err.message || 'Extraction unavailable.') + ' You can use “Enter manually”.', true); }
  finally { schoolBusy = false; capture.disabled = false; }
}
function schoolField(label, id, value, type = 'text', max = 200) {
  return `<label class="school-field">${label}<input id="${id}" type="${type}" maxlength="${max}" value="${escapeHtml(value || '')}"></label>`;
}
function renderSchoolReview() {
  const p = schoolDraft; if (!p) return;
  const locked = p.status !== 'draft';
  document.getElementById('school-review').innerHTML = `
    <div class="school-review-grid">
      <aside class="school-source"><h3>Original message</h3>
        ${p.sourcePath ? `<button type="button" class="btn btn-s" id="school-source-button">View screenshot</button><img id="school-source-image" alt="Original school announcement" ${schoolImageUrl ? `src="${escapeHtml(schoolImageUrl)}"` : 'hidden'}>` : ''}
        <pre>${escapeHtml(p.sourceText || 'Screenshot attached. Compare the image with the plan.')}</pre>
      </aside>
      <div><h3>${locked ? (p.status === 'published' ? 'Added to family plan' : 'Finish saving this plan') : 'Review the family plan'}</h3>
        <p class="school-muted">All times are Singapore time. Missing details stay blank. This does not submit forms, make payments or schedule notifications.</p>
        ${p.warnings.length ? `<div class="school-warning"><strong>Please check</strong><ul>${p.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul></div>` : ''}
        <fieldset id="school-review-fields" ${locked ? 'disabled' : ''}>
          ${schoolField('Plan title', 'school-title', p.title)}
          <label class="school-field">Child<select id="school-child" ${p.id ? 'disabled' : ''}>${schoolOptions(['', 'Mikaela', 'Meaghan'], p.child)}</select></label>
          <label class="school-check"><input id="school-event-enabled" type="checkbox" ${p.event.enabled ? 'checked' : ''}> Add an event to the family calendar</label>
          <div class="school-event-fields">
            ${schoolField('Event title', 'school-event-title', p.event.title)}
            ${schoolField('Date (confirm the year)', 'school-event-date', p.event.date, 'date')}
            <div class="school-two">${schoolField('Report / start time', 'school-event-time', p.event.time, 'time')}${schoolField('End time', 'school-event-end', p.event.endTime, 'time')}</div>
            <p class="school-muted">Leave both times empty for an all-day event. If the end time is unknown, save a draft or uncheck the event until you confirm it.</p>
            ${schoolField('Location', 'school-event-location', p.event.location)}
            ${p.event.evidence ? `<blockquote>${escapeHtml(p.event.evidence)}</blockquote>` : ''}
          </div>
          <h3>Who needs to do what?</h3>
          <p class="school-muted">Task owners default to the child. Preparation and packing tasks default to the day before the event.</p>
          <div id="school-task-editor">${p.tasks.map((t, i) => `
            <div class="school-edit-task">
              ${schoolField('Task ' + (i + 1), 'school-task-title-' + i, t.title)}
              <div class="school-two"><label class="school-field">Type<select id="school-task-kind-${i}">${schoolOptions(['packing', 'homework', 'consent', 'payment', 'other'], t.kind)}</select></label>
              <label class="school-field">Owner<select id="school-task-owner-${i}">${schoolOptions(['', 'Mikaela', 'Meaghan', 'Marcus', 'Eleanor'], t.assignee)}</select></label></div>
              ${schoolField('Due date (optional)', 'school-task-due-' + i, t.due, 'date')}
              ${t.evidence ? `<blockquote>${escapeHtml(t.evidence)}</blockquote>` : '<small>Added by parent</small>'}
              <button class="btn btn-s" type="button" data-remove-task="${i}">Remove task</button>
            </div>`).join('')}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px;">
            <button type="button" class="btn btn-s" id="school-add-task">+ Add task</button>
            <span class="school-muted" style="font-size:12px;">Presets:</span>
            <button type="button" class="btn btn-xs" data-school-tpl="sailing">+ ⛵ Sailing kit</button>
            <button type="button" class="btn btn-xs" data-school-tpl="ballet">+ 🩰 Ballet kit</button>
            <button type="button" class="btn btn-xs" data-school-tpl="swim">+ 🏊 Swim kit</button>
          </div>
        </fieldset>
        ${!locked ? '<label class="school-check school-confirm"><input type="checkbox" id="school-confirm">I checked the source, dates and owners.</label>' : ''}
        <div class="school-actions">
          ${!locked ? '<button type="button" class="btn btn-s" id="school-save">Save draft</button><button type="button" class="btn btn-p" id="school-publish">Add to family plan</button>' : p.status === 'publishing' ? '<button type="button" class="btn btn-p" id="school-retry">Retry remaining items</button>' : ''}
        </div>
      </div>
    </div>`;
  document.getElementById('school-source-button')?.addEventListener('click', schoolShowSource);
  document.getElementById('school-child')?.addEventListener('change', (e) => {
    const prevChild = p.child;
    const newChild = e.target.value;
    schoolCollect();
    p.child = newChild;
    p.tasks.forEach((t, i) => {
      if (!t.assignee || t.assignee === prevChild) {
        t.assignee = newChild;
        const ownerEl = document.getElementById('school-task-owner-' + i);
        if (ownerEl) ownerEl.value = newChild;
      }
    });
  });
  document.getElementById('school-event-date')?.addEventListener('change', (e) => {
    const prevEventDate = p.event.date;
    const prevPrepDate = schoolDayOffset(prevEventDate, -1);
    const newEventDate = e.target.value;
    const newPrepDate = schoolDayOffset(newEventDate, -1);
    schoolCollect();
    p.event.date = newEventDate;
    if (newPrepDate) {
      p.tasks.forEach((t, i) => {
        if (!t.due || t.due === prevEventDate || t.due === prevPrepDate) {
          t.due = newPrepDate;
          const dueEl = document.getElementById('school-task-due-' + i);
          if (dueEl) dueEl.value = newPrepDate;
        }
      });
    }
  });
  document.getElementById('school-add-task')?.addEventListener('click', () => {
    schoolCollect(); if (p.tasks.length >= 30) return schoolMessage('Use up to 30 tasks per message.', true);
    const defaultDue = p.event?.date ? schoolDayOffset(p.event.date, -1) : '';
    p.tasks.push({ title: '', kind: 'other', assignee: p.child || '', due: defaultDue, evidence: '' }); renderSchoolReview();
  });
  document.querySelectorAll('[data-school-tpl]').forEach(btn => btn.addEventListener('click', () => {
    const tplKey = btn.dataset.schoolTpl;
    const tpl = ACTIVITY_TEMPLATES[tplKey];
    if (!tpl) return;
    schoolCollect();
    if (tpl.child && !p.child) p.child = tpl.child;
    const defaultDue = p.event?.date ? schoolDayOffset(p.event.date, -1) : '';
    tpl.tasks.forEach(item => {
      if (p.tasks.length < 30) {
        p.tasks.push({ title: item.title, kind: item.kind, assignee: p.child || tpl.child || '', due: defaultDue, evidence: 'Activity template' });
      }
    });
    renderSchoolReview();
  }));
  document.querySelectorAll('[data-remove-task]').forEach(button => button.addEventListener('click', () => {
    schoolCollect(); p.tasks.splice(Number(button.dataset.removeTask), 1); renderSchoolReview();
  }));
  document.getElementById('school-save')?.addEventListener('click', () => saveSchool(false));
  document.getElementById('school-publish')?.addEventListener('click', () => saveSchool(true));
  document.getElementById('school-retry')?.addEventListener('click', () => saveSchool(true));
  // Any edit requires a fresh confirmation, even if it was checked previously.
  document.getElementById('school-review-fields').addEventListener('input', () => { const c = document.getElementById('school-confirm'); if (c) c.checked = false; });
}
async function schoolShowSource() {
  try {
    if (!schoolImageUrl) schoolImageUrl = (await firebase.functions().httpsCallable('getSchoolSourceImage')({ path: schoolDraft.sourcePath })).data.image;
    const img = document.getElementById('school-source-image'); img.src = schoolImageUrl; img.hidden = false;
  } catch (err) { schoolMessage('Could not load the original screenshot. Try again when connected.', true); }
}
function schoolCollect() {
  if (!schoolDraft || schoolDraft.status !== 'draft') return;
  const p = schoolDraft;
  p.title = v('school-title'); p.child = v('school-child');
  p.event = { ...p.event, enabled: document.getElementById('school-event-enabled').checked, title: v('school-event-title'), date: v('school-event-date'), time: v('school-event-time'), endTime: v('school-event-end'), location: v('school-event-location') };
  p.tasks = p.tasks.map((t, i) => ({ ...t, title: v('school-task-title-' + i), kind: v('school-task-kind-' + i), assignee: v('school-task-owner-' + i), due: v('school-task-due-' + i) }));
}
async function saveSchool(publish) {
  if (schoolBusy || !isAdultUser) return;
  if (publish && schoolDraft.status === 'draft' && !document.getElementById('school-confirm').checked) return schoolMessage('Check the source, dates and owners, then tick the confirmation box.', true);
  schoolCollect(); schoolBusy = true;
  document.querySelectorAll('#school-review button').forEach(b => b.disabled = true);
  document.getElementById('school-review-fields').disabled = true;
  schoolMessage('Saving…');
  try {
    if (schoolDraft.status === 'draft') {
      const saved = await gPost({ note: 'save_school_draft', plan: schoolDraft, revision: schoolDraft.revision });
      if (!saved || saved.status !== 'ok') throw new Error(saved?.message || 'Could not save. Your review is still here.');
      schoolDraft.id = saved.id; schoolDraft.revision = saved.revision; schoolDraft.status = saved.state;
      if (saved.duplicate) {
        await loadData();
        const existing = data.schoolPlans?.find(p => p.id === saved.id);
        if (existing) schoolDraft = JSON.parse(JSON.stringify(existing));
        schoolMessage('This announcement already exists. Showing the saved plan.');
        renderSchoolReview(); return;
      }
    }
    if (publish) {
      const result = await gPost({ note: 'publish_school_draft', source_id: schoolDraft.id, revision: schoolDraft.revision });
      if (!result || result.status !== 'ok') throw new Error(result?.message || 'Save interrupted. Reopen the saved plan from Home before retrying.');
      schoolDraft.status = 'published';
    }
    await loadData();
    renderSchoolReview();
    schoolMessage(publish ? 'Added to the family plan. Tasks and calendar are ready.' : 'Draft saved. Reopen it from Home whenever you are ready.');
  } catch (err) {
    await loadData();
    const latest = data.schoolPlans?.find(p => p.id === schoolDraft.id);
    if (latest && latest.status !== 'draft') schoolDraft = JSON.parse(JSON.stringify(latest));
    renderSchoolReview(); schoolMessage(err.message, true);
  } finally {
    schoolBusy = false;
    document.querySelectorAll('#school-review .school-actions button').forEach(b => b.disabled = false);
    document.getElementById('school-review-fields').disabled = schoolDraft.status !== 'draft';
  }
}
window.setSchoolDay = function(offset) {
  schoolDay = schoolToday(offset);
  renderSchoolHome();
};

function renderSchoolHome() {
  const hub = document.getElementById('school-home'); if (!hub) return;
  const day = schoolDay || schoolToday();
  const isToday = day === schoolToday(0);
  const isTomorrow = day === schoolToday(1);
  const dateObj = new Date(day + 'T00:00:00Z');
  const weekday = dateObj.toLocaleDateString('en-SG', { weekday: 'long', timeZone: 'Asia/Singapore' });
  const dayLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : fmtDate(day);

  const children = isAdultUser ? ['Mikaela', 'Meaghan'] : [user];
  const plans = data.schoolPlans || [];
  const pending = plans.filter(p => p.status !== 'published');
  const taskMap = new Map((data.todos || []).map(t => [t.id, t]));
  (data.schoolTasks || []).forEach(t => taskMap.set(t.id, t));
  const tasks = [...taskMap.values()];

  const helpTasks = isAdultUser ? tasks.filter(t => t.status === 'Needs help') : [];
  const helpBannerHtml = helpTasks.length ? `
    <div class="school-help-banner">
      <div class="school-help-banner-hdr">
        <span style="font-size:18px;">💬</span>
        <div>
          <strong>A child asked for help</strong>
          <p style="margin:2px 0 0;font-size:12px;color:#8d5800;">${helpTasks.length} item${helpTasks.length > 1 ? 's' : ''} need attention</p>
        </div>
      </div>
      <div class="school-help-banner-list">
        ${helpTasks.map(t => `
          <div class="school-help-banner-item">
            <div class="school-help-banner-info">
              <span class="school-help-child">${t.assignee === 'Mikaela' ? '⛵ Mikaela' : '🩰 Meaghan'}</span>
              <div style="font-weight:600;margin-top:2px;">${escapeHtml(t.task)}</div>
              ${t.dueRaw ? `<small style="color:#a06a12;">Due ${fmtDate(t.dueRaw)}</small>` : ''}
            </div>
            <button class="btn btn-s" data-school-done="${escapeHtml(t.id)}" style="background:#fff;border-color:#dec486;color:#77500c;">Mark Done</button>
          </div>
        `).join('')}
      </div>
    </div>` : '';

  // Meaghan's open work is always on the parent radar; Mikaela stays self-serve unless she asks or is overdue.
  const meaghanTogether = isAdultUser ? tasks.filter(t =>
    t.assignee === 'Meaghan' && t.status !== 'Done' && t.status !== 'Needs help' && (!t.dueRaw || t.dueRaw <= day)
  ) : [];
  const meaghanBannerHtml = meaghanTogether.length ? `
    <div class="school-help-banner">
      <div class="school-help-banner-hdr">
        <span style="font-size:18px;">🩰</span>
        <div>
          <strong>Meaghan’s day — together with you</strong>
          <p style="margin:2px 0 0;font-size:12px;color:#8d5800;">${meaghanTogether.length} item${meaghanTogether.length > 1 ? 's' : ''} still open</p>
        </div>
      </div>
      <div class="school-help-banner-list">
        ${meaghanTogether.map(t => `
          <div class="school-help-banner-item">
            <div class="school-help-banner-info">
              <div style="font-weight:600;">${escapeHtml(t.task)}</div>
              ${t.dueRaw ? `<small style="color:#a06a12;">Due ${fmtDate(t.dueRaw)}</small>` : ''}
            </div>
            <button class="btn btn-s" data-school-done="${escapeHtml(t.id)}" style="background:#fff;border-color:#dec486;color:#77500c;">Mark Done</button>
          </div>
        `).join('')}
      </div>
    </div>` : '';

  hub.innerHTML = `
    ${isAdultUser ? `
      <div class="school-intro">
        <div>
          <span class="school-eyebrow">FAMILY SCHOOL COPILOT</span>
          <h2>From school message<br>to family plan.</h2>
          <p>One place to turn school notices into everyone's next step.</p>
        </div>
        <button class="btn btn-p" id="school-open">+ Add school message</button>
      </div>
      ${pending.length ? `
        <div class="school-inbox">
          <h3>Waiting for your review · ${pending.length}</h3>
          ${pending.map(p => `
            <button class="school-inbox-item" data-plan="${escapeHtml(p.id)}">
              <span>${escapeHtml(p.title)}<small>${escapeHtml(p.child)} · ${p.status === 'publishing' ? 'Save interrupted — finish remaining items' : 'Draft'}</small></span>
              <span>→</span>
            </button>`).join('')}
        </div>` : ''}
      ${helpBannerHtml}
      ${meaghanBannerHtml}
    ` : ''}

    <div class="school-day-heading">
      <div>
        <h2>${isAdultUser ? 'The children’s day' : (user === 'Mikaela' ? '⛵ Mikaela’s Day' : '🩰 Meaghan’s Day')}</h2>
        <span class="school-day-sub">${dayLabel} · ${weekday}${!isAdultUser && user === 'Meaghan' ? ' · together with Mom & Dad' : !isAdultUser && user === 'Mikaela' ? ' · you’ve got this' : ''}</span>
      </div>
      <div class="school-day-pills">
        <button type="button" class="school-pill ${isToday ? 'active' : ''}" onclick="setSchoolDay(0)">Today</button>
        <button type="button" class="school-pill ${isTomorrow ? 'active' : ''}" onclick="setSchoolDay(1)">Tomorrow</button>
        <label class="school-pill-date" title="Pick specific date">
          <span>📅</span>
          <input id="school-day" aria-label="Plan date" type="date" value="${day}">
        </label>
      </div>
    </div>

    <div class="school-day-grid">${children.map(child => {
      const events = (data.events || []).filter(e => e.dateRaw === day && (e.tags || []).includes(child));
      const childTasks = tasks.filter(t => {
        if (t.assignee !== child && t.assignee !== 'Everyone') return false;
        if (t.status !== 'Done') return !t.dueRaw || t.dueRaw <= day;
        // Completed items: remain visible on the day due, day completed, or active checklist
        if (t.dueRaw === day) return true;
        if (t.completedRaw && t.completedRaw === day) return true;
        if (!t.dueRaw) {
          if (events.some(e => e.sourceId && e.sourceId === t.sourceId)) return true;
          return isToday && (!t.completedRaw || t.completedRaw === day);
        }
        return false;
      });
      const packingTasks = childTasks.filter(t => t.kind === 'packing');
      const otherTasks = childTasks.filter(t => t.kind !== 'packing');
      const done = childTasks.filter(t => t.status === 'Done').length;
      const total = childTasks.length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 100;

      return `
        <section class="school-day-card">
          <div class="school-day-title">
            <span>${child === 'Mikaela' ? '⛵' : '🩰'}</span>
            <div>
              <h3>${escapeHtml(child)}’s plan</h3>
              <p>${child === 'Meaghan' ? 'Together with Mom & Dad' : 'Independent prep'}</p>
            </div>
          </div>
          ${total > 0 ? `
            <div class="school-progress-card">
              <div class="school-progress-meta">
                <span>${done === total ? '🌟 All ready for ' + dayLabel.toLowerCase() + '!' : `${done} of ${total} ready`}</span>
                <span style="font-weight:700;">${pct}%</span>
              </div>
              <div class="school-progress-bar"><div class="school-progress-fill" style="width:${pct}%;"></div></div>
            </div>` : ''}

          ${events.length ? `
            <div class="school-section-hdr">⏰ Schedule</div>
            ${events.map(e => `
              <div class="school-day-event">
                <strong>${escapeHtml(e.time)} · ${escapeHtml(e.title)}</strong>
                ${e.location ? `<small>📍 ${escapeHtml(e.location)}</small>` : ''}
              </div>`).join('')}
          ` : ''}

          ${packingTasks.length ? `
            <div class="school-section-hdr">🎒 Backpack & Gear</div>
            ${packingTasks.map(t => schoolTaskCard(t, day)).join('')}
          ` : ''}

          ${otherTasks.length ? `
            <div class="school-section-hdr">📚 Homework & Reminders</div>
            ${otherTasks.map(t => schoolTaskCard(t, day)).join('')}
          ` : ''}

          ${!events.length && !childTasks.length ? `
            <p class="school-empty">Clear day ahead! Enjoy the breathing room 🎉</p>
          ` : ''}
        </section>`;
    }).join('')}</div>

    ${isAdultUser ? `
      <div class="school-parent-actions">
        <h3>${escapeHtml(user)} — your school actions</h3>
        ${tasks.filter(t => t.sourceId && ['Marcus', 'Eleanor'].includes(t.assignee) && t.status !== 'Done')
          .sort((a, b) => (a.assignee === user ? 0 : a.assignee === 'Marcus' ? 1 : 2) - (b.assignee === user ? 0 : b.assignee === 'Marcus' ? 1 : 2))
          .map(t => schoolTaskCard(t, day)).join('') || '<p class="school-muted">No school actions waiting for a parent.</p>'}
      </div>
      ${plans.some(p => p.status === 'published') ? `
        <details class="school-inbox">
          <summary>Saved announcements</summary>
          ${plans.filter(p => p.status === 'published').slice(0, 20).map(p => `
            <button class="school-inbox-item" data-plan="${escapeHtml(p.id)}">
              ${escapeHtml(p.title)} · ${escapeHtml(p.child)} <span>View source →</span>
            </button>`).join('')}
        </details>` : ''}
    ` : ''}`;

  document.getElementById('school-open')?.addEventListener('click', () => openSchoolCapture());
  document.getElementById('school-day')?.addEventListener('change', e => { schoolDay = e.target.value || schoolToday(); renderSchoolHome(); });
  hub.querySelectorAll('[data-plan]').forEach(b => b.addEventListener('click', () => openSchoolCapture(b.dataset.plan)));
  hub.querySelectorAll('[data-school-done]').forEach(b => b.addEventListener('click', () => schoolTaskAction(b.dataset.schoolDone, 'complete_todo', b)));
  hub.querySelectorAll('[data-school-help]').forEach(b => b.addEventListener('click', () => schoolTaskAction(b.dataset.schoolHelp, 'help_todo', b)));
}

function schoolTaskCard(t, day) {
  const done = t.status === 'Done';
  const needsHelp = t.status === 'Needs help';
  const isPacking = t.kind === 'packing';
  const due = t.dueRaw ? (t.dueRaw < schoolToday() ? 'Overdue · ' : '') + fmtDate(t.dueRaw) : '';
  return `
    <div class="school-task ${done ? 'school-task-done' : ''} ${needsHelp ? 'school-task-needs-help' : ''}">
      <div class="school-task-main">
        <strong>${escapeHtml(t.task)}</strong>
        <div class="school-task-meta">
          <span class="school-task-owner">${escapeHtml(t.assignee)}</span>
          ${due ? `<span class="school-task-due">${escapeHtml(due)}</span>` : ''}
          ${needsHelp ? '<span class="school-help-label">💬 Asked for help</span>' : ''}
        </div>
      </div>
      ${done ? `
        <span class="school-task-badge-done" aria-label="Completed">✓ ${isPacking ? 'Packed' : 'Done'}</span>
      ` : `
        <div class="school-task-buttons">
          <button class="btn btn-s school-btn-action" data-school-done="${escapeHtml(t.id)}">
            ${isPacking ? '🎒 Packed' : '✓ Done'}
          </button>
          ${!isAdultUser && !needsHelp ? `
            <button class="school-help-button" data-school-help="${escapeHtml(t.id)}">Need help?</button>
          ` : ''}
        </div>
      `}
    </div>`;
}
async function schoolTaskAction(id, action, button) {
  button.disabled = true;
  const result = await gPost({ note: action, todo_id: id });
  if (!result || result.status !== 'ok') { button.disabled = false; return; }
  const status = action === 'help_todo' ? 'Needs help' : 'Done';
  (data.schoolTasks || []).forEach(t => { if (t.id === id) { t.status = status; if (status === 'Done') t.completedRaw = schoolToday(); } });
  (data.todos || []).forEach(t => { if (t.id === id) { t.status = status; if (status === 'Done') t.completedRaw = schoolToday(); } });
  if (status === 'Done') data.todos = (data.todos || []).filter(t => t.id !== id);
  renderHome(); renderTasks();
  toast(status === 'Done' ? 'Well done! ✓' : 'Your parent can see that you need a hand.');
}
