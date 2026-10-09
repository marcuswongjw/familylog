    // ─── DATA OWNERSHIP (see ARCHITECTURE.md) ───────────────────
    // Firebase  → Auth, Memories, Storage images, FCM tokens
    // GAS/Sheets → expenses, budgets, todos, calendar, birthdays, travel,
    //              fertility, Us (check-ins, appreciations, intimacy, bucket list)
    // Never dual-write the same feature to both backends.
    const DATA_OWNERS = {
      firebase: ['auth', 'memories', 'storage', 'fcm', 'schoolSourceImages'],
      sheets: [
        'events', 'todos', 'schoolPlans', 'schoolTasks', 'expenses', 'budgets', 'birthdays', 'fertility',
        'recurring', 'travel', 'appreciations', 'loveCheckins', 'intimacyLog', 'bucketList', 'habits', 'habitLogs', 'rewards'
      ]
    };

    // ─── FIREBASE CONFIG ────────────────────────────────────────
    const firebaseConfig = {
      apiKey: "AIzaSyAapGliVr1bcKa5ESvIPpT1VvPIHb0uwD0",
      authDomain: "familylog-86db6.firebaseapp.com",
      projectId: "familylog-86db6",
      storageBucket: "familylog-86db6.firebasestorage.app",
      messagingSenderId: "171956350431",
      appId: "1:171956350431:web:6094e6bafb0bb849ed286a",
      measurementId: "G-HCHV787ZPJ"
    };
    const VAPID_KEY = 'BAs6TNKZd4jhJwSXah-Q5DQtVG0h0uaoQmopSBG9gu1AtvaHRKqAeG8ZvW3Og2PrJpLz_VxXoxzhvS5nrbt6HUU';

    const GAS_URL = 'https://script.google.com/macros/s/AKfycbwQzpqQRRnK_PJRIbKWvPRhFVrQbfLEORciIRijBSwiz7WkX-7Ik2vTrZzE9VZ7Nehr/exec';

    const MEMBERS = [
      { name:'Marcus',  emoji:'👨', email:'marcuswongjw@gmail.com' },
      { name:'Eleanor', emoji:'👩', email:'eleanor.jiamin@gmail.com' },
      { name:'Mikaela', emoji:'👧', email:'mikaelawonght@gmail.com' },
      { name:'Meaghan', emoji:'👧', email:'meaghanwongzx@gmail.com' },
    ];
    const FAM = ['Mikaela','Meaghan','Eleanor','Marcus','Everyone'];
    const PIE_COLORS = ['#4f86c6','#3aaa75','#e05252','#d4861e','#7c5cbf','#2fb5b5','#e07b3a','#5aa832','#c05090','#888'];
    let GROUPS = {};

    let _callbackId = 0;
    let db, storage, messaging; // will be set after Firebase init

    // ─── PERSISTENT PREFERENCES ──────────────────────────────────
    function loadPreference(key, fallback) {
      try { const val = localStorage.getItem('wf_'+key); return val !== null ? val : fallback; } catch(e){return fallback;}
    }
    function savePreference(key, value) {
      try { localStorage.setItem('wf_'+key, String(value)); } catch(e){}
    }

    // ─── STATE ───
    let user = null;
    let section = 'home';
    let data = {};
    let currentUserEmail = '';
    let sessionGeneration = 0;
    let dashboardGeneration = 0;
    let selectedMember = null;
    let timelineInterval = null;
    let memImageBase64 = null;
    let lastIdToken = '';   // cached Firebase token for beacon-style requests
    // Parents only for Us / fertility (server also enforces). Default conservative until get_all.
    const ADULT_EMAILS = ['marcuswongjw@gmail.com', 'eleanor.jiamin@gmail.com'];
    let isAdultUser = false;

    // Firestore listeners — memories never come from GAS/Sheets
    let memoriesUnsubscribe = null;

    // Notifications
    let notificationsEnabled = false;

    // Calendar state
    let calView = loadPreference('calView', 'week');
    let calYear = new Date().getFullYear();
    let calMonth = new Date().getMonth();
    let selectedCalDayStr = loadPreference('selectedCalDay', localDateStr());
    let calWeekStart = getStartOfWeek(new Date());
    let weekPersonFilter = loadPreference('weekPerson', 'All');

    // Expense & Budget filters
    let activeExpenseAccount = loadPreference('expenseAccount', 'All');
    let activeBudgetAccount = loadPreference('budgetAccount', 'All');

    // Schedules state
    let schedView = loadPreference('schedView', 'list');
    let activeSchedChild = loadPreference('schedChild', 'Mikaela');
    let schedYear = new Date().getFullYear();
    let schedMonth = new Date().getMonth();
    let selectedGridDayStr = localDateStr();

    // Search queries
    let searchTaskQuery = '';
    let searchExpenseQuery = '';
    let searchCalQuery = '';

    // Bucket List
    let bucketList = [];

    // ─── DARK MODE ─────────────────────────────────────────────
    function toggleDarkMode() {
      document.body.classList.toggle('dark-mode');
      const isDark = document.body.classList.contains('dark-mode');
      savePreference('darkMode', isDark ? 'dark' : 'light');
      updateNestThemeIcon();
    }
    function applyDarkMode() {
      const pref = loadPreference('darkMode', 'light');
      if (pref === 'dark') {
        document.body.classList.add('dark-mode');
        updateNestThemeIcon();
      } else {
        document.body.classList.remove('dark-mode');
        updateNestThemeIcon();
      }
    }

    // ─── INIT ──────────────────────────────────────────────────
    window.addEventListener('DOMContentLoaded', () => {
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
      storage = firebase.storage();
      try { messaging = firebase.messaging(); } catch (_) { messaging = null; }

      // Enable offline persistence (optional)
      db.enablePersistence().catch(() => {});

      applyDarkMode();
      buildLogin();
      buildModals();
      buildMore();
      initModalAccess();
      initConnectionStatus();
      // Restore views
      document.querySelectorAll('.toggle-pill').forEach(p => p.classList.remove('active'));
      const viewBtn = document.getElementById('cal-view-'+calView);
      if (viewBtn) viewBtn.classList.add('active');
      const schedBtn = document.getElementById('sched-view-'+schedView);
      if (schedBtn) schedBtn.classList.add('active');
      const pill = document.getElementById('pill-'+activeSchedChild);
      if (pill) pill.classList.add('active');

      // Service worker (for FCM + notification click)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('firebase-messaging-sw.js')
          .then((registration) => {
            console.log('✅ FCM Service Worker registered');
            messaging.useServiceWorker(registration);
            // Pick up a new SW version (v3+) without waiting forever
            registration.update().catch(() => {});
          })
          .catch(err => console.warn('❌ SW registration failed:', err));

        // When user taps a push while the app is already open / focused
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'NOTIFICATION_CLICK') {
            handleNotificationNavigation(event.data.screen || 'home');
          }
        });
      }

      // Deep links: ?open= and #hash (notification click / PWA cold start)
      window.addEventListener('hashchange', () => {
        const t = screenFromLocation();
        if (t) handleNotificationNavigation(t);
      });
      // iOS PWA: pageshow fires when returning from notification / bfcache
      window.addEventListener('pageshow', () => {
        const t = screenFromLocation();
        if (t) handleNotificationNavigation(t);
      });
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          const t = screenFromLocation();
          if (t) handleNotificationNavigation(t);
        }
      });

      firebase.auth().onAuthStateChanged(user => {
        if (user) {
          if (currentUserEmail !== user.email) clearSessionState();
          currentUserEmail = user.email;
          const member = MEMBERS.find(m => m.email === user.email);
          if (member) loginAs(member.name);
          else loginAs(user.email.split('@')[0]);
          // After login, honor pending notification / hash / query target
          applyPendingNotificationScreen();

          // Web Share Target: open School Copilot if shared text/title present
          const urlParams = new URLSearchParams(window.location.search);
          const sharedText = urlParams.get('text') || urlParams.get('title') || urlParams.get('url');
          if (sharedText) {
            const sharedSession = sessionGeneration;
            setTimeout(() => {
              if (sharedSession === sessionGeneration && typeof openSchoolCapture === 'function' && isAdultUser) {
                openSchoolCapture();
                const txtArea = document.getElementById('school-text');
                if (txtArea) txtArea.value = sharedText;
                window.history.replaceState({}, document.title, window.location.pathname);
              }
            }, 600);
          }
        } else {
          clearSessionState();
          document.getElementById('login-screen').classList.add('active');
          document.getElementById('app-screen').classList.remove('active');
        }
      });
    });

    // ─── TOAST ──────────────────────────────────────────────────
    let toastT;
    function toast(msg, isError = false) {
      const el = document.getElementById('toast');
      el.textContent = (isError?'❌ ':'') + msg;
      el.classList.add('show');
      clearTimeout(toastT);
      toastT = setTimeout(() => el.classList.remove('show'), 2800);
    }
    function showError(msg) { toast(msg, true); }

    // ─── UNDO (deferred commit) ────────────────────────────────
    let _pendingUndo = null;

    function _flushPendingUndo(useBeacon) {
      if(!_pendingUndo) return;
      clearTimeout(_pendingUndo.timer);
      const item = _pendingUndo;
      const payload = item.payload;
      _pendingUndo = null;
      if (item.account !== currentUserEmail || item.session !== sessionGeneration) return;
      if(!payload) return;
      if(useBeacon && navigator.sendBeacon) {
        payload.user = user || 'Unknown';
        payload.action = payload.action || 'write';
        if(lastIdToken) payload.idToken = lastIdToken;
        try { navigator.sendBeacon(GAS_URL, new Blob([JSON.stringify(payload)], { type: 'text/plain;charset=utf-8' })); } catch(e) {}
      } else {
        gPost(payload).then(result => {
          if (item.account !== currentUserEmail || item.session !== sessionGeneration) return;
          if (!result || result.status !== 'ok') {
            item.restore(); showError('Deletion was not confirmed. The item has been restored; refresh to check.');
          } else { loadData(); }
        });
      }
    }

    function pushUndo(restoreFn, message, commitPayload) {
      _flushPendingUndo();
      const el = document.getElementById('toast');
      _pendingUndo = {
        restore: restoreFn,
        account: currentUserEmail, session: sessionGeneration,
        payload: commitPayload || null,
        message: message || 'Item deleted',
        timer: setTimeout(() => {
          el.classList.remove('show');
          _flushPendingUndo();
        }, 5000)
      };
      el.innerHTML = `${escapeHtml(_pendingUndo.message)} <button onclick="undoLast()" style="background:none;border:1px solid #fff;color:#fff;border-radius:4px;padding:2px 8px;margin-left:8px;cursor:pointer;">Undo</button>`;
      el.classList.add('show');
      clearTimeout(toastT);
    }
    function undoLast() {
      if(!_pendingUndo) return;
      clearTimeout(_pendingUndo.timer);
      const item = _pendingUndo;
      _pendingUndo = null;
      if (item.account !== currentUserEmail || item.session !== sessionGeneration) return;
      item.restore();
      toast('Action undone.');
    }
    window.addEventListener('pagehide', () => _flushPendingUndo(true));
    document.addEventListener('visibilitychange', () => { if(document.hidden) _flushPendingUndo(true); });

    // ─── LOGIN ──────────────────────────────────────────────────
    function buildLogin() {
      const grid = document.getElementById('mgrid');
      if(!grid) return;
      grid.innerHTML = MEMBERS.map(m =>
        `<button class="member-btn" onclick="selectMember('${m.name}')"><span class="av">${rewardCompanionSVG({species:({Marcus:'bear',Eleanor:'cat',Mikaela:'fox',Meaghan:'rabbit'})[m.name],name:m.name},'small')}</span>${m.name}</button>`
      ).join('');
    }
    function selectMember(name) {
      selectedMember = MEMBERS.find(m => m.name === name);
      if(!selectedMember) return;
      document.querySelectorAll('.member-btn').forEach(b => b.classList.remove('sel'));
      document.querySelectorAll('.member-btn').forEach(b => { if(b.textContent.trim() === name) b.classList.add('sel'); });
      document.getElementById('pinbox').style.display = 'block';
      document.getElementById('pinlbl').textContent = name + "'s password";
      document.getElementById('login-error').textContent = '';
      setTimeout(() => document.getElementById('login-password').focus(), 100);
    }
    function loginWithSelectedMember() {
      if(!selectedMember){ document.getElementById('login-error').textContent = 'Please select a member.'; return; }
      const password = document.getElementById('login-password').value;
      if(!password){ document.getElementById('login-error').textContent = 'Please enter your password.'; return; }
      const email = selectedMember.email, errorEl = document.getElementById('login-error'), btn = document.getElementById('login-btn');
      btn.disabled = true; errorEl.textContent = '';
      // Family policy: 6-digit numeric PIN (same for kids and parents)
      if (!/^\d{6}$/.test(password)) {
        errorEl.textContent = 'PIN must be exactly 6 digits.';
        return;
      }
      firebase.auth().signInWithEmailAndPassword(email, password)
        .then(() => {
          btn.disabled = false;

        })
        .catch(err => { errorEl.textContent = err.message; btn.disabled = false; });
    }
    function loginAs(name) {
      user = name;
      const m = MEMBERS.find(m => m.name === name);
      document.getElementById('login-screen').classList.remove('active');
      document.getElementById('app-screen').classList.add('active');
      document.getElementById('hname').textContent = name;
      document.getElementById('hav').textContent = m ? m.emoji : '👤';
      document.getElementById('hdate').textContent = new Date().toLocaleDateString('en-SG',{weekday:'short',day:'numeric',month:'short'});
      setDefaultDates();
      // Immediate adult gate from email (refined when get_all returns isAdult)
      const email = (m && m.email) || currentUserEmail || '';
      setAdultAccess(ADULT_EMAILS.includes(String(email).toLowerCase()));
      goTo('home');
      // Sheets dashboard (GAS) + Firebase realtime (memories)
      loadData();
      startMemoriesListener();

      // Bind this device without prompting for permission
      initReminders();
      setupPullToRefresh();
    }

    // ─── PULL TO REFRESH ──────────────────────────────────────
    let _ptrBound = false;
    function setupPullToRefresh() {
      if (_ptrBound) return;
      const content = document.querySelector('#app-screen .content');
      const ind = document.getElementById('ptr-indicator');
      if (!content || !ind) return;
      _ptrBound = true;

      let startY = 0;
      let pulling = false;
      const THRESH = 72;

      function activeSection() {
        return document.querySelector('#app-screen .section.active');
      }

      content.addEventListener('touchstart', (e) => {
        const sec = activeSection();
        if (!sec || sec.scrollTop > 2) { pulling = false; return; }
        if (!document.getElementById('app-screen').classList.contains('active')) return;
        startY = e.touches[0].clientY;
        pulling = true;
      }, { passive: true });

      content.addEventListener('touchmove', (e) => {
        if (!pulling) return;
        const sec = activeSection();
        if (!sec || sec.scrollTop > 2) {
          ind.style.height = '0px';
          return;
        }
        const dy = e.touches[0].clientY - startY;
        if (dy < 8) {
          ind.style.height = '0px';
          ind.classList.remove('ptr-ready', 'ptr-loading');
          return;
        }
        const h = Math.min(dy * 0.45, 80);
        ind.style.height = h + 'px';
        ind.classList.toggle('ptr-ready', h >= THRESH * 0.55);
        ind.classList.remove('ptr-loading');
        ind.textContent = h >= THRESH * 0.55 ? 'Release to refresh' : 'Pull to refresh';
      }, { passive: true });

      content.addEventListener('touchend', async () => {
        if (!pulling) return;
        pulling = false;
        const h = parseFloat(ind.style.height || '0');
        if (h >= THRESH * 0.55) {
          ind.classList.add('ptr-loading');
          ind.classList.remove('ptr-ready');
          ind.style.height = '48px';
          ind.textContent = 'Refreshing…';
          try {
            if (await loadData()) toast('Refreshed');
          } catch (err) {
            toast('Refresh failed', true);
          }
        }
        ind.style.height = '0px';
        ind.textContent = '';
        ind.classList.remove('ptr-ready', 'ptr-loading');
      }, { passive: true });
    }
    // MODULE:session
    /** Show/hide Us, fertility, and money. Kids get body.is-child. */
    function setAdultAccess(adult) {
      isAdultUser = !!adult;
      document.body.classList.toggle('is-child', !isAdultUser);
      weekPersonFilter = adult ? (loadPreference('weekPerson', 'All') || 'All') : (user || 'All');
      buildMore();
      if (!isAdultUser && ['us', 'fertility', 'expenses', 'budgets', 'recurring'].includes(section)) {
        goTo('home');
      }
    }

    // ─── XSS ESCAPE / URL SAFETY ─────────────────────────────
    function escapeHtml(text) {
      if(text === null || text === undefined) return '';
      return String(text).replace(/[&<>"']/g, c => (
        {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
      ));
    }
    /** Only allow http(s) media URLs for img src / lightbox. */
    function isSafeMediaUrl(url) {
      if (!url || typeof url !== 'string') return false;
      try {
        const u = new URL(url, location.href);
        return u.protocol === 'https:';
      } catch (e) { return false; }
    }
    /** Safe img + lightbox markup; uses this.src so URLs never enter onclick JS strings. */
    function mediaImgHtml(url, extraStyle) {
      if (!isSafeMediaUrl(url)) return '';
      const style = extraStyle || 'max-width:100%;max-height:220px;object-fit:cover;border-radius:8px;margin:8px 0;cursor:pointer;display:block;';
      return `<img src="${escapeHtml(url)}" style="${style}" class="chat-bubble-img" onclick="openChatLightbox(this.src)" alt="">`;
    }

    // ─── PROGRESS BAR ─────────────────────────────────────────
    let progressInterval = null;
    function startProgressBar() {
      const bar = document.getElementById('top-progress-bar');
      if(!bar) return;
      clearInterval(progressInterval);
      bar.style.opacity = '1';
      bar.style.width = '0%';
      let percent = 0;
      progressInterval = setInterval(() => {
        if(percent < 30) percent += Math.random()*8+5;
        else if(percent < 75) percent += Math.random()*4+2;
        else if(percent < 95) percent += Math.random()*1.5+0.5;
        else if(percent < 99) percent += 0.1;
        bar.style.width = Math.min(percent,99)+'%';
      }, 120);
    }
    function finishProgressBar() {
      const bar = document.getElementById('top-progress-bar');
      if(!bar) return;
      clearInterval(progressInterval);
      bar.style.width = '100%';
      setTimeout(() => {
        bar.style.opacity = '0';
        setTimeout(() => bar.style.width = '0%', 300);
      }, 200);
    }

    // MODULE:api
    // ─── BUILD DYNAMIC SELECTORS ──────────────────────────────
    function buildDynamicSelectors() {
      const bgs = document.getElementById('bud-grp');
      if(bgs) bgs.innerHTML = Object.keys(GROUPS).map(g => `<option value="${g}">${g}</option>`).join('');
      const rgs = document.getElementById('rc-grp');
      if(rgs){ rgs.innerHTML = Object.keys(GROUPS).map(g => `<option value="${g}">${g}</option>`).join(''); updateRcCats(); }
      const egs = document.getElementById('ex-grp');
      if(egs){ egs.innerHTML = Object.keys(GROUPS).map(g => `<option value="${g}">${g}</option>`).join(''); updateExCats(); }
    }
    function updateRcCats() {
      const grp = document.getElementById('rc-grp'), cat = document.getElementById('rc-cat');
      if(!grp || !cat) return;
      cat.innerHTML = (GROUPS[grp.value]||[]).map(c => `<option value="${c}">${c}</option>`).join('');
    }
    function updateExCats() {
      const grp = document.getElementById('ex-grp'), cat = document.getElementById('ex-cat');
      if(!grp || !cat) return;
      cat.innerHTML = (GROUPS[grp.value]||[]).map(c => `<option value="${c}">${c}</option>`).join('');
    }

    // ─── NAVIGATION ───────────────────────────────────────────
    const NAV_SECONDARY = ['budgets','memories','habits','fertility','recurring','birthdays','schedules'];
    const ADULT_SCREENS = ['us', 'fertility', 'expenses', 'budgets', 'recurring'];
    const PRIMARY_SCREENS = ['home', 'tasks', 'calendar', 'rewards', 'more', 'expenses', 'us'];

    /** Read deep-link target from ?open= or #hash (iOS PWAs keep query more reliably). */
    function screenFromLocation() {
      try {
        const q = new URLSearchParams(location.search).get('open');
        if (q) return q.replace(/^\//, '') || 'home';
      } catch (e) { /* ignore */ }
      if (location.hash && location.hash.length > 1) {
        const h = location.hash.replace(/^#\/?/, '');
        if (h === 'chat') return 'home';
        if (PRIMARY_SCREENS.includes(h) || NAV_SECONDARY.includes(h)) return h;
      }
      return null;
    }

    /** Navigate from a notification tap (or deep link). Works before/after login. */
    function handleNotificationNavigation(screen) {
      let target = screen || 'home';
      if (target === 'chat') target = 'home';
      if (user) {
        goTo(target);
        try {
          const url = new URL(location.href);
          url.searchParams.set('open', target);
          url.hash = target;
          history.replaceState(null, '', url.pathname + url.search + url.hash);
        } catch (e) {
          try { history.replaceState(null, '', '?open=' + encodeURIComponent(target) + '#' + target); } catch (e2) {}
        }
      } else {
        try { sessionStorage.setItem('wf_pending_screen', target); } catch (e) {}
      }
    }

    function applyPendingNotificationScreen() {
      let target = null;
      try { target = sessionStorage.getItem('wf_pending_screen'); } catch (e) {}
      if (!target) target = screenFromLocation();
      if (target) {
        try { sessionStorage.removeItem('wf_pending_screen'); } catch (e) {}
        // Defer so login UI has finished switching screens (iOS needs a beat)
        setTimeout(() => goTo(target), 120);
        setTimeout(() => { if (section !== target) goTo(target); }, 600);
      }
    }

    function goTo(id) {
      if (id === 'chat') id = 'home';
      if (id === 'schedules') {
        calView = 'week';
        savePreference('calView', 'week');
        id = 'calendar';
      }
      // Adults-only destinations (UI + server); kids never enter these sections
      if (ADULT_SCREENS.includes(id) && !isAdultUser) {
        toast(id === 'us' || id === 'fertility' ? 'This space is visible only to parents.' : 'Budgets and expenses are visible only to parents.', true);
        id = 'home';
      }
      if (!document.getElementById('s-' + id)) id = 'home';
      section = id;
      if(timelineInterval){ clearInterval(timelineInterval); timelineInterval=null; }

      // Handle memories listener
      if(id === 'memories') {
        startMemoriesListener();
      } else {
        stopMemoriesListener();
      }
      
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      const t = document.getElementById('s-'+id);
      if(t) t.classList.add('active');
      const navId = NAV_SECONDARY.includes(id) ? '' : id;
      document.querySelectorAll('.nav-it').forEach(n => n.classList.remove('act'));
      if (navId) {
        const nb = document.getElementById('nav-'+navId);
        if(nb) nb.classList.add('act');
      }
      const FAB_MAP = {tasks:'m-task',memories:'m-memory',birthdays:'m-birthday'};
      if (isAdultUser) {
        FAB_MAP.calendar = 'm-event';
        FAB_MAP.expenses = 'm-expense';
        FAB_MAP.recurring = 'm-recurring';
      }
      const fab = document.getElementById('fab');
      if(FAB_MAP[id]){ fab.classList.remove('hide'); fab._m = FAB_MAP[id]; } else fab.classList.add('hide');
      
      render(id);
      updateNestShell();
    }
    function onFab() { if(document.getElementById('fab')._m) openM(document.getElementById('fab')._m); }
    function buildMore() {
      const el = document.getElementById('more-grid');
      if (!el) return;
      const tiles = [
        ...(isAdultUser ? [['habits','Habits']] : []),['memories','Memories'],['birthdays','Celebrations'],
        ...(isAdultUser ? [['expenses','Expenses'],['budgets','Budgets'],['recurring','Recurring costs'],['us','Just us'],['fertility','Wellbeing']] : [])
      ];
      el.innerHTML = tiles.map(([id,title]) => `<button class="more-tile" onclick="goTo('${id}')"><span class="mi">${nestIcon(id)}</span><span class="ml">${title}</span><span class="nest-tile-description">${NEST_PAGES[id][1]}</span></button>`).join('');
    }

    function render(id) {
      switch(id) {
        case 'home': renderHome(); break;
        case 'calendar': renderCal(); break;
        case 'tasks': renderTasks(); break;
        case 'habits': renderHabits(); break;
        case 'rewards': renderRewards(); break;
        case 'expenses': renderExpenses(); break;
        case 'budgets': renderBudgets(); break;
        case 'memories': renderMemories(); break;
        case 'fertility': renderFertility(); break;
        case 'recurring': renderRecurring(); break;
        case 'birthdays': renderBirthdays(); break;
        case 'schedules': renderSchedules(); break;
        case 'us': renderUs(); break;
      }
    }

    // ─── UTILITY ──────────────────────────────────────────────
    function v(id){ return document.getElementById(id)?.value?.trim()||''; }
    function clr(...ids){ ids.forEach(id => { const el=document.getElementById(id); if(el) el.value=''; }); }
    function localDateStr(d){ d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
    function todayStr(){ return localDateStr(); }
    function fmtDate(s){ if(!s) return ''; const d=new Date(s+'T00:00:00'); return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}); }
    function fmtTime(s){ if(!s) return ''; const [h,m]=s.split(':').map(Number); return `${h===0?12:h>12?h-12:h}:${String(m).padStart(2,'0')}${h>=12?'pm':'am'}`; }
    function setDefaultDates(){ const tod=todayStr(); ['ev-date','tk-due','mem-date','fert-date','ex-date','act-date','tr-date'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=tod; }); }
    function getMemberBadgeClass(tag){ switch(tag){ case 'Mikaela': return 'b-blue'; case 'Meaghan': return 'b-amber'; case 'Eleanor': return 'b-red'; case 'Marcus': return 'b-green'; case 'Everyone': return 'b-purple'; default: return 'b-gray'; } }

    // ─── CHIPS ─────────────────────────────────────────────────
    function chips(id, opts, def, key) {
      const el = document.getElementById(id);
      if(!el) return;
      el.innerHTML = opts.map(o => `<button type="button" aria-pressed="${o===def}" class="chip${o===def?' sel':''}" data-k="${key}" data-v="${o}" onclick="selChip(this,'${key}')">${escapeHtml(o)}</button>`).join('');
    }
    function selChip(el, key) { el.closest('.chips').querySelectorAll('.chip').forEach(c => {c.classList.remove('sel');c.setAttribute('aria-pressed','false');}); el.classList.add('sel'); el.setAttribute('aria-pressed','true'); }
    function gc(key) { const el=document.querySelector(`.chip[data-k="${key}"].sel`); return el ? el.dataset.v : null; }

    // ─── MODALS ─────────────────────────────────────────────────
    function buildModals() {
      chips('ev-chips', FAM, 'Everyone', 'ev-tag');
      chips('tk-chips', FAM, 'Everyone', 'tk-a');
      chips('mem-type-chips', ['🏆 Milestone','💬 Quote','💛 Moment'], '💛 Moment', 'mt');
      chips('mem-pers-chips', FAM, 'Everyone', 'mp');
      chips('bd-type-chips', ['Birthday','Wedding Anniversary'], 'Birthday', 'bdt');
      chips('fert-chips', ['Period Start','Period End','Ovulation','Symptom'], 'Period Start', 'ft');
      chips('rc-acct-chips', ['Personal Account','Family'], 'Family', 'rca');
      chips('ex-acct-chips', ['Personal Account','Family'], 'Family', 'exa');
    }
    function openM(id) {
      modalOpened(id);
      if(id === 'm-event'){ const el=document.getElementById('ev-date'); if(el) el.value=selectedCalDayStr||todayStr(); chips('ev-chips', FAM, gc('ev-tag') || 'Everyone', 'ev-tag'); }
      if(id === 'm-task') {
        const idEl = document.getElementById('tk-id'); if (idEl) idEl.value = '';
        const titleEl = document.getElementById('m-task-title'); if (titleEl) titleEl.textContent = 'Add task';
        const submitBtn = document.getElementById('tk-submit'); if (submitBtn) submitBtn.textContent = 'Save task';
        clr('tk-title', 'tk-due');
        const starEl = document.getElementById('tk-stars'); if (starEl) starEl.value = '0';
        const starWrap = document.getElementById('tk-stars-wrap'); if (starWrap) starWrap.style.display = isAdultUser ? '' : 'none';
        chips('tk-chips', isAdultUser ? FAM : [user], user, 'tk-a');
      }
      if(id === 'm-timetable-add'){ const el=document.getElementById('sch-date'); if(el) el.value=selectedCalDayStr||todayStr(); }
    }
    function openEditTask(id) {
      const t = (data.todos || []).find(x => x.id === id) || (data.schoolTasks || []).find(x => x.id === id);
      if (!t) return;
      if (!isAdultUser && t.assignee && t.assignee !== user) {
        toast('You can only edit tasks assigned to you.');
        return;
      }
      const idEl = document.getElementById('tk-id'); if (idEl) idEl.value = t.id;
      const titleInput = document.getElementById('tk-title'); if (titleInput) titleInput.value = t.task || '';
      const dueInput = document.getElementById('tk-due'); if (dueInput) dueInput.value = t.dueRaw || '';
      const titleEl = document.getElementById('m-task-title'); if (titleEl) titleEl.textContent = 'Edit task';
      const submitBtn = document.getElementById('tk-submit'); if (submitBtn) submitBtn.textContent = 'Save changes';
      const starEl = document.getElementById('tk-stars'); if (starEl) starEl.value = String(typeof rewardStars === 'function' ? rewardStars('task', t.id) : 0);
      const starWrap = document.getElementById('tk-stars-wrap'); if (starWrap) starWrap.style.display = isAdultUser ? '' : 'none';
      chips('tk-chips', isAdultUser ? FAM : [user], t.assignee || user, 'tk-a');
      modalOpened('m-task');
    }
    window.openEditTask = openEditTask;


    // ─── SEARCH / FILTER ──────────────────────────────────────
    function filterTasks() {
      const input = document.getElementById('task-search');
      searchTaskQuery = input ? input.value.toLowerCase().trim() : '';
      renderTasks();
    }
    function filterExpenses() {
      const input = document.getElementById('exp-search');
      searchExpenseQuery = input ? input.value.toLowerCase().trim() : '';
      renderExpenses();
    }
    function filterCalendar() {
      const input = document.getElementById('cal-search');
      searchCalQuery = input ? input.value.toLowerCase().trim() : '';
      renderCal();
    }

    // ─── HOME (Dashboard) ────────────────────────────────────
    function renderHome() {
      updateNestShell();
      renderRewardHome();
      renderSchoolHome();
      const h = new Date().getHours();
      const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
      document.getElementById('greet').innerHTML = `<div class="nest-greeting-top"><div><span class="nest-kicker">${isAdultUser ? 'OUR FAMILY, TOGETHER' : 'YOUR LITTLE CORNER'}</span><h2>${g}, ${escapeHtml(user)}.</h2><p>${isAdultUser ? 'Let’s make a little room for a good day.' : 'Small steps today. Good things ahead.'}</p></div><span class="nest-date">${nestIcon('calendar')}${new Date().toLocaleDateString('en-SG',{weekday:'short',day:'numeric',month:'long'})}</span></div>`;

      const summaryEl = document.getElementById('dash-summary');
      const membersEl = document.getElementById('dash-members');
      const todayWrapEl = document.getElementById('today-wrap');
      const activityWrapEl = document.getElementById('dash-activity-wrap');
      if (!isAdultUser) {
        if (summaryEl) summaryEl.style.display = 'none';
        if (membersEl) membersEl.style.display = 'none';
        if (todayWrapEl) todayWrapEl.style.display = 'none';
        if (activityWrapEl) activityWrapEl.style.display = 'none';
        return;
      } else {
        if (summaryEl) summaryEl.style.display = '';
        if (membersEl) membersEl.style.display = '';
        if (todayWrapEl) todayWrapEl.style.display = '';
        if (activityWrapEl) activityWrapEl.style.display = '';
      }

      const tod = todayStr();
      const tomDate = new Date();
      tomDate.setDate(tomDate.getDate() + 1);
      const tom = localDateStr(tomDate);
      const events = data.events || [];
      const todos = data.todos || [];
      const evsToday = events.filter(e => e.dateRaw === tod);
      const evsTomorrow = events.filter(e => e.dateRaw === tom);
      const needsYou = todos.filter(t => {
        if (!t || String(t.status).toLowerCase() === 'done') return false;
        if (t.status === 'Needs help') return true;
        if (t.dueRaw && t.dueRaw < tod) return true;
        if (t.assignee === 'Meaghan') return true;
        if (t.assignee === user) return true;
        return false;
      });
      document.getElementById('dash-summary').innerHTML = `
        <div class="dash-stat" onclick="goTo('tasks')" style="cursor:pointer;"><span class="num">${needsYou.length}</span><span class="lbl">Needs a hand</span><small>Little things to take care of</small></div>
        <div class="dash-stat" onclick="goTo('calendar')" style="cursor:pointer;"><span class="num">${evsToday.length}</span><span class="lbl">On today</span><small>In the family calendar</small></div>
        <div class="dash-stat" onclick="goTo('calendar')" style="cursor:pointer;"><span class="num">${evsTomorrow.length}</span><span class="lbl">Tomorrow</span><small>A little look ahead</small></div>
      `;
      const memberOrder = ['Mikaela', 'Meaghan', user, user === 'Marcus' ? 'Eleanor' : 'Marcus']
        .filter((m, i, arr) => m && m !== 'Everyone' && arr.indexOf(m) === i);
      let membersHtml = '';
      memberOrder.forEach(m => {
        const tasks = todos.filter(t => t.assignee === m && t.status !== 'Done' && t.status !== 'Deleted');
        const memberEvents = events.filter(e => (e.tags || []).includes(m) && e.dateRaw >= tod).slice(0, 3);
        const together = m === 'Meaghan' ? ' · with you' : m === 'Mikaela' ? ' · self-serve' : '';
        membersHtml += `
          <div class="dash-member" onclick="goToMember('${m}')" title="View tasks for ${m}">
            <span class="emoji">${m==='Marcus'?'👨':m==='Eleanor'?'👩':m==='Mikaela'?'⛵':'🩰'}</span>
            <div class="info"><div class="name">${m}</div><div class="detail">${tasks.length} open tasks · ${memberEvents.length} upcoming${together}</div></div>
            <span class="count">${tasks.length}</span>
          </div>
        `;
      });
      document.getElementById('dash-members').innerHTML = `<span class="nest-kicker">THE WONG CREW</span>${membersHtml}`;
      const tksToday = todos.filter(t => t.dueRaw && t.dueRaw <= tod && t.status !== 'Done' && t.status !== 'Deleted');
      document.getElementById('today-wrap').innerHTML = `
        <div class="card">
          <div class="card-hdr"><span class="card-title">Today at a glance</span></div>
          <div class="card-body">
            ${!evsToday.length && !tksToday.length ? '<div class="empty">Nothing scheduled for today.</div>' : ''}
            ${evsToday.map(e => `<div class="row" onclick="goTo('calendar')" style="cursor:pointer;"><div style="font-size:16px">📅</div><div class="row-main"><div class="row-title">${escapeHtml(e.title)}${(e.title && /\bEYE\b/.test(e.title) && !e.title.includes('End Year Exams')) ? ' <span class="badge b-amber" style="font-size:11px;font-weight:600;">End Year Exams</span>' : ''}</div><div class="row-sub">${escapeHtml(e.time)}${(e.tags||[]).length ? ' · ' + e.tags.map(escapeHtml).join(', ') : ''}</div></div></div>`).join('')}
            ${tksToday.map(t => `<div class="row" onclick="goTo('tasks')" style="cursor:pointer;"><div style="font-size:16px">${t.dueRaw < tod ? '⚠️' : '⏰'}</div><div class="row-main"><div class="row-title">${escapeHtml(t.task)}</div><div class="row-sub">${t.dueRaw < tod ? 'Overdue' : 'Due today'} · ${escapeHtml(t.assignee)}</div></div></div>`).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-hdr"><span class="card-title">Tomorrow</span><button class="btn btn-sm btn-s" onclick="goTo('calendar')">Week</button></div>
          <div class="card-body">
            ${!evsTomorrow.length ? '<div class="empty">Nothing scheduled for tomorrow.</div>' : evsTomorrow.map(e => `<div class="row" onclick="goTo('calendar')" style="cursor:pointer;"><div style="font-size:16px">📅</div><div class="row-main"><div class="row-title">${escapeHtml(e.title)}${(e.title && /\bEYE\b/.test(e.title) && !e.title.includes('End Year Exams')) ? ' <span class="badge b-amber" style="font-size:11px;font-weight:600;">End Year Exams</span>' : ''}</div><div class="row-sub">${escapeHtml(e.time)}${(e.tags||[]).length ? ' · ' + e.tags.map(escapeHtml).join(', ') : ''}</div></div></div>`).join('')}
          </div>
        </div>
      `;

      renderActivityLog();
    }

    let currentActivityFilter = 'All';

    function setActivityFilter(filter) {
      currentActivityFilter = filter;
      renderActivityLog();
    }

    function renderActivityLog() {
      const container = document.getElementById('dash-activity-wrap');
      if (!container) return;
      if (!isAdultUser) {
        container.style.display = 'none';
        return;
      }
      container.style.display = '';

      const list = Array.isArray(data.activityLog) ? data.activityLog : [];
      const filters = ['All', 'Tasks', 'Calendar', 'Habits', 'Expenses', 'Other'];

      const filtered = list.filter(item => {
        if (currentActivityFilter === 'All') return true;
        if (currentActivityFilter === 'Other') {
          return !['Tasks', 'Calendar', 'Habits', 'Expenses'].includes(item.category);
        }
        return item.category === currentActivityFilter;
      });

      const getActionIcon = (action, category) => {
        switch (action) {
          case 'task_done': return '✅';
          case 'task_add': return '📋';
          case 'task_edit': return '✏️';
          case 'task_delete': return '🗑️';
          case 'task_help': return '🆘';
          case 'event_add':
          case 'event_edit':
          case 'event_delete': return '📅';
          case 'habit_log': return '⭐';
          case 'habit_delete': return '↩️';
          case 'expense_add':
          case 'expense_delete': return '💳';
          case 'birthday_add': return '🎂';
          case 'school_published': return '🏫';
          default:
            if (category === 'Tasks') return '📋';
            if (category === 'Calendar') return '📅';
            if (category === 'Habits') return '⭐';
            if (category === 'Expenses') return '💳';
            return '📌';
        }
      };

      const getRelativeTime = (ts) => {
        if (!ts) return '';
        try {
          const d = new Date(ts);
          if (isNaN(d.getTime())) return String(ts);
          const now = new Date();
          const diffSec = Math.floor((now - d) / 1000);
          if (diffSec < 60) return 'Just now';
          if (diffSec < 3600) return Math.floor(diffSec / 60) + 'm ago';
          if (diffSec < 86400 && d.getDate() === now.getDate()) {
            return d.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', hour12: true });
          }
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          if (d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth() && d.getFullYear() === yesterday.getFullYear()) {
            return 'Yesterday ' + d.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', hour12: true });
          }
          return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', hour12: true });
        } catch (_) {
          return String(ts);
        }
      };

      let rowsHtml = '';
      if (!filtered.length) {
        rowsHtml = `<div class="empty" style="padding:24px 16px;text-align:center;color:var(--text-muted);">No activity recorded yet for ${currentActivityFilter === 'All' ? 'the family' : currentActivityFilter}.</div>`;
      } else {
        rowsHtml = filtered.map(item => {
          const icon = getActionIcon(item.action, item.category);
          const timeStr = getRelativeTime(item.timestamp);
          return `
            <div class="activity-item">
              <div class="activity-icon">${icon}</div>
              <div class="activity-content">
                <div class="activity-desc">${escapeHtml(item.description)}</div>
                ${item.details ? `<div class="activity-detail">${escapeHtml(item.details)}</div>` : ''}
                <div class="activity-meta">
                  <span class="activity-badge">${escapeHtml(item.category || 'General')}</span>
                  <span>${escapeHtml(timeStr)}</span>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }

      container.innerHTML = `
        <div class="card">
          <div class="card-hdr" style="flex-wrap:wrap;gap:8px;">
            <span class="card-title">Activity Feed</span>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              ${filters.map(f => `<button class="activity-pill ${currentActivityFilter === f ? 'active' : ''}" onclick="setActivityFilter('${f}')">${f}</button>`).join('')}
            </div>
          </div>
          <div class="activity-feed">
            ${rowsHtml}
          </div>
        </div>
      `;
    }

    window.setActivityFilter = setActivityFilter;
    window.renderActivityLog = renderActivityLog;

    function goToMember(member) {
      goTo('tasks');
      const searchInput = document.getElementById('task-search');
      if (searchInput) {
        searchInput.value = member;
        filterTasks();
      }
    }

    // MODULE:calendar
    // MODULE:money
    // ─── FERTILITY ──────────────────────────────────────────────
    /** Parse server fertility dates: prefer ISO yyyy-MM-dd, else en-GB-ish "dd MMM yyyy". */
    function parseFertDate(raw, display) {
      if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const d = new Date(raw + 'T00:00:00');
        if (!isNaN(d.getTime())) return d;
      }
      if (display) {
        const d = new Date(display);
        if (!isNaN(d.getTime())) return d;
      }
      return null;
    }

    function renderFertility() {
      const f  = data.fertility || {};
      const el = document.getElementById('fert-body');
      if (!f.lastPeriodStart && !f.lastPeriodStartRaw) {
        el.innerHTML = '<div class="empty"><div class="ei">🌸</div>No data yet. Log your first entry below.</div>';
        return;
      }

      const cycleLen = Math.min(45, Math.max(21, Number(f.cycleLength) || 28));
      let cycleDayHtml = '';
      try {
        const pStart = parseFertDate(f.lastPeriodStartRaw, f.lastPeriodStart);
        if (pStart) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          pStart.setHours(0, 0, 0, 0);
          // Day 1 = period start date (no Math.abs — future-dated entries shouldn't look like day N)
          const diffDays = Math.floor((today - pStart) / 86400000) + 1;
          const dayInCycle = diffDays > 0 ? ((diffDays - 1) % cycleLen) + 1 : diffDays;
          const progressPct = diffDays > 0
            ? Math.min(Math.max((dayInCycle / cycleLen) * 100, 0), 100)
            : 0;

          // Phase windows aligned with server: luteal ≈ 14d, ovulation = cycleLen - 14
          const ovulDay = Math.max(10, cycleLen - 14);
          const mensesEnd = Math.min(7, Math.max(3, Math.round(cycleLen * 0.18)));
          const fertileStart = Math.max(1, ovulDay - 4);
          const fertileEnd = Math.min(cycleLen, ovulDay + 2);

          let phase = 'Follicular Phase';
          let phaseIcon = '🌱';
          if (diffDays < 1) {
            phase = 'Before recorded start';
            phaseIcon = '⏳';
          } else if (dayInCycle <= mensesEnd) {
            phase = 'Menstruation';
            phaseIcon = '🩸';
          } else if (dayInCycle >= fertileStart && dayInCycle <= fertileEnd) {
            phase = 'Fertile Window / Ovulation';
            phaseIcon = '🌸';
          } else if (dayInCycle > fertileEnd) {
            phase = 'Luteal Phase';
            phaseIcon = '🍂';
          }

          const dayLabel = diffDays < 1
            ? 'Starts ' + escapeHtml(f.lastPeriodStart || '')
            : 'Day ' + dayInCycle;

          cycleDayHtml = `
            <div class="card" style="padding:16px;background:linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%);border:1.5px solid #fecdd3;border-radius:12px;margin-bottom:14px;box-shadow:0 2px 6px rgba(225, 29, 72, 0.05);">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <div style="font-size:11px;font-weight:700;color:#be123c;text-transform:uppercase;letter-spacing:0.5px;">Current Cycle · ~${cycleLen}d avg</div>
                  <div style="font-size:18px;font-weight:800;color:#9f1239;margin-top:2px;">${dayLabel} <span style="font-size:13px;font-weight:600;color:#e11d48;margin-left:4px;">${phaseIcon} ${escapeHtml(phase)}</span></div>
                </div>
                <div style="font-size:24px;">🌸</div>
              </div>
              <div style="height:6px;background:rgba(225, 29, 72, 0.1);border-radius:3px;overflow:hidden;margin-top:12px;">
                <div style="height:100%;width:${progressPct}%;background:#e11d48;border-radius:3px;"></div>
              </div>
            </div>
          `;
        }
      } catch (err) {
        console.error(err);
      }

      const stats = [
        { label: 'Last Period Start', val: f.lastPeriodStart || '—', icon: '🩸', color: '#fda4af' },
        { label: 'Next Period (est.)', val: f.nextPeriod || '—', icon: '📅', color: '#fbcfe8' },
        { label: 'Fertile Window', val: f.fertileStart && f.fertileEnd ? `${f.fertileStart} – ${f.fertileEnd}` : '—', icon: '🌸', color: '#fecdd3', span: true },
        { label: 'Period Duration', val: f.duration != null && f.duration >= 0 ? `${f.duration} days` : '—', icon: '⏱️', color: '#fed7aa' },
        { label: 'Avg Cycle Length', val: f.cycleLength ? `${f.cycleLength} days` : '—', icon: '🔄', color: '#e9d5ff' },
        { label: 'Last Ovulation', val: f.lastOvulation || '—', icon: '✨', color: '#fef08a' }
      ];

      let statsGrid = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
          ${stats.map(s => {
            const gridSpan = s.span ? 'grid-column: span 2;' : '';
            return `
              <div style="background:var(--bg-card);border:1.5px solid var(--border-color);border-radius:12px;padding:12px;box-shadow:0 2px 4px rgba(0,0,0,0.02);display:flex;align-items:center;gap:10px;${gridSpan}">
                <div style="width:34px;height:34px;border-radius:50%;background:${s.color};display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">${s.icon}</div>
                <div style="min-width:0;">
                  <div style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.3px;">${escapeHtml(s.label)}</div>
                  <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(String(s.val))}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;

      let symptomsHtml = '';
      if (f.symptoms && f.symptoms.length > 0) {
        symptomsHtml = `
          <div style="margin-top:16px;border-top:1px solid var(--border-color);padding-top:14px;">
            <div style="font-size:12px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">📝 Recent Symptoms Log</div>
            <div style="position:relative;padding-left:14px;border-left:2px solid #fecdd3;display:flex;flex-direction:column;gap:12px;margin-left:6px;">
              ${f.symptoms.map(s => `
                <div style="position:relative;font-size:13px;">
                  <div style="position:absolute;left:-19px;top:4px;width:8px;height:8px;border-radius:50%;background:#e11d48;border:2px solid #fff;box-shadow:0 0 0 2px #fecdd3;"></div>
                  <strong style="color:var(--text-muted);">${escapeHtml(s.date)} · ${escapeHtml(s.type || 'Symptom')}:</strong> <span style="color:var(--text-primary);font-weight:500;">${escapeHtml(s.note)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      el.innerHTML = cycleDayHtml + statsGrid + symptomsHtml;
    }

    // ─── BIRTHDAYS ──────────────────────────────────────────────
    function renderBirthdays() {
      const items = data.birthdays || [];
      const el = document.getElementById('bd-list');
      if(!items.length){ el.innerHTML = '<div class="empty"><div class="ei">🎂</div>No birthdays saved yet</div>'; return; }
      
      const today = items.filter(b => b.daysAway === 0);
      const upcoming = items.filter(b => b.daysAway > 0 && b.daysAway <= 30);
      const future = items.filter(b => b.daysAway > 30);
      
      function getEventCard(b) {
        const ic = b.type === 'Birthday' ? '🎂' : '💍';
        const badgeCls = b.daysAway === 0 ? 'b-red' : b.daysAway <= 7 ? 'b-amber' : 'b-gray';
        const badgeText = b.daysAway === 0 ? 'Today! 🥳' : b.daysAway === 1 ? 'Tomorrow!' : `In ${b.daysAway} days`;
        
        const [mNum, dNum] = b.date.split('-');
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const monthStr = months[parseInt(mNum) - 1] || 'Jan';
        
        return `
          <div style="display:flex;align-items:center;background:var(--bg-card);border:1.5px solid var(--border-color);border-radius:12px;padding:12px 16px;box-shadow:0 2px 6px rgba(0,0,0,0.02);gap:12px;margin-bottom:8px;">
            <div style="width:46px;height:50px;border-radius:8px;border:1px solid var(--border-color);display:flex;flex-direction:column;overflow:hidden;flex-shrink:0;text-align:center;box-shadow:0 2px 4px rgba(0,0,0,0.03);">
              <div style="background:#ef4444;color:#fff;font-size:9px;font-weight:700;padding:2px 0;text-transform:uppercase;letter-spacing:0.5px;">${monthStr}</div>
              <div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:var(--text-primary);background:#f8fafc;">${dNum}</div>
            </div>
            
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:14px;color:var(--text-primary);display:flex;align-items:center;gap:4px;">
                <span>${escapeHtml(b.name)}</span>
                <span>${ic}</span>
              </div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">
                ${escapeHtml(b.dateLabel)}${b.agePart ? ' · ' + escapeHtml(b.agePart) : ''}${b.notes ? ' · <span style="font-style:italic;">"' + escapeHtml(b.notes) + '"</span>' : ''}
              </div>
            </div>
            
            <div style="flex-shrink:0;">
              <span class="badge ${badgeCls}" style="font-size:10px;padding:4px 10px;">${badgeText}</span>
            </div>
          </div>
        `;
      }
      
      let html = '<div style="padding:16px;">';
      
      if(today.length > 0) {
        html += `
          <div style="font-size:12px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">🥳 Today's Celebration</div>
          <div style="margin-bottom:16px;background:linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%);border:1.5px dashed #f472b6;padding:4px;border-radius:14px;">
            ${today.map(b => getEventCard(b)).join('')}
          </div>
        `;
      }
      
      if(upcoming.length > 0) {
        html += `
          <div style="font-size:12px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:1px;margin:12px 0 8px;">⏰ Upcoming (Next 30 days)</div>
          <div style="margin-bottom:16px;">
            ${upcoming.map(b => getEventCard(b)).join('')}
          </div>
        `;
      }
      
      if(future.length > 0) {
        html += `
          <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin:12px 0 8px;">📅 Future Events</div>
          <div>
            ${future.map(b => getEventCard(b)).join('')}
          </div>
        `;
      }
      
      html += '</div>';
      el.innerHTML = html;
    }

    // ─── KID SCHEDULES ─────────────────────────────────────────
    function filterSchedules(child) { activeSchedChild=child; savePreference('schedChild', child); document.querySelectorAll('.tab-pill').forEach(p=>p.classList.remove('active')); const pill=document.getElementById('pill-'+child); if(pill) pill.classList.add('active'); renderSchedules(); }
    function toggleSchedView(view) { schedView=view; savePreference('schedView', view); document.getElementById('sched-view-list').classList.toggle('active', view==='list'); document.getElementById('sched-view-grid').classList.toggle('active', view==='grid'); renderSchedules(); }
    function prevSchedMonth(){ schedMonth--; if(schedMonth<0){schedMonth=11;schedYear--;} renderSchedules(); }
    function nextSchedMonth(){ schedMonth++; if(schedMonth>11){schedMonth=0;schedYear++;} renderSchedules(); }
    function selectGridDay(dayStr){ selectedGridDayStr=dayStr; renderSchedules(); }

    function renderSchedules() {
      if(schedView==='grid'){ renderSchedulesGrid(); return; }
      const evs = data.events || [];
      const container = document.getElementById('sched-container');
      if(!container) return;
      const today = todayStr();
      const now = new Date();
      const thisMonth = now.getMonth(), thisYear = now.getFullYear();
      const filteredEvents = evs.filter(e => {
        if(activeSchedChild==='All') return e.tags.includes('Mikaela') || e.tags.includes('Meaghan');
        return e.tags.includes(activeSchedChild);
      });
      const upcoming = filteredEvents.filter(e => e.dateRaw >= today).sort((a,b)=>a.dateRaw.localeCompare(b.dateRaw));
      const past = filteredEvents.filter(e => e.dateRaw < today).sort((a,b)=>b.dateRaw.localeCompare(a.dateRaw));
      let totalHours = 0, activityBreakdown = {};
      past.forEach(a => {
        const d = new Date(a.dateRaw);
        if(!isNaN(d.getTime()) && d.getMonth()===thisMonth && d.getFullYear()===thisYear){
          const dur = a.duration || 0; totalHours += dur;
          let actType = 'Class';
          const titleLower = a.title.toLowerCase();
          if(titleLower.indexOf('sailing')!==-1) actType='⛵ Sailing';
          else if(titleLower.indexOf('piano')!==-1 || titleLower.indexOf('music')!==-1) actType='🎹 Piano';
          else if(titleLower.indexOf('enrichment')!==-1 || titleLower.indexOf('class')!==-1) actType='📚 Class';
          else actType='🎯 Enrichment';
          activityBreakdown[actType] = (activityBreakdown[actType]||0) + dur;
        }
      });
      const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      let timetableHtml = '';
      if(upcoming.length > 0){
        timetableHtml = upcoming.slice(0,10).map(c => {
          const dayName = days[new Date(c.dateRaw).getDay()];
          return `<div class="row" style="padding:10px 16px;"><div style="font-size:20px;flex-shrink:0;margin-right:6px;">⛵</div><div class="row-main"><div class="row-title" style="font-weight:600;">${escapeHtml(c.title)}</div><div class="row-sub">${escapeHtml(dayName)}, ${escapeHtml(c.date)} · ${escapeHtml(c.time)}${c.endTime ? ' - ' + escapeHtml(c.endTime) : ''}${c.location ? ' · ' + escapeHtml(c.location) : ''}</div>${c.notes ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;font-style:italic;">"${escapeHtml(c.notes)}"</div>` : ''}</div><button onclick="delSchedule('${c.id}')" style="color:var(--text-muted);font-size:16px;padding:4px;flex-shrink:0;">✕</button></div>`;
        }).join('');
      } else timetableHtml = '<div class="empty">No upcoming classes/sessions scheduled</div>';
      let breakdownItems = '';
      for(const act in activityBreakdown) breakdownItems += `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;"><strong>${escapeHtml(act)}:</strong> ${activityBreakdown[act].toFixed(1)} hrs</div>`;
      const summaryHtml = `<div class="stat-summary"><div class="stat-num">${totalHours.toFixed(1)}</div><div class="stat-main"><div class="stat-lbl">Hours Completed This Month</div>${breakdownItems || '<div style="font-size:11px;color:var(--text-muted);">No sessions completed yet this month</div>'}</div></div>`;
      let timelineHtml = past.slice(0,10).map(a => `<div class="row" style="padding:10px 16px;"><div style="font-size:20px;flex-shrink:0;margin-right:6px;">✅</div><div class="row-main"><div class="row-title" style="font-weight:600;">${escapeHtml(a.title)} (${a.duration.toFixed(1)} hrs)</div><div class="row-sub">${escapeHtml(a.date)} · Completed ${a.location ? ' · ' + escapeHtml(a.location) : ''}${a.notes ? ' · ' + escapeHtml(a.notes) : ''}</div></div><button onclick="delSchedule('${a.id}')" style="color:var(--text-muted);font-size:16px;padding:4px;flex-shrink:0;">✕</button></div>`).join('');
      if(!timelineHtml) timelineHtml = '<div class="empty">No past sessions logged</div>';
      container.innerHTML = `
        <div style="margin-top:10px;font-size:13px;font-weight:700;color:var(--text-secondary);padding:0 16px 4px;border-bottom:2px solid var(--border-color);">📅 Timetable / Upcoming</div>
        ${timetableHtml}
        <div style="margin-top:20px;font-size:13px;font-weight:700;color:var(--text-secondary);padding:0 16px 4px;border-bottom:2px solid var(--border-color);">📊 Month Progress</div>
        ${summaryHtml}
        <div style="margin-top:10px;font-size:13px;font-weight:700;color:var(--text-secondary);padding:0 16px 4px;border-bottom:2px solid var(--border-color);">📝 Completed Logs</div>
        <div class="card-body" style="padding:0;">${timelineHtml}</div>
      `;
    }
    function renderSchedulesGrid() {
      const evs = data.events || [];
      const container = document.getElementById('sched-container');
      if(!container) return;
      const filteredEvents = evs.filter(e => {
        if(activeSchedChild==='All') return e.tags.includes('Mikaela') || e.tags.includes('Meaghan');
        return e.tags.includes(activeSchedChild);
      });
      const firstDayOfMonth = new Date(schedYear, schedMonth, 1);
      const startDayOfWeek = firstDayOfMonth.getDay();
      const numDays = new Date(schedYear, schedMonth+1, 0).getDate();
      const prevMonthDays = new Date(schedYear, schedMonth, 0).getDate();
      const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      let html = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--bg-card);border-bottom:1px solid var(--border-color);">
          <button onclick="prevSchedMonth()" style="background:none;border:none;font-size:16px;cursor:pointer;color:#4f86c6;padding:4px 8px;">◀</button>
          <span style="font-weight:700;font-size:14px;">${monthNames[schedMonth]} ${schedYear}</span>
          <button onclick="nextSchedMonth()" style="background:none;border:none;font-size:16px;cursor:pointer;color:#4f86c6;padding:4px 8px;">▶</button>
        </div>
        <div class="cal-grid-hdr"><div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div></div>
        <div class="cal-grid">
      `;
      for(let i=startDayOfWeek-1; i>=0; i--) { const dVal=prevMonthDays-i; html += `<div class="cal-day-cell other-month"><span class="cal-day-num">${dVal}</span></div>`; }
      const today = todayStr();
      for(let day=1; day<=numDays; day++) {
        const dayStr = `${schedYear}-${String(schedMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const isToday = today === dayStr;
        const isSelected = selectedGridDayStr === dayStr;
        const dayEvents = filteredEvents.filter(e => e.dateRaw === dayStr);
        let dotsHtml = '';
        if(dayEvents.length > 0) {
          dotsHtml = '<div class="cal-dots-wrap">';
          const uniqueTags = new Set();
          dayEvents.forEach(e => { if(e.tags.includes('Mikaela')) uniqueTags.add('Mikaela'); if(e.tags.includes('Meaghan')) uniqueTags.add('Meaghan'); });
          uniqueTags.forEach(tag => dotsHtml += `<span class="cal-dot ${tag}"></span>`);
          dotsHtml += '</div>';
        }
        const cellClass = `cal-day-cell${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`;
        html += `<div class="${cellClass}" onclick="selectGridDay('${dayStr}')"><span class="cal-day-num">${day}</span>${dotsHtml}</div>`;
      }
      const totalCellsUsed = startDayOfWeek + numDays;
      const nextDaysCount = 42 - totalCellsUsed;
      for(let d=1; d<=nextDaysCount; d++) { html += `<div class="cal-day-cell other-month"><span class="cal-day-num">${d}</span></div>`; }
      html += `</div>`;
      const selectedDayEvents = filteredEvents.filter(e => e.dateRaw === selectedGridDayStr);
      let selectedDayHtml = '';
      if(selectedDayEvents.length > 0) {
        selectedDayHtml = selectedDayEvents.map(c => `<div class="row" style="padding:10px 16px;"><div style="font-size:20px;flex-shrink:0;margin-right:6px;">⛵</div><div class="row-main"><div class="row-title" style="font-weight:600;">${escapeHtml(c.title)}</div><div class="row-sub">${escapeHtml(c.time)}${c.endTime ? ' - ' + escapeHtml(c.endTime) : ''}${c.location ? ' · ' + escapeHtml(c.location) : ''}</div>${c.notes ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;font-style:italic;">"${escapeHtml(c.notes)}"</div>` : ''}</div><button onclick="delSchedule('${c.id}')" style="color:var(--text-muted);font-size:16px;padding:4px;flex-shrink:0;">✕</button></div>`).join('');
      } else { selectedDayHtml = '<div class="empty">No activities scheduled for this day</div>'; }
      html += `<div style="margin-top:16px;font-size:13px;font-weight:700;color:var(--text-secondary);padding:0 16px 4px;border-bottom:2px solid var(--border-color);">📅 Activities: ${fmtDate(selectedGridDayStr)}</div><div class="card-body" style="padding:0;">${selectedDayHtml}</div>`;
      container.innerHTML = html;
    }
    function delEvent(id) {
      if (!isAdultUser) { toast('Only parents can delete events.', true); return; }
      const ev = (data.events || []).find(e => e.id === id);
      if (!ev) return;
      if (!confirm('Delete this calendar event?')) return;
      data.events = data.events.filter(e => e.id !== id);
      pushUndo(() => { if (!data.events.some(e => e.id === ev.id)) data.events.push(ev); renderCal(); }, 'Event removed — Undo available', { note: 'delete_event', event_id: id });
      renderCal();

    }
    function delSchedule(id) { delEvent(id); }

    // ─── SUBMIT FUNCTIONS ──────────────────────────────────────
    async function submitEvent(btn) {
      if(!btn) btn = document.getElementById('ev-submit');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const title = v('ev-title'), date = v('ev-date');
        if(!title||!date){ toast('Please enter a title and date.'); return; }
        const tag = gc('ev-tag');
        let notes = v('ev-notes');
        if(tag && tag !== 'Everyone') notes = (notes?notes+'\n':'') + 'Tag: '+tag;
        if (!await saveConfirmed({note:'add_event',event_title:title,event_date:fmtDate(date),event_time:fmtTime(v('ev-time')),event_end_time:fmtTime(v('ev-end')),event_notes:notes,event_member:tag||''})) return;
        closeM('m-event'); clr('ev-title','ev-notes'); toast('Event added.');
        await loadData();
      } finally { btn.disabled = false; btn.textContent = 'Add event'; }
    }
    async function submitTask(btn) {
      if(!btn) btn = document.getElementById('tk-submit');
      const taskId = v('tk-id');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const task = v('tk-title');
        if(!task){ toast('Please enter a task.'); return; }
        const assignee = gc('tk-a') || user || 'Everyone';
        const due = v('tk-due') ? fmtDate(v('tk-due')) : '';
        const dueRaw = v('tk-due') || '';
        const starEl = document.getElementById('tk-stars');
        const stars = isAdultUser && starEl ? Number(starEl.value || 0) : 0;

        if (taskId) {
          const res = await gPost({
            note: 'edit_todo',
            todo_id: taskId,
            todo_task: task,
            todo_assignee: assignee,
            todo_due: due,
            todo_stars: stars
          });
          if (res && res.status === 'ok') {
            if (data.rewards && isAdultUser) {
              if (!Array.isArray(data.rewards.rules)) data.rewards.rules = [];
              data.rewards.rules = data.rewards.rules.filter(r => !(r.type === 'task' && r.sourceId === taskId));
              if (stars > 0) data.rewards.rules.push({ type: 'task', sourceId: taskId, stars: stars });
            }
            const updateItem = item => {
              if (item.id === taskId) {
                item.task = task;
                item.assignee = assignee;
                item.due = due;
                item.dueRaw = dueRaw;
              }
            };
            (data.todos || []).forEach(updateItem);
            (data.schoolTasks || []).forEach(updateItem);
            closeM('m-task');
            clr('tk-title', 'tk-due', 'tk-id');
            toast('Task updated.');
            renderTasks();
            renderHome();
          } else {
            toast((res && res.message) || 'Failed to update task.', true);
          }
        } else {
          const res = await gPost({
            note: 'add_todo',
            todo_task: task,
            todo_assignee: assignee,
            todo_due: due,
            todo_stars: stars
          });
          if (!res || res.status !== 'ok') return;
          if (data.rewards && stars > 0 && res.id) {
            if (!Array.isArray(data.rewards.rules)) data.rewards.rules = [];
            data.rewards.rules = data.rewards.rules.filter(r => !(r.type === 'task' && r.sourceId === res.id));
            data.rewards.rules.push({ type: 'task', sourceId: res.id, stars: stars });
          }
          closeM('m-task'); clr('tk-title', 'tk-due', 'tk-id'); toast('Task added.');
          await loadData();
        }
      } finally {
        btn.disabled = false;
        btn.textContent = taskId ? 'Save changes' : 'Save task';
      }
    }
    async function submitMemory(btn) {
      btn=btn||document.getElementById('mem-submit');
      const account=currentUserEmail,generation=sessionGeneration;
      const active=()=>account===currentUserEmail&&generation===sessionGeneration;
      btn.disabled=true;btn.textContent='Saving…';
      document.querySelector('#m-memory .modal-body').inert=true;
      try {
        const text=v('mem-text');if(!text&&!memImageBase64&&!memoryDraft?.imageUrl){toast('Write a note or attach a photo.');return;}
        await saveMemoryDraft({text,date:v('mem-date')||schoolToday(),type:gc('mt')||'Moment',person:gc('mp')||'Everyone',member:user,email:account,image:memImageBase64},active);
        if(!active())return;
        memoryDraft=null;clearMemoryFilePreview();closeM('m-memory');clr('mem-text');toast('Saved to your family memories.');
      } catch(err){if(active())showError(err.message||'Could not save. Your note and photo are still here. Try again.');}
      finally{if(active()){document.querySelector('#m-memory .modal-body').inert=false;btn.disabled=false;btn.textContent='Save memory';}}
    }
    async function submitBirthday(btn) {
      if(!btn) btn = document.getElementById('bd-submit');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const name = v('bd-name'), month = v('bd-month'), day = v('bd-day');
        if(!name||!month||!day){ toast('Please enter a name, month, and day.'); return; }
        if (!await saveConfirmed({note:'add_birthday',name,type:gc('bdt')||'Birthday',date:month+'-'+String(day).padStart(2,'0'),year:v('bd-year'),notes:v('bd-notes')})) return;
        closeM('m-birthday'); clr('bd-name','bd-day','bd-year','bd-notes'); toast('Birthday saved.');
        await loadData();
      } finally { btn.disabled = false; btn.textContent = 'Save'; }
    }
    async function submitBudget(btn) {
      if(!btn) btn = document.getElementById('bud-submit');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const group = v('bud-grp'), amt = parseFloat(v('bud-amt')), account = document.getElementById('bud-account').value;
        if(!group||isNaN(amt)||amt<=0){ toast('Please enter a valid amount.'); return; }
        if (!await saveConfirmed({note:'set_budget',group,budget:amt,account})) return;
        closeM('m-budget'); clr('bud-amt'); toast('Budget saved.');
        await loadData();
      } finally { btn.disabled = false; btn.textContent = 'Set budget'; }
    }
    async function submitFert(btn) {
      if(!btn) btn = document.getElementById('fert-submit');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const date = v('fert-date');
        if(!date){ toast('Please select a date.'); return; }
        if (!await saveConfirmed({note:'add_fertility',fertility_type:gc('ft')||'Period Start',fertility_date:fmtDate(date),fertility_notes:v('fert-notes')})) return;
        clr('fert-notes'); toast('Cycle entry saved.');
        await loadData();
      } finally { btn.disabled = false; btn.textContent = 'Save entry'; }
    }
    async function submitRecurring(btn) {
      if(!btn) btn = document.getElementById('rc-submit');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const name = v('rc-name'), amt = parseFloat(v('rc-amt')), day = parseInt(v('rc-day'));
        if(!name||isNaN(amt)||isNaN(day)||day<1||day>28){ toast('Please complete all fields (day: 1–28).'); return; }
        if (!await saveConfirmed({note:'add_recurring',rec_name:name,rec_amount:amt,rec_day:day,rec_category:v('rc-cat'),rec_account:gc('rca')||'Family'})) return;
        closeM('m-recurring'); clr('rc-name','rc-amt','rc-day'); toast('Recurring expense saved.');
        await loadData();
      } finally { btn.disabled = false; btn.textContent = 'Save'; }
    }
    async function submitExpense(btn) {
      if(!btn) btn = document.getElementById('ex-submit');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const desc = v('ex-desc'), amt = parseFloat(v('ex-amt')), date = v('ex-date');
        if(!desc||isNaN(amt)||amt<=0||!date){ toast('Please enter a description, amount, and date.'); return; }
        if (!await saveConfirmed({note:'add_expense',ex_desc:desc,ex_amount:amt,ex_date:fmtDate(date),ex_category:v('ex-cat'),ex_account:gc('exa')||'Family'})) return;
        closeM('m-expense'); clr('ex-desc','ex-amt'); toast('Expense saved.');
        await loadData();
      } finally { btn.disabled = false; btn.textContent = 'Save expense'; }
    }
    function applyActivityPreset(act) {
      const actInput = document.getElementById('sch-act');
      const childSelect = document.getElementById('sch-child');
      const locInput = document.getElementById('sch-loc');
      const notesInput = document.getElementById('sch-notes');
      if (act === 'Sailing') {
        if (childSelect) childSelect.value = 'Mikaela';
        if (actInput) actInput.value = 'Sailing Practice';
        if (locInput && !locInput.value) locInput.value = 'SAF Yacht Club';
        if (notesInput && !notesInput.value) notesInput.value = 'Laser / Optimist session';
      } else if (act === 'Ballet') {
        if (childSelect) childSelect.value = 'Meaghan';
        if (actInput) actInput.value = 'Ballet Class';
        if (locInput && !locInput.value) locInput.value = 'Ballet Studio';
        if (notesInput && !notesInput.value) notesInput.value = 'RAD syllabus class';
      } else if (act === 'Piano') {
        if (actInput) actInput.value = 'Piano Lesson';
        if (notesInput && !notesInput.value) notesInput.value = 'Scales & exam pieces';
      } else if (act === 'Swim') {
        if (actInput) actInput.value = 'Swimming Training';
        if (locInput && !locInput.value) locInput.value = 'Swimming Complex';
      }
    }
    window.applyActivityPreset = applyActivityPreset;

    async function submitSchedule(btn) {
      if(!btn) btn = document.getElementById('sch-submit');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const child = document.getElementById('sch-child').value, activity = document.getElementById('sch-act').value;
        const dateVal = document.getElementById('sch-date').value, time = document.getElementById('sch-time').value;
        const endTime = document.getElementById('sch-end-time').value, location = document.getElementById('sch-loc').value;
        const notes = document.getElementById('sch-notes').value;
        const addChecklist = document.getElementById('sch-add-checklist')?.checked;
        if(!activity){ alert('Please enter activity name.'); return; }
        if(!dateVal){ alert('Please select a date.'); return; }
        const title = child + ' - ' + activity;
        if (!await saveConfirmed({note:'add_event',event_title:title,event_child:child,event_member:child,event_date:fmtDate(dateVal),event_time:time,event_end_time:endTime,event_location:location,event_notes:notes})) return;

        let checklistFailed = false;
        if (addChecklist) {
          const actLower = activity.toLowerCase();
          const tplKey = actLower.includes('sail') ? 'sailing' : actLower.includes('ballet') || actLower.includes('dance') ? 'ballet' : actLower.includes('swim') ? 'swim' : '';
          if (tplKey && typeof ACTIVITY_TEMPLATES !== 'undefined' && ACTIVITY_TEMPLATES[tplKey]) {
            const prepDay = typeof schoolDayOffset === 'function' ? schoolDayOffset(dateVal, -1) : dateVal;
            for (const item of ACTIVITY_TEMPLATES[tplKey].tasks) {
              const saved = await saveConfirmed({
                note: 'add_todo',
                todo_task: item.title,
                todo_assignee: child,
                todo_due: prepDay ? fmtDate(prepDay) : ''
              });
              if (!saved) { checklistFailed = true; break; }
            }
          }
        }

        closeM('m-timetable-add'); clr('sch-act','sch-time','sch-end-time','sch-loc','sch-notes'); toast(checklistFailed ? 'Activity saved, but preparation tasks are incomplete. Add the missing tasks from Tasks.' : 'Activity saved.', checklistFailed);
        await loadData();
      } finally { btn.disabled = false; btn.textContent = 'Save activity'; }
    }
    async function submitAppreciation(btn) {
      if(!btn) btn = document.getElementById('love-submit');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const msg = v('love-note-msg');
        if(!msg){ toast('Please enter a note.'); return; }
        const res = await gPost({note:'add_appreciation',message:msg});
        if(res && res.status === 'ok'){ closeM('m-love-note'); toast('Note saved to the jar.'); await loadData(); } else toast('Could not save note.', true);
      } finally { btn.disabled = false; btn.textContent = 'Save note'; }
    }
    async function submitLoveCheckin(btn) {
      if(!btn) btn = document.getElementById('checkin-submit');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const selectedMoods = [];
        document.querySelectorAll('#checkin-moods .checkin-tag.sel').forEach(t => selectedMoods.push(t.textContent.trim()));
        const notes = v('checkin-notes'), focus = v('checkin-focus');
        const res = await gPost({note:'add_love_checkin',battery:selectedCheckinBattery,moods:selectedMoods.join(', '),notes:notes,focus:focus});
        
        if(res && res.status === 'ok'){
          closeM('m-love-checkin');
          toast('Check-in saved.');
          await loadData();
        } else {
          const errMsg = (res && res.message) ? res.message : 'Unknown error';
          showError('Error saving check-in: ' + errMsg);
        }
      } catch (err) {
        console.error('Check-in error:', err);
        showError('Client error: ' + err.message);
      } finally {
        btn.disabled = false; btn.textContent = 'Save Check-in';
      }
    }

    // ─── US (Connection Sanctuary) ────────────────────────────
    const DEEP_QUESTIONS = [
      "What is a memory of us that always makes you smile?",
      "What is a dream you have for us in the next 5 years?",
      "What is one thing I did recently that made you feel deeply loved?",
      "What does a perfect day of quality time look like for us now?",
      "If we could travel anywhere together next month, money aside, where would we go?",
      "What is a hobby or activity you've always wanted us to try together?",
      "What are you most grateful for in our marriage right now?",
      "In what ways do you think we've grown closest over the past year?",
      "What is a small, everyday gesture of mine that you appreciate but rarely mention?",
      "If you could describe our love story in three words, what would they be?",
      "What is something you feel stressed about right now that I can help support you with?",
      "What was your very first impression of me, and how has it changed?",
      "If we could slow down time for a day, how would you want to spend it together?",
      "What is a song, movie, or book that reminds you of our relationship?",
      "What is a core strength of our relationship that you think helps us face challenges?",
      "What is a memory from our dating years that still feels fresh to you?",
      "How can I better show up for you when you are feeling overwhelmed?",
      "What is something new you've learned about me recently?",
      "What area of our family life do you think we are managing best as a team?",
      "What is one area of our relationship you would love to nurture more this season?"
    ];
    const DATE_IDEAS = [
      "Cook a completely new 3-course recipe together from scratch.",
      "Recreate our very first date as closely as possible.",
      "Have a backyard or living room picnic with favorite cheeses and fruits.",
      "Do a cozy board game tournament or video game night together.",
      "Take a scenic night drive and park somewhere to stargaze or look at city lights.",
      "Visit a local art gallery, museum, or botanical garden.",
      "Plan a 'tourist in our own city' afternoon, visiting spots we've never been to.",
      "Go for a morning hike or park walk followed by a brunch date.",
      "Set up a cozy indoor blanket fort and watch a favorite movie from our childhoods.",
      "Book a couple's spa or do DIY massage night at home with soothing music.",
      "Go to a bookstore, pick out a book for each other, and read together at a coffee shop.",
      "Have a themed dinner night (e.g., Italian, Japanese, Mexican) with matching music.",
      "Take an online or local cooking, pottery, or painting class together.",
      "Go to a local live comedy show or music performance.",
      "Write down a bucket list of 10 things we want to do together before the year ends.",
      "Plan a sunrise breakfast date (wake up early, get coffee, and watch the sun rise).",
      "Visit a local arcade or bowling alley for a playful, competitive night.",
      "Do a grocery store scavenger hunt: each partner gets $10 to buy surprise items for the other.",
      "Have a sunset walk along the beach or a scenic waterfront.",
      "Do a memory lane date: look through old photo albums or watch wedding/early videos."
    ];
    let currentRouletteTab = 'q';
    let selectedCheckinBattery = 5;

    function renderUs() {
      const container = document.getElementById('us-container');
      if(!container) return;
      if(user !== 'Marcus' && user !== 'Eleanor'){
        container.innerHTML = `<div class="us-card" style="text-align:center; margin-top:24px;"><div class="us-placeholder"><div class="us-placeholder-icon">🔒</div><h2 style="color:var(--primary);font-weight:700;">Couple space</h2><p class="adults-only" style="margin-top:14px;color:var(--text-secondary);">Visible only to selected adults.</p></div></div>`;
        return;
      }
      const partner = user === 'Marcus' ? 'Eleanor' : 'Marcus';
      const apps = data.appreciations || [];
      let lockedCount = 0, unlockedApps = [];
      apps.forEach(a => {
        const isToMe = (a.recipient === user);
        const isLocked = a.revealDate ? (new Date() < new Date(a.revealDate)) : false;
        if(isLocked) lockedCount++;
        else if(isToMe) unlockedApps.push(a);
      });
      const checkins = data.loveCheckins || [];
      const marcusCheckin = checkins.filter(c=>c.user==='Marcus').sort((a,b)=>b.timestamp.localeCompare(a.timestamp))[0];
      const eleanorCheckin = checkins.filter(c=>c.user==='Eleanor').sort((a,b)=>b.timestamp.localeCompare(a.timestamp))[0];
      let alignmentHtml = '';
      if(marcusCheckin || eleanorCheckin){
        let marcusInfo = '<div style="font-size:11px;color:var(--text-muted);margin-top:6px;">No check-in yet</div>';
        if(marcusCheckin) marcusInfo = `<div style="font-size:18px;margin:4px 0;">${'❤️'.repeat(marcusCheckin.battery)}</div><div style="font-size:10px;color:var(--text-secondary);">Mood: ${escapeHtml(marcusCheckin.moods.join(', ')||'Normal')}</div><div style="font-size:10px;color:var(--text-muted);margin-top:2px;font-style:italic;">"${escapeHtml(marcusCheckin.notes)||'No notes'}"</div>`;
        let eleanorInfo = '<div style="font-size:11px;color:var(--text-muted);margin-top:6px;">No check-in yet</div>';
        if(eleanorCheckin) eleanorInfo = `<div style="font-size:18px;margin:4px 0;">${'❤️'.repeat(eleanorCheckin.battery)}</div><div style="font-size:10px;color:var(--text-secondary);">Mood: ${escapeHtml(eleanorCheckin.moods.join(', ')||'Normal')}</div><div style="font-size:10px;color:var(--text-muted);margin-top:2px;font-style:italic;">"${escapeHtml(eleanorCheckin.notes)||'No notes'}"</div>`;
        alignmentHtml = `<div style="display:flex;gap:12px;margin-top:8px;"><div style="flex:1;background:var(--bg-card);border-radius:12px;padding:10px;border:1px solid var(--border-color);text-align:center;"><div style="font-weight:700;color:var(--primary);font-size:12px;">👨 Marcus</div>${marcusInfo}</div><div style="flex:1;background:var(--bg-card);border-radius:12px;padding:10px;border:1px solid var(--border-color);text-align:center;"><div style="font-weight:700;color:var(--primary);font-size:12px;">👩 Eleanor</div>${eleanorInfo}</div></div>`;
      } else { alignmentHtml = '<div style="text-align:center;font-size:12px;color:var(--text-muted);padding:8px;">No check-ins logged yet. Add your check-in below.</div>'; }
      const historyCheckins = [...checkins].sort((a,b)=>b.timestamp.localeCompare(a.timestamp));
      let historyHtml = '';
      if(historyCheckins.length===0) historyHtml = '<div style="text-align:center;font-size:11px;color:var(--text-muted);padding:8px;">No past check-ins logged yet.</div>';
      else {
        historyHtml = historyCheckins.slice(0,10).map(c => {
          const dateStr = fmtDate(c.timestamp.split(' ')[0]);
          const userEmoji = c.user==='Marcus'?'👨':'👩';
          return `<div style="padding:6px 0;border-bottom:1px solid var(--border-color);"><div style="font-size:11px;display:flex;justify-content:space-between;align-items:center;"><span><strong>${escapeHtml(dateStr)}</strong> · ${userEmoji} ${escapeHtml(c.user)}</span><span style="color:#ef4444;font-weight:700;">${'❤️'.repeat(c.battery)}</span></div>${c.moods&&c.moods.length?`<div style="font-size:10px;color:var(--text-secondary);margin-left:14px;margin-top:2px;">Moods: ${escapeHtml(c.moods.join(', '))}</div>`:''}${c.notes?`<div style="font-size:10px;color:var(--text-muted);margin-left:14px;margin-top:2px;font-style:italic;">"${escapeHtml(c.notes)}"</div>`:''}${c.focus?`<div style="font-size:10px;color:var(--primary);margin-left:14px;margin-top:2px;font-weight:500;">Next week focus: ${escapeHtml(c.focus)}</div>`:''}</div>`;
        }).join('');
      }
      let unlockedHtml = '';
      if(unlockedApps.length===0) {
        unlockedHtml = '<div style="text-align:center;padding:16px;border:1px dashed rgba(168,95,137,0.3);border-radius:12px;color:var(--text-muted);font-size:12px;">No notes ready to open yet. Write an appreciation for Friday date night.</div>';
      } else {
        unlockedHtml = unlockedApps.map(a => `<div class="envelope"><div style="font-size:20px;">✉️</div><div style="flex:1;"><div class="envelope-message">"${escapeHtml(a.message)}"</div><div class="envelope-meta">Revealed on ${fmtDate(a.revealDate? a.revealDate.split('T')[0] : '')}</div></div></div>`).join('');
      }

      // ─── BUCKET LIST ──────────────────────────────────────────
      const bucketItems = bucketList || [];
      let bucketHtml = '';
      if(bucketItems.length===0) {
        bucketHtml = '<div style="text-align:center;padding:8px;color:var(--text-muted);font-size:12px;">No shared goals yet. Add one when you are ready.</div>';
      } else {
        bucketHtml = bucketItems.map(item => `
          <div class="bucket-item">
            <span class="text ${item.completed?'done':''}">${escapeHtml(item.item)}</span>
            <div class="actions">
              <button onclick="toggleBucketItem('${item.id}')" title="Toggle complete">${item.completed?'✅':'⬜'}</button>
              <button onclick="deleteBucketItem('${item.id}')" title="Delete">🗑️</button>
            </div>
          </div>
        `).join('');
      }
      const bucketSection = `
        <div class="us-card">
          <div class="us-card-title">Shared goals</div>
          <div id="bucket-list-container">${bucketHtml}</div>
          <div class="bucket-add">
            <input type="text" id="bucket-input" placeholder="Add a goal…" onkeypress="if(event.key==='Enter') addBucketItem()">
            <button onclick="addBucketItem()">Add</button>
          </div>
        </div>
      `;

      const rouletteHtml = `
        <div class="us-card">
          <div class="us-card-title">Conversation sparks</div>
          <div class="roulette-tabs">
            <div class="roulette-tab active" id="r-tab-q" onclick="switchRouletteTab('q')">Deep conversation</div>
            <div class="roulette-tab" id="r-tab-d" onclick="switchRouletteTab('d')">Date night ideas</div>
          </div>
          <div class="roulette-wrapper">
            <div class="roulette-card" id="r-card" onclick="spinRoulette()">
              <div id="r-card-icon" style="font-size:32px;margin-bottom:8px;">✨</div>
              <div class="roulette-prompt" id="r-result-text">Pick a conversation topic</div>
              <div class="roulette-card-sub" id="r-result-sub">Tap to draw a card</div>
            </div>
            <button class="btn btn-sm btn-s" id="btn-spin-again" onclick="spinRoulette()" style="margin-top:8px;display:none;border-color:var(--border-color);color:var(--primary);">Pick another topic</button>
          </div>
        </div>
      `;

      // ─── INTIMACY LOG ─────────────────────────────────────────
      const intimacyEntries = data.intimacyLog || [];
      let intimacyHtml = '';
      if (intimacyEntries.length === 0) {
        intimacyHtml = '<div style="text-align:center;padding:12px;border:1px dashed rgba(168,95,137,0.3);border-radius:12px;color:var(--text-muted);font-size:12px;">No intimacy entries logged yet.</div>';
      } else {
        intimacyHtml = intimacyEntries.slice(0, 12).map(entry => {
          const hearts = entry.rating > 0 ? '❤️'.repeat(Math.min(5, entry.rating)) : '';
          return `<div class="intimacy-history-item">
            <div style="font-size:18px;">💕</div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
                <strong style="color:var(--primary);">${escapeHtml(entry.date || '—')}</strong>
                <span class="intimacy-hearts" style="font-size:12px;">${hearts}</span>
              </div>
              ${entry.notes ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${escapeHtml(entry.notes)}</div>` : ''}
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">Logged by ${escapeHtml(entry.loggedBy || '')}</div>
            </div>
            <button onclick="deleteIntimacy('${escapeHtml(entry.id)}')" title="Delete" style="background:none;border:none;cursor:pointer;font-size:14px;opacity:0.6;">🗑️</button>
          </div>`;
        }).join('');
      }
      const thisMonthCount = intimacyEntries.filter(e => {
        if (!e.dateRaw) return false;
        const now = new Date();
        const ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        return String(e.dateRaw).startsWith(ym);
      }).length;
      const intimacySection = `
        <div class="us-card">
          <div class="us-card-title">Intimacy log</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">Visible only to selected adults · ${thisMonthCount} this month · ${intimacyEntries.length} total</div>
          <button class="btn btn-sm" onclick="openIntimacyModal()" style="background:var(--primary);color:var(--primary-text);border:none;width:100%;margin-bottom:12px;">Log intimate moment</button>
          <div id="intimacy-list">${intimacyHtml}</div>
        </div>
      `;

      container.innerHTML = `
        <div class="us-header"><h2>Couple space</h2><p>Visible only to selected adults</p></div>
        <div class="us-card"><div class="us-card-title">Daily battery check-in</div>${alignmentHtml}<button class="btn btn-sm" onclick="openLoveCheckinModal()" style="background:var(--primary);color:var(--primary-text);border:none;">Save daily check-in</button>
          <div style="margin-top:12px;border-top:1px dashed var(--border-color);padding-top:10px;"><div style="font-size:12px;font-weight:700;color:var(--primary);display:flex;justify-content:space-between;cursor:pointer;" onclick="toggleCheckinHistory()"><span>Past check-ins</span><span style="font-size:10px;color:var(--text-secondary);" id="history-toggle-icon">Show ▾</span></div><div id="checkin-history-list" style="display:none;flex-direction:column;gap:6px;max-height:180px;overflow-y:auto;padding-right:4px;">${historyHtml}</div></div>
        </div>
        ${intimacySection}
        <div class="us-card"><div class="us-card-title">Appreciation jar</div>
          <div class="jar-container" onclick="triggerJarFloat()"><div class="jar-graphic" id="jar-gfx"><div class="jar-lid"></div><div class="jar-neck"></div><div class="jar-label">Notes</div><div style="font-size:20px;margin-top:45px;">🍯</div></div><div style="text-align:center;margin-top:12px;"><strong style="color:var(--primary);font-size:14px;">${lockedCount} note(s) currently locked</strong><div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">Unlocks Friday at 6:00 PM.</div></div></div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px;"><button class="btn btn-sm" onclick="openAppreciationModal()" style="background:var(--primary);color:var(--primary-text);border:none;">Write appreciation note</button></div>
          <div style="margin-top:10px;"><div style="font-size:12px;font-weight:700;color:var(--primary);margin-bottom:8px;">Notes from ${escapeHtml(partner)}</div><div style="display:flex;flex-direction:column;gap:8px;">${unlockedHtml}</div></div>
        </div>
        ${bucketSection}
        ${rouletteHtml}
      `;
    }

    // ─── INTIMACY LOG ──────────────────────────────────────────
    let selectedIntimacyRating = 0;
    function openIntimacyModal() {
      const dateEl = document.getElementById('intimacy-date');
      if (dateEl) {
        const t = new Date();
        dateEl.value = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
      }
      clr('intimacy-notes');
      selectedIntimacyRating = 0;
      chips('intimacy-rating-chips', ['1', '2', '3', '4', '5'], '', 'int-rating');
      // Map chip selection into selectedIntimacyRating via custom click
      setTimeout(() => {
        document.querySelectorAll('#intimacy-rating-chips .chip').forEach(chip => {
          chip.onclick = function() {
            document.querySelectorAll('#intimacy-rating-chips .chip').forEach(c => c.classList.remove('sel'));
            this.classList.add('sel');
            selectedIntimacyRating = parseInt(this.dataset.v, 10) || 0;
          };
          // prettier labels
          const n = this.dataset.v;
          this.textContent = '❤️'.repeat(parseInt(n, 10) || 1);
        });
      }, 0);
      openM('m-intimacy');
    }
    async function submitIntimacy(btn) {
      if (!btn) btn = document.getElementById('intimacy-submit');
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try {
        // Use ISO yyyy-MM-dd from the date input — do NOT pass fmtDate() display strings
        const date = v('intimacy-date');
        const notes = v('intimacy-notes');
        const rating = selectedIntimacyRating || 0;
        if (!date) { toast('Please select a date.'); return; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          toast('Please enter a valid date.', true);
          return;
        }
        const res = await gPost({
          note: 'add_intimacy',
          intimacy_date: date,
          intimacy_notes: notes,
          intimacy_rating: rating
        });
        if (res && res.status === 'ok') {
          if (!Array.isArray(data.intimacyLog)) data.intimacyLog = [];
          // Prefer server-returned list/entry so UI matches what was written
          if (Array.isArray(res.intimacyLog) && res.intimacyLog.length) {
            data.intimacyLog = mergeIntimacyLogs(data.intimacyLog, res.intimacyLog);
          } else {
            const entry = res.entry || {
              id: res.id || ('local_' + Date.now()),
              date: fmtDate(date),
              dateRaw: date,
              notes: notes,
              rating: rating,
              loggedBy: user || '',
              timestamp: new Date().toISOString()
            };
            data.intimacyLog = mergeIntimacyLogs(data.intimacyLog, [entry]);
          }
          closeM('m-intimacy');
          toast('Intimacy entry saved.');
          renderUs();
          // Refreshes started before this write were invalidated by gPost.
          loadData().then(() => { if (section === 'us') renderUs(); }).catch(() => {});
        } else {
          toast((res && res.message) || 'Could not save. Redeploy Apps Script with latest Code.js if this continues.', true);
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save entry';
      }
    }
    async function deleteIntimacy(id) {
      if (!id || !confirm('Delete this intimacy log entry?')) return;
      const res = await gPost({ note: 'delete_intimacy', id: id });
      if (res && res.status === 'ok') {
        if (Array.isArray(data.intimacyLog)) {
          data.intimacyLog = data.intimacyLog.filter(e => e.id !== id);
        }
        toast('Entry deleted.');
        renderUs();
        await loadData();
        if (section === 'us') renderUs();
      } else {
        toast((res && res.message) || 'Could not delete entry.', true);
      }
    }

    // ─── BUCKET LIST FUNCTIONS ──────────────────────────────
    async function addBucketItem() {
      const input = document.getElementById('bucket-input');
      const text = input.value.trim();
      if(!text) return;
      const res = await gPost({ note: 'add_bucket_item', item: text });
      if(res && res.status === 'ok') {
        input.value = '';
        toast('Goal added.');
        await loadData();
        renderUs();
      } else {
        toast('Could not add goal.', true);
      }
    }
    async function toggleBucketItem(id) {
      const res = await gPost({ note: 'toggle_bucket_item', id: id });
      if(res && res.status === 'ok') {
        toast('Goal updated.');
        await loadData();
        renderUs();
      }
    }
    async function deleteBucketItem(id) {
      if(!confirm('Delete this goal?')) return;
      const res = await gPost({ note: 'delete_bucket_item', id: id });
      if(res && res.status === 'ok') {
        toast('Goal deleted.');
        await loadData();
        renderUs();
      }
    }

    // ─── US ROUlette FUNCTIONS ──────────────────────────────
    function switchRouletteTab(tab) {
      currentRouletteTab = tab;
      document.getElementById('r-tab-q').classList.toggle('active', tab==='q');
      document.getElementById('r-tab-d').classList.toggle('active', tab==='d');
      const card = document.getElementById('r-card');
      if(card) card.classList.remove('spinning');
      document.getElementById('btn-spin-again').style.display = 'none';
      
      const cardIcon = document.getElementById('r-card-icon');
      const cardText = document.getElementById('r-result-text');
      const cardSub = document.getElementById('r-result-sub');
      if(cardIcon && cardText && cardSub) {
        cardIcon.textContent = '✨';
        cardText.textContent = 'Tap to Spin!';
        cardSub.textContent = 'Get a random card';
      }
    }
    function spinRoulette() {
      const card = document.getElementById('r-card');
      if(!card) return;
      card.classList.remove('spinning');
      void card.offsetWidth;
      card.classList.add('spinning');
      let resultText='', categoryText='', icon='✨';
      if(currentRouletteTab === 'q') {
        const idx = Math.floor(Math.random() * DEEP_QUESTIONS.length);
        resultText = DEEP_QUESTIONS[idx];
        categoryText = '💬 Deep Connection Question';
        icon = '💬';
      } else {
        const idx = Math.floor(Math.random() * DATE_IDEAS.length);
        resultText = DATE_IDEAS[idx];
        categoryText = '🍕 Date Night Suggestion';
        icon = '🍕';
      }
      
      setTimeout(() => {
        const cardIcon = document.getElementById('r-card-icon');
        const cardText = document.getElementById('r-result-text');
        const cardSub = document.getElementById('r-result-sub');
        if(cardIcon && cardText && cardSub) {
          cardIcon.textContent = icon;
          cardText.textContent = resultText;
          cardSub.textContent = categoryText;
        }
      }, 150);
      
      setTimeout(() => { document.getElementById('btn-spin-again').style.display = 'inline-block'; }, 600);
    }
    function triggerJarFloat() {
      const jar = document.getElementById('jar-gfx');
      if(!jar) return;
      jar.style.transform = 'scale(0.95)';
      setTimeout(()=>{ jar.style.transform = 'scale(1.05)'; },100);
      setTimeout(()=>{ jar.style.transform = ''; },250);
      const heartEmojis = ['❤️','💖','💝','💕','✨'];
      for(let i=0; i<4; i++) {
        setTimeout(()=>{
          const h = document.createElement('div');
          h.className = 'heart-float';
          h.textContent = heartEmojis[Math.floor(Math.random()*heartEmojis.length)];
          h.style.left = (jar.offsetLeft + jar.offsetWidth/2 - 10 + (Math.random()*30-15)) + 'px';
          h.style.top = (jar.offsetTop + 40) + 'px';
          h.style.setProperty('--rx', (Math.random()*60-30)+'px');
          jar.parentNode.appendChild(h);
          setTimeout(()=>h.remove(), 3000);
        }, i*150);
      }
    }
    function openAppreciationModal() { clr('love-note-msg'); openM('m-love-note'); }
    function openLoveCheckinModal() {
      selectedCheckinBattery = 5;
      updateCheckinBatteryHearts();
      document.querySelectorAll('#checkin-moods .checkin-tag').forEach(t=>t.classList.remove('sel'));
      clr('checkin-notes','checkin-focus');
      openM('m-love-checkin');
    }
    function setCheckinBattery(val) { selectedCheckinBattery=val; updateCheckinBatteryHearts(); }
    function updateCheckinBatteryHearts() {
      const hearts = document.querySelectorAll('#checkin-battery-slider .battery-heart');
      hearts.forEach((h,idx)=>h.classList.toggle('active', idx<selectedCheckinBattery));
    }
    function toggleMoodTag(el) { el.classList.toggle('sel'); }
    function toggleCheckinHistory() {
      const list = document.getElementById('checkin-history-list');
      const icon = document.getElementById('history-toggle-icon');
      if(list) {
        if(list.style.display === 'none' || !list.style.display) { list.style.display='flex'; if(icon) icon.textContent='Hide ▴'; }
        else { list.style.display='none'; if(icon) icon.textContent='Show ▾'; }
      }
    }

    // Memory listeners and archive pagination are in js/memories.js.

    // Helper: convert dataURI to Blob
    function dataURItoBlob(dataURI) {
      const byteString = atob(dataURI.split(',')[1]);
      const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
      return new Blob([ab], { type: mimeString });
    }

    function handleMemoryFileSelect(input) {
      const file = input.files[0];
      if (!file) return;
      
      if (!file.type.startsWith('image/')) {
        toast('Please select an image file.');
        return;
      }
      
      const account=currentUserEmail,generation=sessionGeneration;
      const reader = new FileReader();
      reader.onload = function(e) {
        if(account!==currentUserEmail||generation!==sessionGeneration)return;
        const img = new Image();
        img.onload = function() {
          if(account!==currentUserEmail||generation!==sessionGeneration)return;
          discardMemoryUpload();
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const MAX_WIDTH = 1024;
          const MAX_HEIGHT = 1024;
          
          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          memImageBase64 = canvas.toDataURL('image/jpeg', 0.8);
          
          const previewArea = document.getElementById('mem-img-preview');
          const thumbnail = document.getElementById('mem-preview-thumbnail');
          if (previewArea && thumbnail) {
            thumbnail.src = memImageBase64;
            previewArea.style.display = 'flex';
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    function clearMemoryFilePreview() {
      discardMemoryUpload();
      memImageBase64 = null;
      const fileInput = document.getElementById('mem-file-input');
      if (fileInput) fileInput.value = '';
      const previewArea = document.getElementById('mem-img-preview');
      if (previewArea) previewArea.style.display = 'none';
    }

    // ─── OTHER HELPERS ─────────────────────────────────────────
    function openChatLightbox(url) {
      if (!isSafeMediaUrl(url)) return;
      const lightbox = document.getElementById('chat-lightbox');
      const img = document.getElementById('lightbox-img');
      if (lightbox && img) {
        img.src = url;
        lightbox.classList.add('open');
      }
    }

    function closeChatLightbox() {
      const lightbox = document.getElementById('chat-lightbox');
      if (lightbox) {
        lightbox.classList.remove('open');
      }
    }

    function toggleMenuDrawer(open) {
      const overlay = document.getElementById('drawer-overlay');
      const drawer = document.getElementById('menu-drawer');
      if (overlay && drawer) {
        if (open) {
          overlay.classList.add('open');
          drawer.classList.add('open');
        } else {
          overlay.classList.remove('open');
          drawer.classList.remove('open');
        }
      }
    }

    function navigateDrawer(id) {
      toggleMenuDrawer(false);
      goTo(id);
    }

    function getCategoryEmoji(cat) {
      const c = String(cat).toLowerCase();
      if (c.includes('eat') || c.includes('food') || c.includes('dinner') || c.includes('lunch') || c.includes('snack') || c.includes('cafe')) return '🍔';
      if (c.includes('transport') || c.includes('taxi') || c.includes('grab') || c.includes('mrt') || c.includes('bus')) return '🚗';
      if (c.includes('gas') || c.includes('petrol') || c.includes('sinopec') || c.includes('spc') || c.includes('caltex') || c.includes('shell')) return '⛽';
      if (c.includes('child') || c.includes('kid') || c.includes('school') || c.includes('nafa') || c.includes('violin') || c.includes('tution')) return '👧';
      if (c.includes('self') || c.includes('care') || c.includes('spa') || c.includes('hair') || c.includes('facial') || c.includes('massage')) return '💆‍♀️';
      if (c.includes('shop') || c.includes('clothing') || c.includes('clothes') || c.includes('shein') || c.includes('shopee') || c.includes('lazada')) return '🛍️';
      if (c.includes('grocery') || c.includes('supermarket') || c.includes('ntuc') || c.includes('fairprice') || c.includes('cold storage') || c.includes('sheng siong')) return '🛒';
      if (c.includes('finance') || c.includes('bill') || c.includes('insurance') || c.includes('mobile') || c.includes('teleco') || c.includes('singtel') || c.includes('starhub') || c.includes('m1')) return '📱';
      if (c.includes('travel') || c.includes('flight') || c.includes('hotel') || c.includes('holiday')) return '✈️';
      return '💰';
    }

    // ─── HABITS ────────────────────────────────────────────────
    let habitViewDate = '';
    let habitShowArchived = false;
    let habitLayout = 'cards';
    let habitPerson = 'All';
    function renderHabits() {
      const root = document.getElementById('habits-container'); if (!root) return;
      const date = habitViewDate || schoolToday();
      const habits = nestVisibleHabits().filter(h => habitShowArchived && isAdultUser ? h.state === 'archived' : h.state !== 'archived').filter(h => !isAdultUser || habitPerson === 'All' || h.member === habitPerson || h.member === 'Everyone');
      root.innerHTML = `<div class="habit-toolbar"><label>Day<input type="date" id="habit-view-date" value="${date}"></label>
        <label>View<select id="habit-layout"><option value="cards" ${habitLayout==='cards'?'selected':''}>Cards</option><option value="list" ${habitLayout==='list'?'selected':''}>List</option></select></label>
        ${isAdultUser ? `<label>Person<select id="habit-person">${['All','Marcus','Eleanor','Mikaela','Meaghan'].map(m=>`<option value="${m}" ${habitPerson===m?'selected':''}>${m==='All'?'Everyone':m}</option>`).join('')}</select></label>` : ''}
        <button class="btn btn-p" onclick="openAddHabitModal()">+ New habit</button>
        ${isAdultUser ? `<button class="btn btn-s" onclick="habitShowArchived=!habitShowArchived;renderHabits()">${habitShowArchived ? 'Active habits' : 'Archived habits'}</button>` : ''}</div>
        <p class="habit-intro">Small steps on the days that work for you. A rest day is part of the routine.</p>
        <div class="habit-grid ${habitLayout==='list'?'habit-list':''}">${habits.map(h => {
          const member = h.member === 'Everyone' ? (isAdultUser && habitPerson !== 'All' ? habitPerson : user) : h.member;
          const done = habitDone(h,member,date), due = habitDue(h,member,date), state = h.state || 'active';
          const week = habitWeek(date);
          const dots = Array.from({length:7},(_,i)=>{const d=schoolDayOffset(week.start,i),logged=habitDone(h,member,d),scheduled=habitDue(h,member,d);return `<span class="habit-day ${logged?'done':scheduled?'due':'rest'}" title="${d}: ${logged?'Completed':scheduled?'Scheduled':'Rest day'}"><small>${HABIT_DAYS[new Date(d+'T00:00:00Z').getUTCDay()]}</small><span>${logged?'✓':scheduled?'·':'–'}</span></span>`;}).join('');
          const logs = (data.habitLogs || []).filter(l => l.habitId === h.id && (isAdultUser ? habitPerson==='All'||l.member===habitPerson : l.member === user)).slice(0,5);
          const canEdit = isAdultUser || h.member === user;
          return `<article class="habit-card"><div class="habit-card-title"><span aria-hidden="true">${escapeHtml(h.emoji || '🌱')}</span><div><h3>${escapeHtml(h.habit)}${rewardBadge('habit',h.id)}</h3><p>${h.member==='Everyone'?'Shared · each person has their own progress':escapeHtml(h.member)}</p></div></div>
            <p class="habit-schedule">${escapeHtml(habitScheduleLabel(h))}${state!=='active'?' · '+escapeHtml(state):''}</p>
            ${h.schedule==='weekly'?`<p class="habit-weekly">${escapeHtml(habitProgressLabel(h,member,date))}${h.member==='Everyone'?' · '+escapeHtml(member):''}</p>`:''}
            <div class="habit-week" aria-label="${escapeHtml(member)}’s week">${dots}</div>
            <div class="habit-actions">${state==='active' ? done ? '<span class="habit-complete" role="status">✓ Done for this day</span>' : due ? `<button class="btn btn-p" onclick="${h.member==='Everyone'&&isAdultUser&&habitPerson==='All'?`openHabitLogModal('${h.id}','${date}')`:`logHabitQuick('${h.id}','${date}','','${member}')`}" ${date>schoolToday()||pendingHabitLogs.has(habitPendingKey(h.id,member,date))?'disabled':''}>${date>schoolToday()?'Do this on the day':h.member==='Everyone'&&isAdultUser&&habitPerson==='All'?'Log for a member':isAdultUser&&member!==user?'✓ Log for '+escapeHtml(member):'✓ I did it'}</button>` : `<span class="habit-rest">${h.schedule==='weekly'?'Weekly goal reached. Enjoy the breathing room.':'Rest day'}</span>` : ''}
            ${state==='active'&&date<=schoolToday()?`<button class="btn btn-s" onclick="openHabitLogModal('${h.id}','${date}')">Add notes${h.member==='Everyone'&&isAdultUser?' / log for someone':''}</button>`:''}
            ${canEdit?`<button class="btn btn-s" onclick="openAddHabitModal('${h.id}')">Edit</button>`:''}
            ${isAdultUser?`<button class="btn btn-s" onclick="setHabitState('${h.id}','${state==='active'?'paused':'active'}')">${state==='active'?'Pause':state==='archived'?'Restore':'Resume'}</button>${state!=='archived'?`<button class="btn btn-s" onclick="delHabit('${h.id}')">Archive</button>`:''}`:''}</div>
            <details class="habit-history"><summary>Recent history${h.member==='Everyone'&&isAdultUser?' · all members':''}</summary>${logs.length?logs.map(l=>`<div><span>${escapeHtml(l.member)} · ${fmtDate(l.date)}${l.notes?' · '+escapeHtml(l.notes):''}</span><button class="btn btn-s btn-sm" onclick="delHabitLog('${l.id}')" aria-label="Remove ${escapeHtml(l.member)}’s entry on ${l.date}">Remove entry</button></div>`).join(''):'<p>No entries yet.</p>'}</details></article>`;
        }).join('') || `<div class="empty">${habitShowArchived?'No archived habits.':'No habits yet. Add a small routine to get started.'}</div>`}</div>`;
      document.getElementById('habit-layout').onchange = e => {habitLayout=e.target.value;renderHabits();};
      const personSelect=document.getElementById('habit-person');
      if(personSelect)personSelect.onchange=e=>{habitPerson=e.target.value;renderHabits();};
      document.getElementById('habit-view-date').onchange = e => {habitViewDate=e.target.value||schoolToday();renderHabits();};
    }
    const pendingHabitLogs = new Set();
    async function logHabitQuick(habitId, dateStr, notes, logMember) {
      const h=(data.habits||[]).find(h=>h.id===habitId); if(!h)return false;
      const member=h.member==='Everyone'?(isAdultUser?(logMember||user):user):h.member;
      dateStr=dateStr||schoolToday(); const key=habitPendingKey(habitId,member,dateStr);
      if(pendingHabitLogs.has(key))return false;
      const account=currentUserEmail,generation=sessionGeneration;
      pendingHabitLogs.add(key);renderHabits();renderHome();
      try {
        const res=await gPost({note:'log_habit',habit_id:habitId,date:dateStr,notes:notes||'',log_member:member});
        if(account!==currentUserEmail||generation!==sessionGeneration)return false;
        if(!res||res.status!=='ok'||!res.log){showError(res?.message||'Could not save. Try again when connected.');return false;}
        data.habitLogs=(data.habitLogs||[]).filter(l=>l.id!==res.log.id);data.habitLogs.unshift(res.log);
        if(res.rewards)data.rewards=res.rewards;
        renderHabits();renderHome();applyRewardResult(res);
        toast(res.duplicate?'Already logged for this day.':`${member===user?'You':member} completed ${h.habit}.`);return true;
      } catch (err) {if(account===currentUserEmail&&generation===sessionGeneration)showError('Could not save. Try again when connected.');return false;}
      finally {if(account===currentUserEmail&&generation===sessionGeneration){pendingHabitLogs.delete(key);renderHabits();renderSchoolHome();}}
    }
    window.logHabitQuick = logHabitQuick;
    async function delHabitLog(logId) {
      if(!confirm('Remove this entry? Earned stars will stay with you.'))return;
      if(!await saveConfirmed({note:'delete_habit_log',log_id:logId}))return;
      data.habitLogs=(data.habitLogs||[]).filter(l=>l.id!==logId);renderHabits();renderHome();toast('Entry removed.');
    }
    function openHabitLogModal(habitId,dateStr,member) {
      const h=(data.habits||[]).find(h=>h.id===habitId);if(!h)return;
      document.getElementById('hl-habit-id').value=habitId;
      document.getElementById('hl-title').textContent=h.habit;
      document.getElementById('hl-date').value=dateStr||schoolToday();document.getElementById('hl-date').max=schoolToday();
      document.getElementById('hl-notes').value='';
      const select=document.getElementById('hl-member');
      const members=h.member==='Everyone'&&isAdultUser?FAM.filter(m=>m!=='Everyone'):[h.member==='Everyone'?user:h.member];
      select.innerHTML=members.map(m=>`<option value="${m}">${m}</option>`).join('');select.value=member||members.find(m=>m===user)||members[0];
      select.disabled=members.length===1;
      openM('m-habit-log');
    }
    async function submitHabitLog(btn) {
      btn=btn||document.getElementById('hl-submit');btn.disabled=true;btn.textContent='Saving…';
      try {if(await logHabitQuick(v('hl-habit-id'),v('hl-date'),v('hl-notes'),v('hl-member')))closeM('m-habit-log');}
      finally {btn.disabled=false;btn.textContent='Save entry';}
    }
    function updateHabitScheduleFields() {
      const mode=v('hab-schedule');document.getElementById('hab-days-field').hidden=mode!=='weekdays';document.getElementById('hab-target-field').hidden=mode!=='weekly';
    }
    function openAddHabitModal(id) {
      const h=(data.habits||[]).find(h=>h.id===id);
      document.getElementById('hab-id').value=h?.id||'';document.getElementById('hab-name').value=h?.habit||'';document.getElementById('hab-emoji').value=h?.emoji||'🌱';
      const members=h?[h.member]:isAdultUser?FAM:[user];
      document.getElementById('hab-member').innerHTML=members.map(m=>`<option value="${m}">${m==='Everyone'?'Everyone · shared habit':m}</option>`).join('');document.getElementById('hab-member').value=h?.member||user;
      document.getElementById('hab-member').disabled=!!h;
      document.getElementById('hab-schedule').value=h?.schedule||'daily';document.getElementById('hab-target').value=h?.weeklyTarget||3;
      document.getElementById('hab-days').innerHTML=[1,2,3,4,5,6,0].map(d=>`<label><input type="checkbox" value="${d}" ${(h?.weekdays||[1,2,3,4,5]).includes(d)?'checked':''}>${HABIT_DAYS[d]}</label>`).join('');
      document.getElementById('hab-modal-title').textContent=h?'Edit habit':'Add habit';document.getElementById('hab-submit').textContent=h?'Save habit':'Add habit';updateHabitScheduleFields();openM('m-habit');
    }
    async function submitNewHabit(btn) {
      btn=btn||document.getElementById('hab-submit');btn.disabled=true;btn.textContent='Saving…';
      const id=v('hab-id');
      try {
        const name=v('hab-name');if(!name||name.length>80){showError('Use a habit name up to 80 characters.');return;}
        const weekdays=Array.from(document.querySelectorAll('#hab-days input:checked'),el=>Number(el.value));
        if(v('hab-schedule')==='weekdays'&&!weekdays.length){showError('Choose at least one day.');return;}
        if(v('hab-schedule')==='weekly'&&(!Number.isInteger(Number(v('hab-target')))||Number(v('hab-target'))<1||Number(v('hab-target'))>7)){showError('Choose a weekly target from 1 to 7.');return;}
        if(!await saveConfirmed({note:id?'edit_habit':'add_habit',habit_id:id,habit:name,member:v('hab-member'),emoji:v('hab-emoji'),schedule:v('hab-schedule'),weekdays,weekly_target:Number(v('hab-target'))}))return;
        closeM('m-habit');toast(id?'Habit updated.':'Habit added.');await loadData();
      } finally {btn.disabled=false;btn.textContent=id?'Save habit':'Add habit';}
    }
    async function setHabitState(id,state) {
      if(!isAdultUser)return;
      if(!await saveConfirmed({note:'set_habit_state',habit_id:id,state}))return;
      toast(state==='archived'?'Habit archived. History and stars are kept.':state==='paused'?'Habit paused.':'Habit active again.');await loadData();
    }
    async function delHabit(id) {
      if(!isAdultUser||!confirm('Archive this habit? Its history and earned stars will be kept.'))return;
      await setHabitState(id,'archived');
    }

    // ─── APP INIT (already called above) ───────────────────────

    console.log('Wong’s Nest app loaded.');
