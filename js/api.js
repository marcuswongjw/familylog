    // ─── DATA FETCH / WRITE (POST only — never put idToken in URL) ──
    /**
     * Single GAS transport: Firebase ID token in JSON body only (no JSONP query strings).
     * @param {object} body  Must include action: 'get_all' | 'write' (writes also use note)
     */
    async function gasRequest(body) {
      const account = currentUserEmail, generation = sessionGeneration;
      const active = () => account === currentUserEmail && generation === sessionGeneration;
      if(navigator.onLine===false){const message='You are offline. Changes are not queued; reconnect and try again.';showError(message);return {status:'error',message};}
      startProgressBar();
      try {
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) { showError('Please log in'); return null; }
        const signal = AbortSignal.timeout(body.action === 'write' ? 120000 : 45000);
        const idToken = await tokenWithDeadline(currentUser,signal);
        if (!active()) return null;
        lastIdToken = idToken;
        const payload = Object.assign({}, body, {
          idToken: idToken,
          user: user || 'Unknown'
        });
        const endpoint = typeof FAMILY_GAS_URL !== 'undefined' && FAMILY_GAS_URL && !(typeof isParentApp === 'function' && isParentApp()) && body.note !== 'configure_reminder_bridge' ? FAMILY_GAS_URL : GAS_URL;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
          signal
        });
        if (!active()) return null;
        let r;
        try {
          r = await response.json();
        } catch (parseErr) {
          if (active()) showError('Invalid server response');
          return null;
        }
        if (!active()) return null;
        if (!response.ok) { showError('Server unavailable. Your changes were not confirmed.'); return null; }
        if (r && r.status === 'error') {
          showError('Server error: ' + (r.message || 'unknown'));
          return r; // keep message for callers
        }
        return r;
      } catch (err) {
        if (!active()) return null;
        const message = err.name === 'TimeoutError' || err.name === 'AbortError' ? 'The server took too long to respond. Please try again.' + (body.action === 'write' ? ' Any save is unconfirmed.' : '') : 'Could not connect to the family server. Please try again.';
        showError(message);
        return {status:'error',message};
      } finally {
        finishProgressBar();
      }
    }

    /** Merge intimacy entries by id so a successful save is never wiped by a lagging get_all. */
    function mergeIntimacyLogs(prev, next) {
      const prevList = Array.isArray(prev) ? prev : [];
      const nextList = Array.isArray(next) ? next : null;
      if (!nextList) return prevList.slice();
      const byId = new Map();
      // Local first, then server overwrites same id (server is source of truth for shared fields)
      prevList.forEach(e => { if (e && e.id) byId.set(String(e.id), e); });
      nextList.forEach(e => { if (e && e.id) byId.set(String(e.id), e); });
      // Also keep local-only optimistic rows (local_*) even if server list is empty
      const merged = Array.from(byId.values());
      merged.sort((a, b) => {
        const dr = String(b.dateRaw || '').localeCompare(String(a.dateRaw || ''));
        if (dr) return dr;
        return String(b.timestamp || '').localeCompare(String(a.timestamp || ''));
      });
      return merged;
    }

    function applyDashboardPayload(r) {
      if (!r) return;
      // Do not clobber dashboard with a bare error payload
      if (r.status === 'error' && !r.events && !r.intimacyLog) return;
      // Firebase-owned fields: never accept from GAS (even if old deploy sends them)
      const prevMems = Array.isArray(data.memories) ? data.memories : [];
      data = r || {};
      data.memories = prevMems;
      // Accepted dashboard responses replace private lists; never retain old-account entries.
      data.intimacyLog = Array.isArray(r.intimacyLog) ? r.intimacyLog : [];
      if (r.expenseGroups) GROUPS = r.expenseGroups;
      if (r.bucketList) bucketList = r.bucketList;
      // Server denial wins; a response cannot promote a known child account.
      if (typeof r.isAdult === 'boolean') setAdultAccess(r.isAdult && ADULT_EMAILS.includes(String(currentUserEmail || '').toLowerCase()));
      else setAdultAccess(ADULT_EMAILS.includes(String(currentUserEmail || '').toLowerCase()));
      if (!isAdultUser) {
        ['expenses','budgets','fertility','recurring','appreciations','loveCheckins','intimacyLog','bucketList','schoolPlans','activityLog'].forEach(key => { data[key] = key === 'expenses' ? {total:0,rows:[]} : []; });
        GROUPS = {}; bucketList = [];
      }
      nestFilterChildData();
      if (_pendingUndo?.payload?.note === 'delete_event' && _pendingUndo.account === currentUserEmail) {
        data.events = (data.events || []).filter(e => e.id !== _pendingUndo.payload.event_id);
      }
      const warning = document.getElementById('data-warning');
      if (warning) {
        const messages = [...(Array.isArray(data.dataWarnings) ? data.dataWarnings : [])];
        if (data.preparationState === 'error') messages.push('Calendar loaded, but preparation tasks could not refresh. Please try refreshing again.');
        warning.textContent = messages.join(' '); warning.hidden = !messages.length;
      }
      if(typeof updateDeletionStatus==='function')updateDeletionStatus();
      buildDynamicSelectors();
      render(section);
      renderHome();
    }

    /** Sheets-backed dashboard only (not memories). */
    async function loadData() {
      if(typeof updateDeletionStatus==='function')updateDeletionStatus();
      const account = currentUserEmail, session = sessionGeneration, request = ++dashboardGeneration;
      const active=()=>account===currentUserEmail&&session===sessionGeneration&&request===dashboardGeneration;
      if(typeof setRewardLoadState==='function')setRewardLoadState(true);
      let timer;
      try {
        const timeout=new Promise(resolve=>{timer=setTimeout(()=>resolve({status:'error',message:'The family server took too long to respond. Please try again.'}),45000);});
        const r=await Promise.race([gasRequest({action:typeof isParentApp==='function'&&isParentApp()?'get_parent_dashboard':'get_family_core'}),timeout]);
        if(!active())return false;
        if(!r||r.status==='error') {
          if(data.calendarState === 'loading') { data.calendarState = 'error'; render(section); renderHome(); }
          if(typeof setRewardLoadState==='function')setRewardLoadState(false,r?.message||'Could not load your companions. Check your connection and try again.');
          return false;
        }
        if(typeof setRewardLoadState==='function')setRewardLoadState(false,r.rewards?.members?.some(p=>p.member===user)?'':'The server did not return your companion data. Please try again.');
        const needsCalendar = !Object.prototype.hasOwnProperty.call(r, 'events') && !(typeof isParentApp === 'function' && isParentApp());
        if (needsCalendar) { r.events = data.events || []; r.calendarState = 'loading'; }
        applyDashboardPayload(r);
        if (needsCalendar) hydrateFamilyCalendar(active);
        if(typeof markDashboardRefreshed==='function')markDashboardRefreshed();
        return true;
      } catch(err) {
        if(active()) {
          if(data.calendarState === 'loading') { data.calendarState = 'error'; render(section); renderHome(); }
          if(typeof setRewardLoadState==='function')setRewardLoadState(false,'Could not load your companions. Please try again.');
          showError('Could not refresh the family plan. Please try again.');
        }
        return false;
      } finally { clearTimeout(timer); }
    }

    async function hydrateFamilyCalendar(active) {
      let timer;
      try {
        const timeout = new Promise(resolve => { timer = setTimeout(() => resolve({status:'error'}),45000); });
        const result = await Promise.race([gasRequest({action:'get_family_calendar'}),timeout]);
        // Only the current request may finish loading or replace calendar/task data.
        if (!active()) return;
        if (!result || result.status === 'error') {
          data.calendarState = 'error';
          render(section); renderHome();
          return;
        }
        applyDashboardPayload(Object.assign({}, data, result, {calendarState:'ready'}));
      } catch (err) {
        if (active()) { data.calendarState = 'error'; render(section); renderHome(); }
      } finally { clearTimeout(timer); }
    }

    function restartPendingCalendar(account, session) {
      if (account !== currentUserEmail || session !== sessionGeneration || data.calendarState !== 'loading') return;
      const request = dashboardGeneration;
      hydrateFamilyCalendar(() => account === currentUserEmail && session === sessionGeneration && request === dashboardGeneration);
    }

    async function saveConfirmed(payload) {
      const account = currentUserEmail, session = sessionGeneration;
      const result = await gPost(payload);
      return account === currentUserEmail && session === sessionGeneration && !!result && result.status === 'ok';
    }

    /** GAS write for Sheets-owned features. Do not use for memories. */
    async function gPost(payload) {
      const account = currentUserEmail, session = sessionGeneration;
      const note = String((payload && payload.note) || '').toLowerCase();
      if (note === 'add_chat_message' || note === 'add_memory') {
        console.error('gPost blocked: ' + note + ' is not Sheets-owned (see ARCHITECTURE.md)');
        return Promise.resolve({
          status: 'error',
          message: note + ' is not available'
        });
      }
      dashboardGeneration++;
      try {
        payload = await retrySafePayload(payload || {},account);
        if (account !== currentUserEmail || session !== sessionGeneration) return null;
        const result = await gasRequest(Object.assign({ action: 'write' }, payload));
        if (account !== currentUserEmail || session !== sessionGeneration) return null;
        if (result?.status === 'ok') confirmOperation(payload);
        return result;
      } finally {
        if (account === currentUserEmail && session === sessionGeneration) {
          dashboardGeneration++;
          // The old hydration was invalidated at save start, including failed saves.
          restartPendingCalendar(account, session);
        }
      }
    }

    // Back-compat alias
    async function postWrite(payload) {
      return gPost(payload);
    }


function tokenWithDeadline(currentUser,signal){
 if(!signal.addEventListener)return currentUser.getIdToken();
 return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason||new Error('Authentication timed out'));if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});Promise.resolve().then(()=>currentUser.getIdToken()).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
}
