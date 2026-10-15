const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{await page.goto('/parents/');await expect(page.locator('#app-screen')).toHaveClass(/active/);});
test.afterEach(async({page})=>{expect(await page.evaluate(()=>fixtureErrors)).toEqual([]);});
test('parent app has its own navigation, only parent login choices and no family data',async({page})=>{
 await expect(page.locator('.member-btn')).toHaveCount(2);await expect(page.locator('#s-home')).toContainText('Household money');
 await expect(page.locator('#s-habits')).toHaveCount(0);await expect(page.locator('#s-calendar')).toHaveCount(0);
 await expect(page.locator('[data-calendar-status]')).toHaveCount(0);await expect(page.locator('#connection-status')).toContainText('Parent details · Last refreshed');
 expect(await page.evaluate(()=>({hasEvents:'events' in data,hasRewards:'rewards' in data}))).toEqual({hasEvents:false,hasRewards:false});
 await page.locator('#nav-expenses').click();await expect(page.locator('#s-expenses')).toHaveClass(/active/);
 await page.setViewportSize({width:1440,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
test('expense saves use the existing backend and survive refresh; failed save retains the form',async({page})=>{
 const prior=await page.evaluate(()=>data.expenses.total);
 await page.evaluate(()=>{goTo('expenses');openM('m-expense');});await page.locator('#ex-desc').fill('Fixture lunch');await page.locator('#ex-date').fill(await page.evaluate(()=>schoolToday()));await page.locator('#ex-amt').fill('12.50');
 await page.locator('#ex-submit').click();await expect(page.locator('#m-expense')).not.toHaveClass(/open/);
 await expect.poll(()=>page.evaluate(()=>data.expenses.total)).toBe(prior+12.5);
 await page.reload();await expect(page.locator('#app-screen')).toHaveClass(/active/);expect(await page.evaluate(()=>data.expenses.total)).toBe(prior+12.5);
 await page.evaluate(()=>{goTo('expenses');gasRequest=async()=>({status:'error'});openM('m-expense')});await page.locator('#ex-desc').fill('Keep failed expense');await page.locator('#ex-date').fill(await page.evaluate(()=>schoolToday()));await page.locator('#ex-amt').fill('9');await page.locator('#ex-submit').click();await expect(page.locator('#m-expense')).toHaveClass(/open/);await expect(page.locator('#ex-amt')).toHaveValue('9');
});
test('a child account cannot activate the parent app',async({page})=>{await page.evaluate(()=>loginAs('Mikaela'));await expect(page.locator('#app-screen')).not.toHaveClass(/active/);await expect(page.locator('#login-error')).toContainText('only to parents');expect(await page.evaluate(()=>data.expenses)).toBeUndefined();});
test('all migrated parent screens render and modal keyboard behavior stays intact',async({page})=>{
 for(const route of ['budgets','recurring','us','fertility']){await page.evaluate(id=>goTo(id),route);await expect(page.locator('#s-'+route)).toHaveClass(/active/);}
 await page.evaluate(()=>{goTo('expenses');document.querySelector('#nav-expenses').focus();openM('m-expense')});await page.keyboard.press('Escape');await expect(page.locator('#nav-expenses')).toBeFocused();
});
test('two parent tabs delete expenses by permanent ID and Undo preserves the selected record',async({page,context})=>{
 page.on('dialog',d=>d.accept());const ids=await page.evaluate(async()=>{const ids=[];for(const name of ['P1 expense A','P1 expense B','P1 expense C']){const r=await gPost({note:'add_expense',ex_desc:name,ex_amount:1,ex_date:schoolToday(),ex_account:'Family',ex_category:'Other'});ids.push(r.id);}await loadData();goTo('expenses');return ids;});
 const other=await context.newPage();other.on('dialog',d=>d.accept());await other.goto('/parents/');await expect(other.locator('#app-screen')).toHaveClass(/active/);
 await page.evaluate(id=>{delExp(id);_flushPendingUndo();},ids[0]);
 await expect.poll(()=>page.evaluate(async id=>{await loadData();return data.expenses.rows.some(r=>r.id===id)},ids[0])).toBe(false);
 await other.evaluate(id=>{goTo('expenses');delExp(id);undoLast();},ids[1]);expect(await other.evaluate(id=>data.expenses.rows.some(r=>r.id===id),ids[1])).toBe(true);
 await other.evaluate(id=>{delExp(id);_flushPendingUndo();},ids[1]);await expect.poll(()=>other.evaluate(async id=>{await loadData();return data.expenses.rows.some(r=>r.id===id)},ids[1])).toBe(false);
 await other.reload();await expect(other.locator('#app-screen')).toHaveClass(/active/);expect(await other.evaluate(ids=>ids.map(id=>data.expenses.rows.some(r=>r.id===id)),ids)).toEqual([false,false,true]);await other.close();
});

test('parent app exposes the same session-only Loading check',async({page})=>{
 await page.evaluate(async()=>{await loadData();goTo('more')});await page.getByRole('button',{name:'Loading check',exact:false}).click();await expect(page.locator('#m-loading-check')).toHaveClass(/open/);await expect(page.locator('#loading-check-body')).toContainText('Overview ready on screen');await page.keyboard.press('Escape');await expect(page.locator('#m-loading-check')).not.toHaveClass(/open/);
});
