    // ─── EXPENSES ──────────────────────────────────────────────
    function toggleExpenseAccount(acc) { activeExpenseAccount = acc; savePreference('expenseAccount', acc); renderExpenses(); }
    function renderExpenses() {
      const exp = data.expenses || { rows: [], total: 0, byCategory: {}, history: [], lastMonthTotal: 0, familyTotal: 0, personalTotal: 0, familyByCategory: {}, personalByCategory: {}, familyHistory: [], personalHistory: [], lastMonthFamilyTotal: 0, lastMonthPersonalTotal: 0 };
      const el = document.getElementById('exp-body');
      const month = new Date().toLocaleDateString('en-SG', { month:'long', year:'numeric' });
      let total = 0, cats = [], hist = [], lastMonth = 0, filteredRows = [];
      if(activeExpenseAccount === 'Personal') {
        total = exp.personalTotal || 0; cats = Object.entries(exp.personalByCategory||{}).sort((a,b)=>b[1]-a[1]); hist = exp.personalHistory||[]; lastMonth = exp.lastMonthPersonalTotal||0; filteredRows = (exp.rows||[]).filter(r => r.account === 'Personal Account');
      } else if(activeExpenseAccount === 'Family') {
        total = exp.familyTotal || 0; cats = Object.entries(exp.familyByCategory||{}).sort((a,b)=>b[1]-a[1]); hist = exp.familyHistory||[]; lastMonth = exp.lastMonthFamilyTotal||0; filteredRows = (exp.rows||[]).filter(r => r.account !== 'Personal Account');
      } else {
        total = exp.total || 0; cats = Object.entries(exp.byCategory||{}).sort((a,b)=>b[1]-a[1]); hist = exp.history||[]; lastMonth = exp.lastMonthTotal||0; filteredRows = exp.rows||[];
      }
      if(searchExpenseQuery) {
        filteredRows = filteredRows.filter(r => (r.desc||'').toLowerCase().includes(searchExpenseQuery) || (r.category||'').toLowerCase().includes(searchExpenseQuery) || (r.account||'').toLowerCase().includes(searchExpenseQuery));
      }
      let currentPercent = 0, donutSvgCircles = '';
      cats.forEach((c,i) => {
        const amt = c[1], pct = total>0?(amt/total):0;
        const strokeDashArray = `${pct*100} ${100-(pct*100)}`, strokeDashOffset = -currentPercent*100;
        const color = PIE_COLORS[i%PIE_COLORS.length];
        donutSvgCircles += `<circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="${color}" stroke-width="5.5" stroke-dasharray="${strokeDashArray}" stroke-dashoffset="${strokeDashOffset}"></circle>`;
        currentPercent += pct;
      });
      if(cats.length === 0) donutSvgCircles = `<circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="var(--border-color)" stroke-width="5.5"></circle>`;
      let momHtml = '';
      if(lastMonth>0){ const diff=total-lastMonth, pctDiff=(diff/lastMonth)*100; if(diff>0) momHtml=`<span class="badge b-red" style="margin-left:8px;">📈 +${pctDiff.toFixed(1)}% vs last month ($${lastMonth.toFixed(0)})</span>`; else momHtml=`<span class="badge b-green" style="margin-left:8px;">📉 ${Math.abs(pctDiff).toFixed(1)}% vs last month ($${lastMonth.toFixed(0)})</span>`; } else momHtml='<span class="badge b-blue" style="margin-left:8px;">New Tracker</span>';
      const maxTotal = Math.max(...hist.map(h=>h.total),1);
      const barChartHtml = hist.map((h,i) => {
        const heightPct = (h.total/maxTotal)*100;
        const isCurrent = (i === hist.length-1);
        return `<div class="bar-col"><div class="bar-val">$${h.total.toFixed(0)}</div><div class="bar-fill ${isCurrent?'current':''}" style="height:${Math.max(heightPct,4)}%;"></div><div class="bar-lbl">${escapeHtml(h.label)}</div></div>`;
      }).join('');
      // Update DOM toggle button active class
      ['All', 'Family', 'Personal'].forEach(a => {
        const btn = document.getElementById('exp-acc-' + a);
        if (btn) {
          if (a === activeExpenseAccount) btn.classList.add('active');
          else btn.classList.remove('active');
        }
      });

      el.innerHTML = `
        <div class="card">
          <div class="card-hdr"><span class="card-title">💰 ${month}</span><div style="display:flex;align-items:center;"><span class="badge b-blue">$${(total||0).toFixed(2)}</span>${momHtml}</div></div>
          <div class="donut-container"><div class="donut-wrap"><svg viewBox="0 0 42 42" class="donut">${donutSvgCircles}<g class="chart-text"><text x="50%" y="50%" class="chart-number" style="font-size:5px;font-weight:800;">$${total.toFixed(0)}</text><text x="50%" y="64%" class="chart-label" style="font-size:2px;fill:var(--text-muted);">Total</text></g></svg></div><div class="pie-wrap" style="flex:1;padding:0;gap:6px;">${cats.slice(0,5).map((e,i)=>`<div class="pie-row"><div class="pie-dot" style="background:${PIE_COLORS[i%PIE_COLORS.length]}"></div><span class="pie-lbl" style="font-size:12px;">${escapeHtml(e[0].split(' - ').pop())}</span><span class="pie-val" style="font-size:12px;">$${e[1].toFixed(0)}</span></div>`).join('')||'<div class="empty">No expenses recorded yet.</div>'}</div></div>
        </div>
        <div class="card"><div class="card-hdr"><span class="card-title">📈 6-month trend (${activeExpenseAccount})</span></div><div class="bar-chart-wrap">${barChartHtml||'<div class="empty">No spending trend data yet.</div>'}</div></div>
        <div class="card">
          <div class="card-hdr"><span class="card-title">Recent entries</span></div>
          <div class="card-body" style="padding:12px 16px;display:flex;flex-direction:column;gap:8px;">
            ${(filteredRows||[]).slice(0, 15).map(r => {
              const emoji = getCategoryEmoji(r.desc || r.category);
              const acctClass = r.account.includes('Personal') ? 'b-amber' : 'b-blue';

              return `
                <div style="display:flex;align-items:center;background:#fff;border:1px solid #e4e6ef;border-radius:12px;padding:12px 16px;box-shadow:0 2px 6px rgba(0,0,0,0.02);gap:12px;">
                  <div style="width:36px;height:36px;border-radius:50%;background:#f8fafc;border:1px solid #e4e6ef;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">${emoji}</div>

                  <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:14px;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(r.desc || r.category)}</div>
                    <div style="font-size:12px;color:#64748b;margin-top:2px;display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;">
                      <span>${escapeHtml(r.date)}</span>
                      <span style="color:#cbd5e1;">•</span>
                      <span>${escapeHtml(r.category)}</span>
                      <span style="color:#cbd5e1;">•</span>
                      <span class="badge ${acctClass}" style="font-size:9px;padding:1px 6px;">${escapeHtml(r.account)}</span>
                    </div>
                  </div>

                  <div style="text-align:right;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
                    <div style="font-size:15px;font-weight:700;color:#1e293b;">$${r.amount.toFixed(2)}</div>
                    <button onclick="delExp(${r.rowNum})" style="color:#9898aa;font-size:12px;border:none;background:transparent;cursor:pointer;transition:color 0.2s;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#9898aa'">Delete</button>
                  </div>
                </div>
              `;
            }).join('') || '<div class="empty">No entries yet.</div>'}
          </div>
        </div>
      `;
    }
    function delExp(n) {
      const exp = data.expenses.rows.find(r => r.rowNum === n);
      if(!exp) return;
      if(!confirm('Delete expense?')) return;
      data.expenses.rows = data.expenses.rows.filter(r => r.rowNum !== n);
      data.expenses.total -= exp.amount;
      pushUndo(() => { data.expenses.rows.push(exp); data.expenses.total += exp.amount; renderExpenses(); }, 'Expense deleted', { note: 'delete_expense', row_id: n });
      renderExpenses();
    }

    // ─── BUDGETS ──────────────────────────────────────────────
    function toggleBudgetAccount(acc) {
      activeBudgetAccount = acc;
      savePreference('budgetAccount', acc);
      renderBudgets();
    }
    function renderBudgets() {
      const buds = data.budgets || [];
      const el = document.getElementById('bud-list');
      if(!el) return;
      const filteredBuds = buds.filter(b => {
        if(activeBudgetAccount === 'Personal') return b.account === 'Personal Account';
        if(activeBudgetAccount === 'Family') return b.account !== 'Personal Account';
        return true;
      });
      let budgetsHtml = '';
      if(!filteredBuds.length){ budgetsHtml = '<div class="empty"><div class="ei">📊</div>No household budget yet. Add one when you are ready.</div>'; }
      else {
        budgetsHtml = filteredBuds.sort((a,b)=>a.group.localeCompare(b.group)).map(b => {
          const pct = b.budget>0 ? Math.round(b.spent/b.budget*100) : 0;
          const over = b.spent > b.budget, warn = pct >= 80 && !over;
          const col = over?'#e05252':warn?'#d4861e':'#3aaa75';
          const cls = over?'b-red':warn?'b-amber':'b-green';
          const lbl = over?'🚨 Over':warn?'⚠️ '+pct+'%':'✅ '+pct+'%';
          return `<div class="bud-row" style="border-bottom:1px solid var(--border-color);padding:12px 0;">
            <div class="bud-hdr"><span class="bud-name">${escapeHtml(b.group)}</span><div style="display:flex;align-items:center;gap:8px;"><span class="badge ${cls}">${lbl}</span><button type="button" data-group="${escapeHtml(b.group)}" data-budget="${Number(b.budget)||0}" data-account="${escapeHtml(b.account||'Family')}" onclick="editBudget(this.dataset.group, +this.dataset.budget, this.dataset.account)" style="color:#4f86c6;font-size:14px;">✏️</button><button type="button" data-group="${escapeHtml(b.group)}" data-account="${escapeHtml(b.account||'Family')}" onclick="delBudget(this.dataset.group, this.dataset.account)" style="color:#e05252;font-size:14px;">✕</button></div></div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;">Account: ${escapeHtml(b.account||'Family')}</div>
            <div class="prog-track"><div class="prog-fill" style="width:${Math.min(pct,100)}%;background:${col};"></div></div>
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-top:4px;"><span>$${b.spent.toFixed(2)} spent</span><span>$${b.budget.toFixed(2)} budget</span></div>
          </div>`;
        }).join('');
      }
      el.innerHTML = `
        <div style="display:flex;background:var(--border-color);padding:3px;border-radius:8px;margin-bottom:16px;">
          <button class="toggle-pill ${activeBudgetAccount==='All'?'active':''}" onclick="toggleBudgetAccount('All')" style="flex:1;text-align:center;">All</button>
          <button class="toggle-pill ${activeBudgetAccount==='Family'?'active':''}" onclick="toggleBudgetAccount('Family')" style="flex:1;text-align:center;">Family</button>
          <button class="toggle-pill ${activeBudgetAccount==='Personal'?'active':''}" onclick="toggleBudgetAccount('Personal')" style="flex:1;text-align:center;">Personal</button>
        </div>
        ${budgetsHtml}
      `;
    }
    function editBudget(group, amount, account) {
      document.getElementById('bud-grp').value = group;
      document.getElementById('bud-amt').value = amount;
      document.getElementById('bud-account').value = account;
      openM('m-budget');
    }
    async function delBudget(group, account) {
      if(!confirm('Delete budget for '+group+' under '+account+'?')) return;
      if (!await saveConfirmed({ note:'delete_budget', group, account })) return;
      toast('Budget deleted');
      await loadData();
      renderBudgets();
    }

    // ─── RECURRING ──────────────────────────────────────────────
    function renderRecurring() {
      const items = data.recurring || [];
      const el = document.getElementById('rec-list');
      if(!items.length){ el.innerHTML = '<div class="empty"><div class="ei">🔄</div>No recurring expenses</div>'; return; }

      const totalCommitted = items.reduce((acc, curr) => acc + curr.amount, 0);
      const sfx = d => d===1?'st':d===2?'nd':d===3?'rd':'th';

      const committedBannerHtml = `
        <div style="background:linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);border:1.5px solid #bfdbfe;border-radius:12px;padding:16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 2px 6px rgba(59, 130, 246, 0.05);">
          <div>
            <div style="font-size:11px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.5px;">Committed Spending</div>
            <div style="font-size:22px;font-weight:800;color:#1e40af;margin-top:2px;">$${totalCommitted.toFixed(2)}<span style="font-size:12px;font-weight:500;color:#3b82f6;margin-left:4px;">/ month</span></div>
          </div>
          <div style="font-size:28px;">🔄</div>
        </div>
      `;

      const itemsHtml = `
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${items.map(r => {
            const w = r.daysLeft===0
              ? '<span class="badge b-red">Today</span>'
              : r.daysLeft===1
                ? '<span class="badge b-amber">Tomorrow</span>'
                : `<span class="badge b-gray">In ${r.daysLeft}d</span>`;

            const initial = r.name.trim().charAt(0).toUpperCase() || 'R';

            return `
              <div class="card" style="display:flex;align-items:center;background:var(--bg-card);border:1.5px solid var(--border-color);border-radius:12px;padding:12px 16px;box-shadow:0 2px 6px rgba(0,0,0,0.02);gap:12px;margin-bottom:0;">
                <div style="width:36px;height:36px;border-radius:50%;background:#e8f0fb;color:#3a6fa8;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;flex-shrink:0;">${initial}</div>

                <div style="flex:1;min-width:0;">
                  <div style="font-weight:600;font-size:14px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(r.name)}</div>
                  <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">
                    ${escapeHtml(r.category)} · Due on ${r.day}${sfx(r.day)}
                  </div>
                </div>

                <div style="text-align:right;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
                  <div style="font-size:15px;font-weight:700;color:var(--text-primary);">$${r.amount.toFixed(2)}</div>
                  <div style="display:flex;align-items:center;gap:6px;">
                    ${w}
                    <button onclick="delRec(${r.rowNum})" style="color:var(--text-muted);font-size:16px;padding:4px;border:none;background:transparent;cursor:pointer;transition:color 0.2s;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='var(--text-muted)'">🗑️</button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;

      el.innerHTML = committedBannerHtml + itemsHtml;
    }
    function delRec(n) {
      const rec = data.recurring.find(r => r.rowNum === n);
      if(!rec) return;
      if(!confirm('Remove recurring expense?')) return;
      data.recurring = data.recurring.filter(r => r.rowNum !== n);
      pushUndo(() => { data.recurring.push(rec); renderRecurring(); }, 'Recurring removed', { note:'delete_recurring', row_num:n });
      renderRecurring();
    }
