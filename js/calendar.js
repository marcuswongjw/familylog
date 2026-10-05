    // ─── CALENDAR ──────────────────────────────────────────────
    function getStartOfWeek(d){
      const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const day = date.getDay();
      date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
      return date;
    }
    function weekDateStr(d){
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    }
    function eventPeople(e){
      const tags = (e.tags || []).filter(t => t && t !== 'Everyone');
      return tags.length ? tags : ['Family'];
    }
    function timeToMinutes(s){
      if (!s) return null;
      const t = String(s).trim().toLowerCase().replace(/\s+/g, '');
      if (!t || t === 'allday') return null;
      const m = t.match(/^(\d{1,2}):(\d{2})(am|pm)?$/);
      if (!m) return null;
      let h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      const mer = m[3];
      if (mer === 'pm' && h !== 12) h += 12;
      if (mer === 'am' && h === 12) h = 0;
      return h * 60 + min;
    }
    function eventsOverlap(a, b){
      const as = timeToMinutes(a.time), bs = timeToMinutes(b.time);
      if (as == null || bs == null) return false;
      const ae = timeToMinutes(a.endTime) ?? as + 60;
      const be = timeToMinutes(b.endTime) ?? bs + 60;
      return as < be && bs < ae;
    }
    function weekChipTitle(e, person){
      let t = e.title || '';
      if (person && person !== 'Family' && t.toLowerCase().startsWith(person.toLowerCase() + ' - ')) {
        t = t.slice(person.length + 3);
      }
      if ((/\bEYE\b/.test(t) || t.includes('[Mikaela] EYE')) && !t.includes('End Year Exams')) {
        t += ' (End Year Exams)';
      }
      return t;
    }
    function kidHoursThisMonth(name){
      const now = new Date(), today = todayStr();
      let hours = 0;
      (data.events || []).forEach(e => {
        if (!(e.tags || []).includes(name) || !e.dateRaw || e.dateRaw >= today) return;
        const d = new Date(e.dateRaw + 'T00:00:00');
        if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return;
        hours += Number(e.duration) || 0;
      });
      return hours;
    }
    function setWeekPerson(person){
      weekPersonFilter = person;
      savePreference('weekPerson', person);
      renderCal();
    }
    function openWeekAdd(dayStr, person){
      if (!isAdultUser) return;
      selectedCalDayStr = dayStr;
      savePreference('selectedCalDay', dayStr);
      if (person && person !== 'Family') {
        document.getElementById('sch-child').value = (person === 'Meaghan' ? 'Meaghan' : 'Mikaela');
        if (person === 'Mikaela' || person === 'Meaghan') {
          openM('m-timetable-add');
          return;
        }
      }
      openM('m-event');
      chips('ev-chips', FAM, person && person !== 'Family' ? person : 'Everyone', 'ev-tag');
    }
    function toggleCalView(view) {
      calView = view;
      savePreference('calView', view);
      document.querySelectorAll('#s-calendar .toggle-pill').forEach(p => p.classList.remove('active'));
      const btn = document.getElementById('cal-view-'+view);
      if(btn) btn.classList.add('active');
      renderCal();
    }
    function prevCalMonth(){ calMonth--; if(calMonth<0){calMonth=11;calYear--;} renderCal(); }
    function nextCalMonth(){ calMonth++; if(calMonth>11){calMonth=0;calYear++;} renderCal(); }
    function prevCalWeek(){ calWeekStart.setDate(calWeekStart.getDate()-7); renderCal(); }
    function nextCalWeek(){ calWeekStart.setDate(calWeekStart.getDate()+7); renderCal(); }
    function snapCalWeekToday(){ calWeekStart=getStartOfWeek(new Date()); renderCal(); }
    function snapCalMonthToday(){ const d=new Date(); calMonth=d.getMonth(); calYear=d.getFullYear(); selectedCalDayStr=localDateStr(d); savePreference('selectedCalDay', selectedCalDayStr); renderCal(); }
    function selectCalDay(dayStr){ selectedCalDayStr=dayStr; savePreference('selectedCalDay', dayStr); renderCal(); }

    function renderCal() {
      if(calView === 'year') renderCalYear();
      else if(calView === 'month') renderCalMonth();
      else if(calView === 'week') renderCalWeek();
      else renderCalList();
    }

    function renderCalList() {
      const today = todayStr();
      let evs = (data.events || []).filter(e => e.dateRaw >= today);
      if(searchCalQuery) evs = evs.filter(e => e.title.toLowerCase().includes(searchCalQuery) || (e.notes||'').toLowerCase().includes(searchCalQuery));
      const container = document.getElementById('cal-list');
      if(!container) return;
      if(!evs.length){ container.innerHTML = '<div class="empty"><div class="ei">📅</div>No upcoming events</div>'; return; }
      container.innerHTML = evs.map(e => `
        <div class="row">
          <div style="font-size:22px;flex-shrink:0;">📅</div>
          <div class="row-main">
            <div class="row-title">${escapeHtml(e.title)}${(e.title && /\bEYE\b/.test(e.title) && !e.title.includes('End Year Exams')) ? ' <span class="badge b-amber" style="font-size:11px;font-weight:600;">End Year Exams</span>' : ''}</div>
            <div class="row-sub">${escapeHtml(e.date)} · ${escapeHtml(e.time)}${e.notes?' · '+escapeHtml(e.notes):''}</div>
            ${(e.tags||[]).map(t=>`<span class="badge ${getMemberBadgeClass(t)}" style="margin-top:4px;margin-right:3px;">${escapeHtml(t)}</span>`).join('')}
          </div>
          <button onclick="delEvent('${e.id}')" style="color:var(--text-muted);font-size:18px;padding:4px 6px;flex-shrink:0;">✕</button>
        </div>`).join('');
    }

    function renderCalWeek() {
      const evs = data.events || [];
      const container = document.getElementById('cal-list');
      if (!container) return;
      const weekStart = new Date(calWeekStart);
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        days.push({ date: d, str: weekDateStr(d) });
      }
      const today = todayStr();
      const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const people = isAdultUser ? ['Family', 'Mikaela', 'Meaghan', 'Eleanor', 'Marcus'] : [user];
      const visiblePeople = weekPersonFilter && weekPersonFilter !== 'All'
        ? people.filter(p => p === 'Family' || p === weekPersonFilter)
        : people;
      const matchesSearch = e => !searchCalQuery || (e.title || '').toLowerCase().includes(searchCalQuery) || (e.notes || '').toLowerCase().includes(searchCalQuery);
      const eventsByDay = {};
      days.forEach(day => {
        eventsByDay[day.str] = evs.filter(e => e.dateRaw === day.str && matchesSearch(e))
          .sort((a, b) => (timeToMinutes(a.time) ?? 0) - (timeToMinutes(b.time) ?? 0));
      });
      const conflictDays = {};
      const conflictLines = [];
      days.forEach(day => {
        const mika = eventsByDay[day.str].filter(e => eventPeople(e).includes('Mikaela'));
        const mega = eventsByDay[day.str].filter(e => eventPeople(e).includes('Meaghan'));
        mika.forEach(a => mega.forEach(b => {
          if (a.id === b.id || !eventsOverlap(a, b)) return;
          const parentCovered = eventPeople(a).concat(eventPeople(b)).some(p => p === 'Marcus' || p === 'Eleanor');
          if (parentCovered) return;
          conflictDays[day.str] = true;
          conflictLines.push(`${dayNames[day.date.getDay()]} ${day.date.getDate()}: ${weekChipTitle(a, 'Mikaela')} and ${weekChipTitle(b, 'Meaghan')}`);
        }));
      });
      const end = days[6];
      const rangeLabel = days[0].date.getMonth() === end.date.getMonth()
        ? `${days[0].date.getDate()}–${end.date.getDate()} ${end.date.toLocaleDateString('en-SG', { month: 'short' })}`
        : `${days[0].date.getDate()} ${days[0].date.toLocaleDateString('en-SG', { month: 'short' })} – ${end.date.getDate()} ${end.date.toLocaleDateString('en-SG', { month: 'short' })}`;
      const personSub = {
        Family: 'Everyone',
        Mikaela: 'self-serve',
        Meaghan: 'with you',
        Eleanor: 'Mom',
        Marcus: 'Dad'
      };
      const pills = isAdultUser ? ['All', 'Mikaela', 'Meaghan', 'Eleanor', 'Marcus'] : [user];
      const chip = (e, person) => {
        const timeLabel = !e.time || e.time === 'All day' ? 'All day' : e.time;
        const del = isAdultUser ? `<button class="week-chip-del" data-eid="${escapeHtml(e.id)}" onclick="event.stopPropagation();delEvent(this.dataset.eid)" aria-label="Delete">✕</button>` : '';
        return `<button type="button" class="week-chip week-chip-${person}" onclick="event.stopPropagation()">
          ${del}
          <span class="week-chip-time">${escapeHtml(timeLabel)}</span>
          <span class="week-chip-title">${escapeHtml(weekChipTitle(e, person))}</span>
          ${e.location ? `<span class="week-chip-loc">${escapeHtml(e.location)}</span>` : ''}
        </button>`;
      };
      let html = `
        <div class="week-toolbar">
          <div style="display:flex;align-items:center;gap:8px;">
            <button onclick="prevCalWeek()" style="background:none;border:none;font-size:16px;cursor:pointer;color:#4f86c6;padding:4px 8px;">◀</button>
            <button onclick="snapCalWeekToday()" style="background:#edf4fc;border:none;font-size:11px;font-weight:700;color:#4f86c6;padding:4px 8px;border-radius:6px;cursor:pointer;">Today</button>
          </div>
          <span class="week-toolbar-title">${rangeLabel}</span>
          <button onclick="nextCalWeek()" style="background:none;border:none;font-size:16px;cursor:pointer;color:#4f86c6;padding:4px 8px;">▶</button>
        </div>
        <div class="week-people">
          ${pills.map(p => `<button class="tab-pill${weekPersonFilter===p?' active':''}" onclick="setWeekPerson('${p}')">${p}</button>`).join('')}
        </div>
        ${isAdultUser && conflictLines.length ? `<div class="week-conflict-banner"><strong>Two places at once</strong><br>${conflictLines.map(escapeHtml).join('<br>')}</div>` : ''}
        <div class="week-board-scroll">
          <table class="week-board">
            <thead>
              <tr>
                <th class="week-name"></th>
                ${days.map(day => `<th class="${day.str===today?'week-day-today':''}">${dayNames[day.date.getDay()]}<br>${day.date.getDate()}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${visiblePeople.map(person => {
                const hours = (person === 'Mikaela' || person === 'Meaghan') ? kidHoursThisMonth(person) : 0;
                const sub = person === 'Mikaela' || person === 'Meaghan'
                  ? `${personSub[person]}${hours ? ' · ' + hours.toFixed(1) + 'h this month' : ''}`
                  : personSub[person];
                return `<tr>
                  <th class="week-name"><span class="week-name-label">${person === 'Mikaela' ? '⛵ ' : person === 'Meaghan' ? '🩰 ' : ''}${escapeHtml(person)}</span><span class="week-name-sub">${escapeHtml(sub)}</span></th>
                  ${days.map(day => {
                    const cellEvents = eventsByDay[day.str].filter(e => eventPeople(e).includes(person));
                    const conflict = person !== 'Family' && conflictDays[day.str] && (person === 'Mikaela' || person === 'Meaghan');
                    return `<td class="week-day-cell${day.str===today?' today':''}${conflict?' conflict':''}" onclick="openWeekAdd('${day.str}','${person}')">${cellEvents.map(e => chip(e, person)).join('')}</td>`;
                  }).join('')}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
      container.innerHTML = html;
      const todayCol = container.querySelector('.week-day-today');
      if (todayCol) todayCol.scrollIntoView({ inline: 'center', block: 'nearest' });
    }

    function renderCalMonth() {
      const evs = data.events || [];
      const container = document.getElementById('cal-list');
      if(!container) return;
      const firstDayOfMonth = new Date(calYear, calMonth, 1);
      const startDayOfWeek = firstDayOfMonth.getDay();
      const numDays = new Date(calYear, calMonth+1, 0).getDate();
      const prevMonthDays = new Date(calYear, calMonth, 0).getDate();
      const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      let html = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--bg-card);border-bottom:1px solid var(--border-color);">
          <div style="display:flex;align-items:center;gap:8px;">
            <button onclick="prevCalMonth()" style="background:none;border:none;font-size:16px;cursor:pointer;color:#4f86c6;padding:4px 8px;">◀</button>
            <button onclick="snapCalMonthToday()" style="background:#edf4fc;border:none;font-size:11px;font-weight:700;color:#4f86c6;padding:4px 8px;border-radius:6px;cursor:pointer;">Today</button>
          </div>
          <span style="font-weight:700;font-size:14px;">${monthNames[calMonth]} ${calYear}</span>
          <button onclick="nextCalMonth()" style="background:none;border:none;font-size:16px;cursor:pointer;color:#4f86c6;padding:4px 8px;">▶</button>
        </div>
        <div class="cal-grid-hdr">
          <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
        </div>
        <div class="cal-grid" id="cal-grid-container">
      `;
      for(let i=startDayOfWeek-1; i>=0; i--) { const dVal=prevMonthDays-i; html += `<div class="cal-day-cell other-month"><span class="cal-day-num">${dVal}</span></div>`; }
      const today = todayStr();
      for(let day=1; day<=numDays; day++) {
        const dayStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const isToday = today === dayStr;
        const isSelected = selectedCalDayStr === dayStr;
        let dayEvents = evs.filter(e => e.dateRaw === dayStr);
        if(searchCalQuery) dayEvents = dayEvents.filter(e => e.title.toLowerCase().includes(searchCalQuery) || (e.notes||'').toLowerCase().includes(searchCalQuery));
        let dotsHtml = '';
        if(dayEvents.length > 0) {
          dotsHtml = '<div class="cal-dots-wrap">';
          const uniqueTags = new Set();
          dayEvents.forEach(e => { if(e.tags && e.tags.length>0) e.tags.forEach(t => uniqueTags.add(t)); else uniqueTags.add('Everyone'); });
          uniqueTags.forEach(tag => dotsHtml += `<span class="cal-dot ${tag}"></span>`);
          dotsHtml += '</div>';
        }
        const cellClass = `cal-day-cell${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`;
        html += `
          <div class="${cellClass}" data-date="${dayStr}" onclick="selectCalDay('${dayStr}')">
            <span class="cal-day-num">${day}</span>
            ${dotsHtml}
          </div>
        `;
      }
      const totalCellsUsed = startDayOfWeek + numDays;
      const nextDaysCount = 42 - totalCellsUsed;
      for(let d=1; d<=nextDaysCount; d++) { html += `<div class="cal-day-cell other-month"><span class="cal-day-num">${d}</span></div>`; }
      html += `</div>`;
      let selectedDayEvents = evs.filter(e => e.dateRaw === selectedCalDayStr);
      if(searchCalQuery) selectedDayEvents = selectedDayEvents.filter(e => e.title.toLowerCase().includes(searchCalQuery) || (e.notes||'').toLowerCase().includes(searchCalQuery));
      let selectedDayHtml = '';
      if(selectedDayEvents.length > 0) {
        selectedDayHtml = selectedDayEvents.map(e => `
          <div class="row" style="padding:10px 16px;cursor:${isAdultUser && !e.sourceId ? 'grab' : 'default'};" draggable="${isAdultUser && !e.sourceId}" data-event-id="${e.id}" data-date="${e.dateRaw}" ondragstart="onDragStart(event)" ondragend="onDragEnd(event)">
            <div style="font-size:20px;flex-shrink:0;margin-right:6px;">📅</div>
            <div class="row-main">
              <div class="row-title" style="font-weight:600;">${escapeHtml(e.title)}</div>
              ${e.sourceId ? '<div class="row-sub">School plan · Change dates in Google Calendar and review preparation tasks.</div>' : ''}
              <div class="row-sub">${escapeHtml(e.time)}${e.endTime ? ' - ' + escapeHtml(e.endTime) : ''}${e.location ? ' · ' + escapeHtml(e.location) : ''}</div>
              ${e.notes ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;font-style:italic;">"${escapeHtml(e.notes)}"</div>` : ''}
              ${(e.tags||[]).map(t=>`<span class="badge ${getMemberBadgeClass(t)}" style="margin-top:4px;margin-right:3px;">${escapeHtml(t)}</span>`).join('')}
            </div>
            <button onclick="delEvent('${e.id}')" style="color:var(--text-muted);font-size:16px;padding:4px;flex-shrink:0;">✕</button>
          </div>
        `).join('');
      } else {
        selectedDayHtml = '<div class="empty">No events scheduled for this day</div>';
      }
      html += `
        <div style="margin-top:16px;font-size:13px;font-weight:700;color:var(--text-secondary);padding:0 16px 4px;border-bottom:2px solid var(--border-color);">
          📅 Events: ${fmtDate(selectedCalDayStr)}
        </div>
        <div class="card-body" style="padding:0;" id="selected-day-events">
          ${selectedDayHtml}
        </div>
      `;
      container.innerHTML = html;
      document.querySelectorAll('.cal-day-cell').forEach(cell => {
        cell.addEventListener('dragover', onDragOver);
        cell.addEventListener('drop', onDrop);
      });
    }

    // ─── CALENDAR DRAG & DROP ──────────────────────────────
    let draggedEventId = null;
    const pendingCalendarMoves = new Set();
    const SCHOOL_MOVE_MESSAGE = 'School events are linked to a reviewed plan. Edit the event in Google Calendar and review its preparation tasks together.';
    function onDragStart(e) {
      draggedEventId = null;
      const el = e.target.closest('.row');
      if(!el) return;
      const event = (data.events || []).find(ev => ev.id === el.dataset.eventId);
      if (!event || !isAdultUser || event.sourceId || pendingCalendarMoves.has(event.id)) {
        e.preventDefault();
        if (event?.sourceId) showError(SCHOOL_MOVE_MESSAGE);
        else if (!isAdultUser) showError('Only parents can move calendar events.');
        else if (event) toast('This event is still saving.');
        return;
      }
      draggedEventId = el.dataset.eventId;
      e.dataTransfer.setData('text/plain', draggedEventId);
      el.classList.add('dragging');
    }
    function onDragEnd(e) {
      draggedEventId = null;
      const el = e.target.closest('.row');
      if(el) el.classList.remove('dragging');
      document.querySelectorAll('.cal-day-cell.drag-over').forEach(cell => cell.classList.remove('drag-over'));
    }
    function onDragOver(e) {
      e.preventDefault();
      const cell = e.target.closest('.cal-day-cell');
      if(cell) cell.classList.add('drag-over');
    }
    async function onDrop(e) {
      e.preventDefault();
      const cell = e.target.closest('.cal-day-cell');
      if(cell) cell.classList.remove('drag-over');
      const newDate = cell?.dataset.date;
      const eventId = draggedEventId;
      draggedEventId = null;
      if (!newDate || !eventId) return;
      const event = (data.events || []).find(ev => ev.id === eventId);
      if (!event || pendingCalendarMoves.has(eventId) || event.dateRaw === newDate) return;
      if (!isAdultUser) return showError('Only parents can move calendar events.');
      if (event.sourceId) return showError(SCHOOL_MOVE_MESSAGE);
      pendingCalendarMoves.add(eventId);
      try {
        const result = await gPost({ note: 'update_event_date', event_id: eventId, new_date: newDate });
        if (!result || result.status !== 'ok') {
          showError(result?.message || 'Could not confirm the move. Refresh the calendar before trying again.');
          return;
        }
        // A refresh may have replaced the event object while the request was pending.
        const currentEvent = (data.events || []).find(ev => ev.id === eventId);
        if (currentEvent) {
          currentEvent.dateRaw = newDate;
          currentEvent.date = fmtDate(newDate);
        }
        renderCal();
        renderHome();
        toast('Event moved to ' + fmtDate(newDate));
      } catch (err) {
        showError('Could not confirm the move. Refresh the calendar before trying again.');
      } finally {
        pendingCalendarMoves.delete(eventId);
      }
    }

    // ─── CALENDAR YEAR VIEW ──────────────────────────────────
    function renderCalYear() {
      const container = document.getElementById('cal-list');
      if(!container) return;
      const evs = data.events || [];
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      let html = `<div class="cal-year-grid">`;
      for(let m=0; m<12; m++) {
        const daysInMonth = new Date(calYear, m+1, 0).getDate();
        const firstDay = new Date(calYear, m, 1).getDay();
        const monthEvents = evs.filter(e => {
          const d = new Date(e.dateRaw);
          return d.getMonth() === m && d.getFullYear() === calYear;
        });
        const eventDays = new Set(monthEvents.map(e => e.dateRaw));
        let miniGrid = '';
        for(let i=0; i<firstDay; i++) miniGrid += '<div class="mini-day"></div>';
        for(let d=1; d<=daysInMonth; d++) {
          const dateStr = `${calYear}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const hasEvent = eventDays.has(dateStr);
          miniGrid += `<div class="mini-day ${hasEvent?'has-event':''}">${d}</div>`;
        }
        html += `
          <div class="cal-year-month" onclick="goToMonthView(${m})">
            <div class="month-label">${months[m]} ${calYear}</div>
            <div class="mini-grid">${miniGrid}</div>
          </div>
        `;
      }
      html += `</div>`;
      container.innerHTML = html;
    }
    function goToMonthView(month) {
      calMonth = month;
      calView = 'month';
      savePreference('calView', 'month');
      document.querySelectorAll('#s-calendar .toggle-pill').forEach(p => p.classList.remove('active'));
      document.getElementById('cal-view-month').classList.add('active');
      renderCal();
    }

    // ─── TASKS ──────────────────────────────────────────────────
    function renderTasks() {
      let todos = data.todos || [];
      if(searchTaskQuery) todos = todos.filter(t => t.task.toLowerCase().includes(searchTaskQuery) || (t.assignee||'').toLowerCase().includes(searchTaskQuery));
      const el = document.getElementById('task-list');
      if(!todos.length){ el.innerHTML = '<div class="empty"><div class="ei">✅</div>All done — no open tasks!</div>'; return; }
      const g = {};
      FAM.forEach(m => g[m] = []);
      todos.forEach(t => {
        const assignee = t.assignee || 'Everyone';
        if(!g[assignee]) g[assignee] = [];
        g[assignee].push(t);
      });
      el.innerHTML = `
        <div style="padding: 16px;">
          ${FAM.filter(m => g[m] && g[m].length).map(m => `
            <div style="font-size:12px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:1px;margin:16px 0 8px;padding-left:4px;border-left:3px solid var(--primary);">${escapeHtml(m)}</div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              ${g[m].map(t => {
                const today = todayStr();
                let dueClass = 'future';
                let dueText = 'No due date';
                if(t.due) {
                  if(t.dueRaw < today) {
                    dueClass = 'overdue';
                    dueText = `⚠️ Overdue · ${escapeHtml(t.due)}`;
                  } else if(t.dueRaw === today) {
                    dueClass = 'today';
                    dueText = `⏳ Due today`;
                  } else {
                    dueClass = 'future';
                    dueText = `📅 Due ${escapeHtml(t.due)}`;
                  }
                }
                return `
                  <div class="task-row">
                    <button type="button" class="chk" aria-label="Complete ${escapeHtml(t.task)}" onclick="doneTask('${t.id}',this)"></button>
                    <div class="task-main" onclick="openEditTask('${t.id}')" style="cursor:pointer;" title="Click to edit task">
                      <div class="task-ttl">${escapeHtml(t.task)}${rewardBadge('task', t.id)}</div>
                      <div class="task-meta">
                        <span class="task-meta-badge ${dueClass}">${dueText}</span>
                      </div>
                    </div>
                    <button class="parent-task-edit" onclick="openEditTask('${t.id}')" title="Edit task" style="color:#94a3b8;font-size:14px;padding:8px;border:none;background:transparent;cursor:pointer;" onmouseover="this.style.color='#6366f1'" onmouseout="this.style.color='#94a3b8'">✎</button>
                    <button class="parent-task-delete" onclick="delTask('${t.id}')" style="color:#cbd5e1;font-size:16px;padding:8px;border:none;background:transparent;cursor:pointer;transition:color 0.2s;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#cbd5e1'">✕</button>
                  </div>
                `;
              }).join('')}
            </div>
          `).join('')}
        </div>
      `;
    }
    async function doneTask(id, el) {
      await schoolTaskAction(id, 'complete_todo', el);
    }
    async function delTask(id) {
      if (!isAdultUser || !confirm('Delete task?')) return;
      const result = await gPost({ note: 'delete_todo', todo_id: id });
      if (!result || result.status !== 'ok') return;
      data.todos = (data.todos || []).filter(t => t.id !== id);
      data.schoolTasks = (data.schoolTasks || []).filter(t => t.id !== id);
      renderTasks(); renderHome();
    }
