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
test('consent and payment cannot be assigned to a child', () => {
  for (const kind of ['consent', 'payment']) {
    const h = harness(), p = plan(); p.tasks[0].kind = kind;
    assert.equal(save(h, p).status, 'error');
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
});
test('formula-like source text is stored as text, not a spreadsheet formula', () => {
  const h = harness(), p = plan(); p.tasks[0].title = '=IMPORTXML("bad")';
  publish(h, save(h, p)); assert.equal(h.sheets.ToDo.rows[1][1][0], "'");
});
test('extraction sends images as data and requests strict non-stored structured output', () => {
  const req = buildRequest('announcement', 'data:image/png;base64,abc', 'test-model');
  assert.equal(req.store, false); assert.equal(req.text.format.strict, true);
  assert.equal(req.input[0].content[1].type, 'input_image'); assert.equal(req.tools, undefined);
});
test('extraction rejects refusal, truncated output and unsupported tasks', () => {
  assert.throws(() => parseResponse({ status: 'incomplete' }));
  assert.throws(() => parseResponse({ status: 'completed', output: [{ content: [{ type: 'refusal' }] }] }));
  const d = { title: 'Journey', child: '', sourceText: 'Bring water.', warnings: [], event: { title: '', date: '', time: '', endTime: '', location: '', evidence: '' }, tasks: [{ title: 'Consent', kind: 'consent', due: '', evidence: '' }] };
  const response = () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(d) }] }] });
  assert.throws(() => parseResponse(response()));
  d.tasks = [{ title: 'Water', kind: 'packing', due: '', evidence: 'Bring water.' }];
  assert.equal(parseResponse(response()).tasks[0].due, '');
});
