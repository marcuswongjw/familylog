'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const { harness } = require('./helpers/gas-harness.cjs');

test('activity log records task additions, completions and habit logs in ActivityLog sheet', () => {
  const h = harness();
  
  // 1. Add a task
  const addRes = h.write({
    note: 'add_todo',
    todo_task: 'Complete homework',
    todo_assignee: 'Mikaela',
    todo_stars: 3,
    operation_id: crypto.randomUUID()
  });
  assert.equal(addRes.status, 'ok');

  // Verify ActivityLog sheet has recorded the action
  assert.ok(h.sheets.ActivityLog, 'ActivityLog sheet was created');
  const rows = h.sheets.ActivityLog.rows;
  assert.ok(rows.length >= 2, 'Header + at least one activity row');
  const lastAdd = rows[rows.length - 1];
  assert.equal(lastAdd[2], 'task_add');
  assert.equal(lastAdd[3], 'Tasks');
  assert.match(lastAdd[4], /added task: "Complete homework"/);

  // 2. Complete the task
  const doneRes = h.write({
    note: 'complete_todo',
    todo_id: addRes.id
  });
  assert.equal(doneRes.status, 'ok');
  const lastDone = rows[rows.length - 1];
  assert.equal(lastDone[2], 'task_done');
  assert.equal(lastDone[3], 'Tasks');
  assert.match(lastDone[4], /completed task: "Complete homework"/);
});

test('getAllDashboardData provides activityLog for adult and hides for child', () => {
  const h = harness();
  
  // Add a task as parent
  h.write({
    note: 'add_todo',
    todo_task: 'Feed pets',
    todo_assignee: 'Meaghan',
    operation_id: crypto.randomUUID()
  });

  const adultData = h.c.getAllDashboardData('marcuswongjw@gmail.com');
  assert.ok(Array.isArray(adultData.activityLog), 'adult receives activityLog array');
  assert.ok(adultData.activityLog.length > 0, 'activityLog contains entries');
  assert.equal(adultData.activityLog[0].category, 'Tasks');

  const childData = h.c.getAllDashboardData('mikaelawonght@gmail.com');
  assert.equal(childData.activityLog.length, 0, 'child receives empty activityLog array');
});

test('client clears activityLog when child session is active', () => {
  const c = vm.createContext({
    currentUserEmail: 'mikaelawonght@gmail.com',
    isAdultUser: false,
    sessionGeneration: 1,
    dashboardGeneration: 1,
    section: 'home',
    ADULT_EMAILS: ['marcuswongjw@gmail.com', 'eleanor.jiamin@gmail.com'],
    FAMILY_MEMBERS: ['Marcus', 'Eleanor', 'Mikaela', 'Meaghan', 'Everyone'],
    data: {},
    GROUPS: {},
    bucketList: [],
    _pendingUndo: null,
    setAdultAccess(val) { c.isAdultUser = val; },
    nestFilterChildData() {},
    buildDynamicSelectors() {},
    render() {},
    renderHome() {}
  });

  const apiCode = fs.readFileSync('js/api.js', 'utf8');
  vm.runInContext(apiCode, c);

  c.applyDashboardPayload({
    status: 'ok',
    isAdult: false,
    activityLog: [{ timestamp: new Date().toISOString(), description: 'Parent activity' }],
    todos: []
  });

  assert.equal(c.data.activityLog.length, 0, 'child dashboard clears activityLog');
});
