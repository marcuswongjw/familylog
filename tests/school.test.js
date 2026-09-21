'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRequest, parseResponse } = require('../school-extraction');
const parent = 'marcuswongjw@gmail.com';
const child = 'mikaelawonght@gmail.com';

const { harness } = require('./helpers/gas-harness.cjs');
function plan(overrides = {}) {
  return { title: 'Science Learning Journey', child: 'Mikaela', sourceText: 'Mikaela: Science Learning Journey on 23 September 2026. Report 7:15am; ends 10am. Bring a water bottle.',
    sourcePath: '', warnings: [], event: { enabled: true, title: 'Science Learning Journey', date: '2026-09-23', time: '07:15', endTime: '10:00', location: '', evidence: 'Report 7:15am; ends 10am.' },
    tasks: [{ title: 'Pack water bottle', kind: 'packing', assignee: 'Mikaela', due: '2026-09-22', evidence: 'Bring a water bottle.' }], ...overrides };
}
function save(h, p = plan()) { return h.write({ note: 'save_school_draft', plan: p, revision: 0 }); }
function publish(h, draft) { return h.write({ note: 'publish_school_draft', source_id: draft.id, revision: draft.revision }); }

test('review is saved without creating tasks or calendar events', () => {
  const h = harness(), saved = save(h);
  assert.equal(saved.status, 'ok'); assert.equal(saved.state, 'draft'); assert.equal(h.calendar.size, 0); assert.equal(h.sheets.ToDo, undefined);
});
test('publication and repeated publication create exactly one event and linked task', () => {
  const h = harness(), saved = save(h);
  assert.equal(publish(h, saved).state, 'published'); assert.equal(publish(h, saved).state, 'published');
  assert.equal(h.calendar.size, 1); assert.equal(h.sheets.ToDo.rows.length, 2);
  assert.equal(h.sheets.ToDo.rows[1][8], saved.id); assert.equal(h.sheets.ToDo.rows[1][10], 'Mikaela');
});
test('lost calendar response recovers the existing deterministic event', () => {
  const h = harness(), saved = save(h); h.failCalendar();
  assert.equal(publish(h, saved).status, 'error'); assert.equal(h.calendar.size, 1);
  assert.equal(h.sheets.SchoolAnnouncements.rows[1][1], 'publishing');
  assert.equal(publish(h, saved).state, 'published'); assert.equal(h.calendar.size, 1); assert.equal(h.sheets.ToDo.rows.length, 2);
});
test('lost task append response resumes without adding the same task twice', () => {
  const h = harness(), saved = save(h); h.c.ensureTodoIds_(h.ss).failAppendAfter = true;
  assert.equal(publish(h, saved).status, 'error');
  assert.equal(publish(h, saved).state, 'published'); assert.equal(h.sheets.ToDo.rows.length, 2); assert.equal(h.calendar.size, 1);
});
test('partial publication cannot be overwritten with a new plan', () => {
  const h = harness(), saved = save(h); h.failCalendar(); publish(h, saved);
  const result = h.write({ note: 'save_school_draft', plan: plan({ title: 'Edited title' }), revision: saved.revision });
  assert.equal(result.duplicate, true); assert.equal(result.state, 'publishing');
  assert.equal(JSON.parse(h.sheets.SchoolAnnouncements.rows[1][3]).title, 'Science Learning Journey');
});
test('same text or same image from a different parent detects duplicates', () => {
  const h = harness(), first = save(h); publish(h, first);
  assert.equal(save(h).duplicate, true);
  const image = 'a'.repeat(64);
  const one = plan({ sourcePath: 'school/' + parent + '/' + image });
  const two = plan({ sourcePath: 'school/eleanor.jiamin@gmail.com/' + image, sourceText: 'Different OCR output' });
  assert.equal(h.c.schoolValidatePlan_(one, parent).id, h.c.schoolValidatePlan_(two, parent).id);
});
test('concurrent draft edits require the latest revision', () => {
  const h = harness(), saved = save(h);
  assert.equal(h.write({ note: 'save_school_draft', plan: plan(), revision: 0 }).status, 'error');
  const update = h.write({ note: 'save_school_draft', plan: plan(), revision: saved.revision });
  assert.equal(update.revision, 2); assert.equal(publish(h, saved).status, 'error');
});
test('unknown end time or invalid date blocks publication, not draft storage', () => {
  for (const change of [{ endTime: '' }, { date: '2026-02-30' }, { date: '' }, { time: '24:10' }, { endTime: '06:00' }]) {
    const h = harness(), saved = save(h, plan({ event: { ...plan().event, ...change } }));
    assert.equal(saved.status, 'ok'); assert.equal(publish(h, saved).status, 'error'); assert.equal(h.calendar.size, 0);
  }
});
test('tasks-only publication and undated task preserve unknown dates', () => {
  const h = harness(), p = plan(); p.event.enabled = false; p.tasks[0].due = '';
  const saved = save(h, p); assert.equal(publish(h, saved).state, 'published');
  assert.equal(h.calendar.size, 0); assert.equal(h.sheets.ToDo.rows[1][3], '');
});
test('consent and payment can be assigned to the plan child', () => {
  for (const kind of ['consent', 'payment']) {
    const h = harness(), p = plan(); p.tasks[0].kind = kind; p.tasks[0].assignee = 'Mikaela';
    assert.equal(save(h, p).status, 'ok');
  }
});
test('children cannot save or publish announcements or create calendar events', () => {
  const h = harness(), saved = save(h);
  for (const request of [{ note: 'save_school_draft', plan: plan() }, { note: 'publish_school_draft', source_id: saved.id, revision: 1 }, { note: 'add_event' }]) {
    assert.equal(h.write(request, child).status, 'error');
  }
  assert.equal(h.c.schoolReadPlans_(h.ss, false).length, 0);
});
test('legacy tasks migrate to stable IDs and stale row numbers are rejected', () => {
  const h = harness(); h.sheets.ToDo = new h.Sheet([['Added', 'Task', 'Assignee', 'Due', 'By', 'Status', 'Completed'], [new Date(), 'Old task', 'Mikaela', '', 'Marcus', 'Open']]);
  const first = h.c.getTodos(h.ss, child)[0]; assert.ok(first.id);
  assert.equal(h.c.getTodos(h.ss, child)[0].id, first.id);
  assert.equal(h.write({ note: 'complete_todo', todo_id: 2 }, child).status, 'error');
  assert.equal(h.write({ note: 'complete_todo', todo_id: first.id }, child).status, 'ok');
});
test('child can request help and complete own task, cannot alter others or delete', () => {
  const h = harness(), saved = save(h); publish(h, saved);
  const id = h.sheets.ToDo.rows[1][7];
  assert.equal(h.write({ note: 'help_todo', todo_id: id }, child).status, 'ok');
  assert.equal(h.sheets.ToDo.rows[1][5], 'Needs help');
  assert.equal(h.write({ note: 'complete_todo', todo_id: id }, 'meaghanwongzx@gmail.com').status, 'error');
  assert.equal(h.write({ note: 'delete_todo', todo_id: id }, child).status, 'error');
  assert.equal(h.write({ note: 'complete_todo', todo_id: id }, child).status, 'ok');
  assert.equal(h.c.getTodos(h.ss, child).length, 0);
  assert.equal(h.c.getTodos(h.ss, child, true).length, 1);
});
test('children cannot read or write money', () => {
  const h = harness();
  const added = h.write({ note: 'add_expense', ex_desc: 'Family lunch', ex_amount: 12, ex_date: '20 Sep 2026', ex_category: 'Eating Out - Lunch', ex_account: 'Family' });
  assert.equal(added.status, 'ok');
  assert.equal(h.write({ note: 'add_expense', ex_desc: 'Snack', ex_amount: 3, ex_date: '20 Sep 2026' }, child).status, 'error');
  assert.equal(h.write({ note: 'set_budget', group: 'Eating Out', amount: 100, account: 'Family' }, child).status, 'error');
  assert.equal(h.write({ note: 'add_recurring', rec_name: 'Netflix', rec_amount: 15, rec_day: 1, rec_category: 'Entertainment - Subscriptions', rec_account: 'Family' }, child).status, 'error');
  const kidDash = h.c.getAllDashboardData(child);
  assert.equal(kidDash.expenses.total, 0);
  assert.equal(kidDash.expenses.rows.length, 0);
  assert.equal(kidDash.budgets.length, 0);
  assert.equal(kidDash.recurring.length, 0);
  assert.equal(Object.keys(kidDash.expenseGroups).length, 0);
  const parentDash = h.c.getAllDashboardData(parent);
  assert.ok(parentDash.expenses.rows.length >= 1);
});
test('children only read own tasks and cannot create tasks for other people', () => {
  const h = harness(); h.write({ note: 'add_todo', todo_task: 'Parent consent', todo_assignee: 'Marcus' });
  assert.equal(h.c.getTodos(h.ss, child).length, 0);
  assert.equal(h.write({ note: 'add_todo', todo_task: 'Do it', todo_assignee: 'Marcus' }, child).status, 'error');
});
test('children can read and complete tasks assigned to Everyone but cannot delete them', () => {
  const h = harness();
  const added = h.write({ note: 'add_todo', todo_task: 'Clean living room', todo_assignee: 'Everyone' });
  assert.equal(added.status, 'ok');
  assert.equal(h.c.getTodos(h.ss, child).length, 1);
  assert.equal(h.write({ note: 'delete_todo', todo_id: added.id }, child).status, 'error');
  assert.equal(h.write({ note: 'complete_todo', todo_id: added.id }, child).status, 'ok');
  assert.equal(h.c.getTodos(h.ss, child).length, 0);
  const completed = h.c.getTodos(h.ss, child, true);
  assert.equal(completed.length, 1);
  assert.ok(completed[0].completedRaw);
});
test('formula-like source text is stored as text, not a spreadsheet formula', () => {
  const h = harness(), p = plan(); p.tasks[0].title = '=IMPORTXML("bad")';
  publish(h, save(h, p)); assert.equal(h.sheets.ToDo.rows[1][1][0], "'");
});
test('extraction formats Gemini request with inlineData and JSON schema', () => {
  const req = buildRequest('announcement', 'image/png', 'abc', 'gemini-2.0-flash');
  assert.equal(req.generationConfig.responseMimeType, 'application/json');
  assert.equal(req.generationConfig.responseSchema.type, 'OBJECT');
  assert.equal(req.contents[0].parts[1].inlineData.mimeType, 'image/png');
  assert.equal(req.contents[0].parts[1].inlineData.data, 'abc');
  assert.ok(req.systemInstruction.parts[0].text.includes('Extract facts'));
  assert.ok(req.systemInstruction.parts[0].text.includes('day before the event date'));
});
test('extraction rejects safety blocks, truncated finish reasons and invalid outputs', () => {
  assert.throws(() => parseResponse(null));
  assert.throws(() => parseResponse({ candidates: [] }));
  assert.throws(() => parseResponse({ candidates: [{ finishReason: 'SAFETY' }] }));
  assert.throws(() => parseResponse({ candidates: [{ finishReason: 'MAX_TOKENS' }] }));
  const d = { title: 'Journey', child: '', sourceText: 'Bring water.', warnings: [], event: { title: '', date: '', time: '', endTime: '', location: '', evidence: '' }, tasks: [{ title: 'Consent', kind: 'consent', due: '', evidence: '' }] };
  const response = (data) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(data) }] } }] });
  assert.throws(() => parseResponse(response(d)));
  d.tasks = [{ title: 'Water', kind: 'packing', due: '', evidence: 'Bring water.' }];
  assert.equal(parseResponse(response(d)).tasks[0].due, '');
});
test('night-before preparation digest runs cleanly without error', () => {
  const h = harness();
  assert.doesNotThrow(() => h.c.nightlyNotifications());
});

test('edit_todo allows editing task details, respects child ownership', () => {
  const h = harness();
  const added = h.write({ note: 'add_todo', todo_task: 'Original task', todo_assignee: 'Mikaela', todo_due: '2026-09-25' });
  assert.equal(added.status, 'ok');

  // Mikaela (child) can edit her own task
  const childEdit = h.write({ note: 'edit_todo', todo_id: added.id, todo_task: 'Updated by Mikaela', todo_assignee: 'Mikaela', todo_due: '2026-09-26' }, child);
  assert.equal(childEdit.status, 'ok');
  let tasks = h.c.getTodos(h.ss, child);
  assert.equal(tasks[0].task, 'Updated by Mikaela');
  assert.equal(tasks[0].dueRaw, '2026-09-26');

  // Meaghan (another child) cannot edit Mikaela's task
  const otherChildEdit = h.write({ note: 'edit_todo', todo_id: added.id, todo_task: 'Hacked by sibling' }, 'meaghanwongzx@gmail.com');
  assert.equal(otherChildEdit.status, 'error');

  // Adult can edit any task
  const adultEdit = h.write({ note: 'edit_todo', todo_id: added.id, todo_task: 'Parent modified', todo_assignee: 'Marcus' }, parent);
  assert.equal(adultEdit.status, 'ok');
  tasks = h.c.getTodos(h.ss, parent);
  const found = tasks.find(t => t.id === added.id);
  assert.equal(found.task, 'Parent modified');
  assert.equal(found.assignee, 'Marcus');
});

test('Nat B Training generates packing checklist strictly 1 week in advance for previous day', () => {
  const h = harness();
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // Event 4 days in future: should generate tasks for 3 days in future
  const fourDays = new Date(now.getTime() + 4 * 24 * 3600 * 1000);
  const fourDaysStr = fmt(fourDays);
  const threeDaysStr = fmt(new Date(now.getTime() + 3 * 24 * 3600 * 1000));

  // Event 14 days in future: should NOT generate tasks yet (> 7 days)
  const fourteenDays = new Date(now.getTime() + 14 * 24 * 3600 * 1000);
  const fourteenDaysStr = fmt(fourteenDays);

  const mockEvents = [
    { id: 'ev_natb_soon', title: '[Mikaela] Nat B Training', dateRaw: fourDaysStr, time: '14:00' },
    { id: 'ev_natb_far', title: '[Mikaela] Nat B Training', dateRaw: fourteenDaysStr, time: '14:00' }
  ];

  h.c.syncCalendarEventTasks_(h.ss, mockEvents);

  const tasks = h.c.getTodos(h.ss, parent);
  const soonTasks = tasks.filter(t => t.sourceId.startsWith('cal_natb_ev_natb_soon'));
  const farTasks = tasks.filter(t => t.sourceId.startsWith('cal_natb_ev_natb_far'));

  assert.equal(soonTasks.length, 2);
  assert.equal(farTasks.length, 0); // Not created too far ahead of time

  const bagTask = soonTasks.find(t => t.task.includes('sailing bag'));
  const boxTask = soonTasks.find(t => t.task.includes('sailing box'));
  assert.ok(bagTask);
  assert.ok(boxTask);
  assert.equal(bagTask.dueRaw, threeDaysStr); // Scheduled for previous day
  assert.equal(boxTask.dueRaw, threeDaysStr);
  assert.equal(bagTask.assignee, 'Mikaela');

  // Idempotency: re-running sync does not duplicate
  h.c.syncCalendarEventTasks_(h.ss, mockEvents);
  const tasksAfter = h.c.getTodos(h.ss, parent);
  assert.equal(tasksAfter.filter(t => t.sourceId.startsWith('cal_natb_ev_natb_soon')).length, 2);
});

test('EYE calendar entries and extraction mention End Year Exams', () => {
  const req = buildRequest('exam notice');
  assert.ok(req.systemInstruction.parts[0].text.includes("Note that 'EYE' refers to End Year Exams."));

  const h = harness();
  // Mock calendar event with EYE in title
  const eventDate = new Date();
  eventDate.setDate(eventDate.getDate() + 10);
  h.calendarEvents.push({
    id: 'cal_eye_1',
    title: '[Mikaela] EYE - Math Paper',
    start: eventDate,
    end: eventDate,
    description: 'Bring calculator'
  });

  const events = h.c.getEvents(h.ss);
  const eyeEv = events.find(e => e.id === 'cal_eye_1');
  assert.ok(eyeEv);
  assert.equal(eyeEv.examNote, 'End Year Exams');
});

test('Habits management: seed, log habit, retrieve logs, and delete log', () => {
  const h = harness();
  const meaghanEmail = 'meaghanwongzx@gmail.com';

  // Habits sheet initializes with Meaghan's violin practice
  const habits = h.c.getHabits(h.ss);
  assert.ok(habits.length >= 1);
  const violin = habits.find(hb => hb.habit === 'Violin practice');
  assert.ok(violin);
  assert.equal(violin.member, 'Meaghan');
  assert.equal(violin.emoji, '🎻');

  // Meaghan logs her violin practice
  const logRes = h.write({
    note: 'log_habit',
    habit_id: violin.id,
    date: '2026-09-21',
    notes: 'Practiced Suzuki Book 2 pieces for 30 mins'
  }, meaghanEmail);
  assert.equal(logRes.status, 'ok');
  assert.ok(logRes.log);
  assert.equal(logRes.log.habit, 'Violin practice');
  assert.equal(logRes.log.notes, 'Practiced Suzuki Book 2 pieces for 30 mins');

  // Retrieve logs
  const logs = h.c.getHabitLogs(h.ss);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].habitId, violin.id);
  assert.equal(logs[0].date, '2026-09-21');

  // Delete habit log
  const delRes = h.write({ note: 'delete_habit_log', log_id: logs[0].id }, meaghanEmail);
  assert.equal(delRes.status, 'ok');
  assert.equal(h.c.getHabitLogs(h.ss).length, 0);

  // Adult can add a habit
  const addHabitRes = h.write({ note: 'add_habit', habit: 'Daily reading', member: 'Mikaela', emoji: '📚' }, parent);
  assert.equal(addHabitRes.status, 'ok');
  const updatedHabits = h.c.getHabits(h.ss);
  assert.ok(updatedHabits.some(hb => hb.habit === 'Daily reading'));

  // Child cannot delete a habit
  const readingHabit = updatedHabits.find(hb => hb.habit === 'Daily reading');
  const kidDel = h.write({ note: 'delete_habit', habit_id: readingHabit.id }, child);
  assert.equal(kidDel.status, 'error');

  // Adult can delete a habit
  const adultDel = h.write({ note: 'delete_habit', habit_id: readingHabit.id }, parent);
  assert.equal(adultDel.status, 'ok');
});

