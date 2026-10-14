/* Parent app presentation. Same accounts and server-owned records, separate origin/session. */
function renderParentHome(){
 updateNestShell();const root=document.querySelector('#s-home .sec-body');if(!root)return;
 const expense=data.expenses||{},budgets=data.budgets||[],recurring=data.recurring||[];
 root.innerHTML=`<div class="greet"><span class="nest-kicker">A PRIVATE CORNER FOR US</span><h2>Hello, ${escapeHtml(user||'parent')}.</h2><p>Household money, time together and personal wellbeing.</p></div>
 <div class="parent-overview"><button class="dash-stat" onclick="goTo('expenses')"><span class="num">$${Number(expense.total||0).toFixed(2)}</span><span class="lbl">This month’s expenses</span><small>View household and personal spending</small></button><button class="dash-stat" onclick="goTo('budgets')"><span class="num">${budgets.length}</span><span class="lbl">Budget categories</span><small>Plan the month</small></button><button class="dash-stat" onclick="goTo('recurring')"><span class="num">${recurring.length}</span><span class="lbl">Recurring costs</span><small>Keep regular payments in sight</small></button></div>
 <div class="parent-spaces">${[['us','Just us','Appreciations, check-ins and shared plans.'],['fertility','Wellbeing','Your cycle notes and personal records.']].map(([id,title,copy])=>`<button class="more-tile" onclick="goTo('${id}')"><span class="mi">${nestIcon(id)}</span><span class="ml">${title}</span><span class="nest-tile-description">${copy}</span></button>`).join('')}</div>
 <a class="btn btn-s cross-app-link" href="https://family.marcusw.xyz/">Open Wong’s Nest →</a>`;
}
