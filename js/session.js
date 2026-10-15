    // Resolve persistence before observing restored accounts or allowing a new sign-in.
    let accountSessionReady = null, accountStateHandler = null, accountObserver = null;
    function familyAccount(email) {
      return MEMBERS.find(member => member.email === String(email || '').toLowerCase());
    }
    function initializeAccountSession(handler) {
      accountStateHandler = handler;
      return prepareAccountSession();
    }
    function prepareAccountSession() {
      if (!accountSessionReady) {
        const pending = firebase.auth().setPersistence(loadPreference('rememberDevice', 'false') === 'true' ? 'local' : 'session')
          .then(() => { if (!accountObserver) accountObserver = firebase.auth().onAuthStateChanged(accountStateHandler); });
        accountSessionReady = pending;
        pending.catch(() => { if (accountSessionReady === pending) accountSessionReady = null; });
      }
      return accountSessionReady;
    }
    function loginFailureMessage(error) {
      if (error?.code === 'auth/network-request-failed') return 'Could not connect. Check your connection and try again.';
      if (error?.code === 'auth/too-many-requests') return 'Too many sign-in attempts. Please wait a little and try again.';
      if (['auth/wrong-password','auth/invalid-credential','auth/invalid-login-credentials','auth/user-not-found','auth/user-disabled'].includes(error?.code)) return 'Could not sign in. Check your password or PIN and try again.';
      return 'Could not sign in. Please try again. If this continues, allow browser storage for this site.';
    }
    function rejectAccount(message) {
      clearSessionState();
      document.getElementById('app-screen').classList.remove('active');
      document.getElementById('login-screen').classList.add('active');
      document.getElementById('login-error').textContent = message;
      firebase.auth().signOut().catch(() => showError('Could not sign out. Please reload and try again.'));
    }
    function clearSessionState() {
      if(typeof resetNestPerformance==='function')resetNestPerformance();
      if(typeof resetConnectionStatus==='function')resetConnectionStatus();
      sessionGeneration++; dashboardGeneration++;
      if(typeof closeFamilyArchive==='function')closeFamilyArchive(false);
      if(typeof resetHabitWeekCache==='function')resetHabitWeekCache();
      if(typeof resetTaskHistory==='function')resetTaskHistory(true);
      if (_pendingUndo) { clearTimeout(_pendingUndo.timer); _pendingUndo = null; }
      resetRewards(); schoolReset(); schoolDay = '';
      resetMemorySession();
      resetReminders();
      stopMemoriesListener();
      if(typeof resetMemoryDatabase==='function')resetMemoryDatabase();
      if (timelineInterval) { clearInterval(timelineInterval); timelineInterval = null; }
      const warning = document.getElementById('data-warning');
      if (warning) { warning.textContent = ''; warning.hidden = true; }
      const deletionStatus=document.getElementById('deletion-status');if(deletionStatus){deletionStatus.hidden=true;deletionStatus.textContent='';}
      user = null; currentUserEmail = ''; lastIdToken = ''; isAdultUser = false;
      const password=document.getElementById('login-password');if(password)password.value='';
      habitViewDate = ''; habitShowArchived = false; habitPerson = 'All'; habitLayout = 'cards'; pendingHabitLogs.clear();
      data = { memories: [] }; GROUPS = {}; bucketList = []; memImageBase64 = null;
      document.body.classList.add('is-child');
      document.querySelectorAll('.overlay').forEach(el => el.classList.remove('open'));
      if(typeof toggleMenuDrawer==='function')toggleMenuDrawer(false);
      if(typeof modalOrigins!=='undefined')modalOrigins.clear();
      document.querySelectorAll('.overlay input, .overlay textarea, #fert-notes').forEach(el => {
        if (el.type !== 'checkbox' && el.type !== 'radio') el.value = '';
      });
      ['us-container','fert-body','bud-list','rec-list','exp-body','dash-summary','school-home','mem-list'].forEach(id => {
        const el = document.getElementById(id); if (el) el.innerHTML = '';
      });
    }
    function logout() {
      savePreference('rememberDevice', 'false');
      clearSessionState();
      document.getElementById('app-screen').classList.remove('active');
      document.getElementById('login-screen').classList.add('active');
      document.getElementById('login-password').value = '';
      document.getElementById('login-error').textContent = '';
      document.getElementById('login-remember').checked = false;
      selectedMember = null;
      document.querySelectorAll('.member-btn').forEach(b => b.classList.remove('sel'));
      document.getElementById('pinbox').style.display = 'none';
      firebase.auth().signOut().catch(() => showError('Could not sign out. Please reload and try again.'));
    }
