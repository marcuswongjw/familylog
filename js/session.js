    function clearSessionState() {
      if(typeof resetConnectionStatus==='function')resetConnectionStatus();
      sessionGeneration++; dashboardGeneration++;
      if (_pendingUndo) { clearTimeout(_pendingUndo.timer); _pendingUndo = null; }
      resetRewards(); schoolReset(); schoolDay = '';
      resetMemorySession();
      resetReminders();
      stopMemoriesListener();
      if (timelineInterval) { clearInterval(timelineInterval); timelineInterval = null; }
      user = null; currentUserEmail = ''; lastIdToken = ''; isAdultUser = false;
      habitViewDate = ''; habitShowArchived = false; habitPerson = 'All'; habitLayout = 'cards'; pendingHabitLogs.clear();
      data = { memories: [] }; GROUPS = {}; bucketList = []; memImageBase64 = null;
      document.body.classList.add('is-child');
      document.querySelectorAll('.overlay').forEach(el => el.classList.remove('open'));
      if(typeof modalOrigins!=='undefined')modalOrigins.clear();
      document.querySelectorAll('.overlay input, .overlay textarea, #fert-notes').forEach(el => {
        if (el.type !== 'checkbox' && el.type !== 'radio') el.value = '';
      });
      ['us-container','fert-body','bud-list','rec-list','exp-body','dash-summary','school-home','mem-list'].forEach(id => {
        const el = document.getElementById(id); if (el) el.innerHTML = '';
      });
    }
    function logout() {
      clearSessionState();
      document.getElementById('app-screen').classList.remove('active');
      document.getElementById('login-screen').classList.add('active');
      document.getElementById('login-password').value = '';
      document.getElementById('login-error').textContent = '';
      selectedMember = null;
      document.querySelectorAll('.member-btn').forEach(b => b.classList.remove('sel'));
      document.getElementById('pinbox').style.display = 'none';
      firebase.auth().signOut().catch(() => showError('Could not sign out. Please reload and try again.'));
    }
