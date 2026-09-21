const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the production drag handlers with controlled asynchronous API results.
const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
const handlers = source.slice(source.indexOf('    let draggedEventId = null;'), source.indexOf('    // ─── CALENDAR YEAR VIEW'));
function setup(post) {
  const messages = [], errors = [], requests = [];
  const event = { id: 'event-1', dateRaw: '2026-09-23', date: '23 Sep 2026' };
  const context = vm.createContext({
    data: { events: [event] }, isAdultUser: true,
    document: { querySelectorAll: () => [] },
    fmtDate: d => d, renderCal() {}, renderHome() {},
    toast: m => messages.push(m), showError: m => errors.push(m),
    gPost: async request => { requests.push(request); return post(request); }
  });
  vm.runInContext(handlers, context);
  const classes = { add() {}, remove() {} };
  const start = () => context.onDragStart({ preventDefault() {}, target: { closest: () => ({ dataset: { eventId: event.id }, classList: classes }) }, dataTransfer: { setData() {} } });
  const drop = (day = '2026-09-24') => context.onDrop({ preventDefault() {}, target: { closest: () => day === null ? null : ({ dataset: { date: day }, classList: classes }) } });
  return { context, event, start, drop, messages, errors, requests };
}

test('calendar remains unchanged until server confirms, then updates refreshed data', async () => {
  let resolve;
  const h = setup(() => new Promise(r => { resolve = r; }));
  h.start(); const pending = h.drop();
  assert.equal(h.event.dateRaw, '2026-09-23'); assert.equal(h.messages.length, 0);
  h.context.data.events = [{ ...h.event }]; // Refresh while save is pending.
  h.context.onDragEnd({ target: { closest: () => null } });
  resolve({ status: 'ok' }); await pending;
  assert.equal(h.context.data.events[0].dateRaw, '2026-09-24');
  assert.equal(h.messages.length, 1); assert.equal(h.errors.length, 0);
});

test('rejections, missing responses and network failures never claim success', async () => {
  for (const result of [{ status: 'error', message: 'Rejected' }, null, {} , new Error('Offline')]) {
    const h = setup(() => { if (result instanceof Error) throw result; return result; });
    h.start(); await h.drop();
    assert.equal(h.event.dateRaw, '2026-09-23'); assert.equal(h.messages.length, 0); assert.equal(h.errors.length, 1);
    // Failed moves release the pending guard for a deliberate retry.
    h.start(); await h.drop(); assert.equal(h.requests.length, 2);
  }
});

test('school events and children cannot submit calendar moves', async () => {
  for (const school of [true, false]) {
    const h = setup(() => ({ status: 'ok' }));
    if (school) h.event.sourceId = 'school-1'; else h.context.isAdultUser = false;
    h.start(); await h.drop();
    assert.equal(h.requests.length, 0); assert.equal(h.errors.length, 1);
    // Also defend the drop boundary if state changes after a drag begins.
    vm.runInContext("draggedEventId = 'event-1'", h.context); await h.drop();
    assert.equal(h.requests.length, 0); assert.equal(h.event.dateRaw, '2026-09-23');
  }
});

test('same-day, outside-grid and stale drags make no request', async () => {
  const h = setup(() => ({ status: 'ok' }));
  h.start(); await h.drop('2026-09-23');
  h.start(); await h.drop(null);
  h.start(); h.context.onDragEnd({ target: { closest: () => null } }); await h.drop();
  assert.equal(h.requests.length, 0);
});

test('another drag cannot race a pending move of the same event', async () => {
  let resolve;
  const h = setup(() => new Promise(r => { resolve = r; }));
  h.start(); const pending = h.drop();
  h.start(); await h.drop('2026-09-25');
  assert.equal(h.requests.length, 1);
  resolve({ status: 'ok' }); await pending;
  assert.equal(h.event.dateRaw, '2026-09-24');
});
