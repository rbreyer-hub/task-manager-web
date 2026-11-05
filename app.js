/* ── Task Board — projects, tasks, due dates, reminders (Firestore-backed) ── */
(function () {
  'use strict';

  const auth = firebase.auth();
  const db   = firebase.firestore();
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

  /* ── Constants ── */
  const STATUSES = [
    { id: 'todo',    label: 'Not started',   color: '#797e93' },
    { id: 'working', label: 'Working on it', color: '#fdab3d' },
    { id: 'stuck',   label: 'Stuck',         color: '#e2445c' },
    { id: 'done',    label: 'Done',          color: '#00c875' }
  ];
  const PRIORITIES = [
    { id: '',       label: 'None',   color: '' },
    { id: 'low',    label: 'Low',    color: '#579bfc' },
    { id: 'medium', label: 'Medium', color: '#5559df' },
    { id: 'high',     label: 'High',     color: '#401694' },
    { id: 'critical', label: 'Critical', color: '#b0122b', alert: true }
  ];
  const PROJECT_COLORS = [
    '#579bfc', '#a25ddc', '#00c875', '#fdab3d', '#e2445c',
    '#ff158a', '#037f4c', '#784bd1', '#ff642e', '#66ccff', '#7f5347', '#9aadbd'
  ];
  const SMART_VIEWS = [
    { id: 'today',     label: 'Today',     icon: '<svg viewBox="0 0 24 24" width="16" height="16"><rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' },
    { id: 'upcoming',  label: 'Upcoming',  icon: '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' },
    { id: 'overdue',   label: 'Overdue',   icon: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 3l10 18H2L12 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4M12 17.5v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' },
    { id: 'all',       label: 'All tasks', icon: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' },
    { id: 'completed', label: 'Completed', icon: '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 12l3 3 5-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' }
  ];
  const NOTES_ICON = '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M4 5h16v11H8l-4 4V5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  const BELL_ICON  = '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CARET_ICON = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const DOTS_ICON  = '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/></svg>';
  const CHECKLIST_ICON = '<svg viewBox="0 0 24 24" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 12l3 3 5-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const X_ICON = '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const GRIP_ICON = '<svg viewBox="0 0 24 24" width="14" height="14"><circle cx="9" cy="6" r="1.6" fill="currentColor"/><circle cx="15" cy="6" r="1.6" fill="currentColor"/><circle cx="9" cy="12" r="1.6" fill="currentColor"/><circle cx="15" cy="12" r="1.6" fill="currentColor"/><circle cx="9" cy="18" r="1.6" fill="currentColor"/><circle cx="15" cy="18" r="1.6" fill="currentColor"/></svg>';
  const PREFS_KEY = 'taskBoard.prefs';
  const NO_PROJECT = { id: null, name: 'No project', color: '#9aadbd' };

  /* ── State ── */
  let user = null;
  let projects = [];
  let tasks = [];
  let unsubs = [];
  let loaded = { projects: false, tasks: false };
  let search = '';
  let editingTaskId = null;
  let editingProjectId = null;
  let draft = null;          // task being edited in the drawer
  let addingSubFor = null;
  let rowDrag = null;        // in-progress table drag (see "Table row reordering")   // task id whose table row shows an "add subtask" input with no subtasks yet
  let prefs = loadPrefs();   // { view, mode, collapsed: {}, subsCollapsed: {} }

  function loadPrefs() {
    const def = { view: { kind: 'smart', id: 'today' }, mode: 'table', collapsed: {}, subsCollapsed: {} };
    try { return Object.assign(def, JSON.parse(localStorage.getItem(PREFS_KEY)) || {}); }
    catch (_) { return def; }
  }
  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (_) {}
  }

  /* ── Helpers ── */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = () => ymd(new Date());
  const addDays = (str, n) => { const d = parseDate(str); d.setDate(d.getDate() + n); return ymd(d); };
  const parseDate = str => { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); };
  const statusOf = id => STATUSES.find(s => s.id === id) || STATUSES[0];
  const priorityOf = id => PRIORITIES.find(p => p.id === (id || '')) || PRIORITIES[0];
  const projectOf = id => projects.find(p => p.id === id) || null;
  const isDone = t => t.status === 'done';
  const ALERT_ICON = '<span class="alert-mark" aria-hidden="true">!</span>';
  const labelHtml = o => (o.alert ? ALERT_ICON : '') + o.label;
  const subsOf = t => Array.isArray(t.subtasks) ? t.subtasks : [];
  const newSubId = () => Math.random().toString(36).slice(2, 10);

  let calSelected = todayStr();            // day whose tasks list beside the grid
  let calMonth = calSelected.slice(0, 7);  // 'YYYY-MM' shown in the calendar

  const userDoc = () => db.collection('users').doc(user.uid);
  const projCol = () => userDoc().collection('projects');
  const taskCol = () => userDoc().collection('tasks');

  function dueMillis(t) {
    if (!t.due) return null;
    const [h, m] = (t.dueTime || '23:59').split(':').map(Number);
    const d = parseDate(t.due); d.setHours(h, m, 0, 0);
    return d.getTime();
  }
  function isOverdue(t) {
    if (isDone(t) || !t.due) return false;
    if (t.due < todayStr()) return true;
    return t.due === todayStr() && !!t.dueTime && dueMillis(t) < Date.now();
  }

  function fmtTime(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    const ap = h >= 12 ? 'pm' : 'am';
    return `${((h + 11) % 12) + 1}${m ? ':' + pad(m) : ''}${ap}`;
  }
  function fmtDue(t) {
    if (!t.due) return '';
    const today = todayStr();
    let label;
    if (t.due === today) label = 'Today';
    else if (t.due === addDays(today, 1)) label = 'Tomorrow';
    else if (t.due === addDays(today, -1)) label = 'Yesterday';
    else {
      const d = parseDate(t.due);
      const sameYear = d.getFullYear() === new Date().getFullYear();
      label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
    }
    return t.dueTime ? `${label}, ${fmtTime(t.dueTime)}` : label;
  }
  function fmtReminder(ms) {
    const d = new Date(ms);
    const ds = ymd(d), today = todayStr();
    const day = ds === today ? 'Today' : ds === addDays(today, 1) ? 'Tomorrow'
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${day}, ${fmtTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`)}`;
  }

  /* Reminder time from mode + due date. Untimed due dates remind at 9am. */
  function computeReminderAt(mode, due, dueTime, customValue) {
    if (mode === 'none') return null;
    if (mode === 'custom') return customValue ? new Date(customValue).getTime() : null;
    if (!due) return null;
    const [h, m] = (dueTime || '09:00').split(':').map(Number);
    const base = parseDate(due); base.setHours(h, m, 0, 0);
    const offset = { atdue: 0, '15m': 15 * 60e3, '1h': 60 * 60e3, '1d': 24 * 60 * 60e3 }[mode] ?? 0;
    return base.getTime() - offset;
  }
  function toLocalInput(ms) {
    const d = new Date(ms);
    return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /* ── Toast ── */
  let toastTimer;
  function toast(msg, opts = {}) {
    const el = $('#toast'), btn = $('#toastAction');
    $('#toastMsg').textContent = msg;
    btn.hidden = !opts.action;
    if (opts.action) {
      btn.textContent = opts.action;
      btn.onclick = () => { el.classList.remove('show'); opts.onAction(); };
    }
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), opts.duration || (opts.action ? 6000 : 2600));
  }

  /* ── Firestore writes ── */
  function fail(e) { console.error(e); toast('Couldn\'t save: ' + (e.code || e.message)); }

  function createTask(data) {
    const now = Date.now();
    return taskCol().add(Object.assign({
      title: '', notes: '', projectId: null, status: 'todo', priority: '',
      due: '', dueTime: '', reminderMode: 'none', reminderAt: null, reminded: false,
      completedAt: null, createdAt: now, updatedAt: now, order: now
    }, data)).catch(fail);
  }
  function updateTask(id, patch) {
    return taskCol().doc(id).update(Object.assign({}, patch, { updatedAt: Date.now() })).catch(fail);
  }
  function deleteTask(id) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const { id: _, ...data } = t;
    taskCol().doc(id).delete().catch(fail);
    toast(`Deleted "${t.title}"`, { action: 'Undo', onAction: () => taskCol().doc(id).set(data).catch(fail) });
  }
  function setStatus(t, status) {
    const patch = { status };
    if (status === 'done' && !isDone(t)) { patch.completedAt = Date.now(); patch.prevStatus = t.status; }
    if (status !== 'done') patch.completedAt = null;
    updateTask(t.id, patch);
  }
  function toggleDone(t) {
    if (isDone(t)) setStatus(t, t.prevStatus && t.prevStatus !== 'done' ? t.prevStatus : 'todo');
    else { setStatus(t, 'done'); toast('Nice work — task completed', { action: 'Undo', onAction: () => setStatus({ ...t, status: 'done' }, t.status) }); }
  }
  /* Subtasks live on the task doc as [{ id, title, done }] */
  function saveSubtasks(t, subs) {
    t.subtasks = subs;   // keep the local copy current until the snapshot lands
    return updateTask(t.id, { subtasks: subs });
  }
  function toggleSubtask(t, subId) {
    const subs = subsOf(t).map(st => st.id === subId ? { ...st, done: !st.done } : st);
    saveSubtasks(t, subs);
    if (!isDone(t) && subs.length > 1 && subs.every(st => st.done) && subs.find(st => st.id === subId).done) {
      toast('All subtasks checked off', { action: 'Complete task', onAction: () => setStatus(t, 'done') });
    }
  }
  function addSubtask(t, title) {
    return saveSubtasks(t, [...subsOf(t), { id: newSubId(), title, done: false }]);
  }
  function renameSubtask(t, subId, title) {
    if (!title) return removeSubtask(t, subId);
    saveSubtasks(t, subsOf(t).map(st => st.id === subId ? { ...st, title } : st));
  }
  function removeSubtask(t, subId) {
    saveSubtasks(t, subsOf(t).filter(st => st.id !== subId));
  }

  /* Keep reminder in sync when the due date changes inline */
  function setDue(t, due) {
    const patch = { due };
    if (t.reminderMode && t.reminderMode !== 'none' && t.reminderMode !== 'custom') {
      patch.reminderAt = computeReminderAt(t.reminderMode, due, t.dueTime);
      patch.reminded = false;
      if (!due) patch.reminderMode = 'none';
    }
    updateTask(t.id, patch);
  }

  /* ── Subscriptions ── */
  function subscribe() {
    unsubscribe();
    unsubs.push(projCol().orderBy('createdAt').onSnapshot(snap => {
      projects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      loaded.projects = true;
      onData();
    }, e => { console.error(e); toast('Sync error: ' + e.code); }));
    unsubs.push(taskCol().onSnapshot(snap => {
      tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Critical briefly shipped as a status; it's a priority now
      tasks.filter(t => t.status === 'critical').forEach(t => {
        const status = t.prevStatus && t.prevStatus !== 'critical' && t.prevStatus !== 'done' ? t.prevStatus : 'todo';
        t.status = status; t.priority = 'critical';
        updateTask(t.id, { status, priority: 'critical' });
      });
      loaded.tasks = true;
      onData();
    }, e => { console.error(e); toast('Sync error: ' + e.code); }));
  }
  function unsubscribe() {
    unsubs.forEach(u => u());
    unsubs = [];
    loaded = { projects: false, tasks: false };
  }
  function onData() {
    if (!loaded.projects || !loaded.tasks) return;
    $('#loading').hidden = true;
    $('#app').hidden = false;
    if (prefs.view.kind === 'project' && !projectOf(prefs.view.id)) prefs.view = { kind: 'smart', id: 'today' };
    render();
    checkReminders();
  }

  /* ── Auth ── */
  auth.onAuthStateChanged(u => {
    user = u;
    const chip = $('#authUserChip');
    if (u) {
      $('#authSignIn').hidden = true;
      $('#landing').hidden = true;
      $('#searchWrap').hidden = false;
      chip.hidden = false;
      $('#authUserName').textContent = u.displayName || u.email.split('@')[0];
      const av = $('#authUserAvatar');
      av.hidden = !u.photoURL;
      if (u.photoURL) av.src = u.photoURL;
      $('#loading').hidden = false;
      updateNotifBtn();
      subscribe();
    } else {
      unsubscribe();
      projects = []; tasks = [];
      closeDrawer();
      chip.hidden = true;
      $('#notifBtn').hidden = true;
      $('#searchWrap').hidden = true;
      $('#app').hidden = true;
      $('#loading').hidden = true;
      $('#landing').hidden = false;
    }
  });
  function signIn() {
    auth.signInWithPopup(new firebase.auth.GoogleAuthProvider())
      .catch(e => { if (e.code !== 'auth/popup-closed-by-user') toast('Sign-in failed: ' + e.message); });
  }

  /* ── View selection ── */
  /* "Hide completed" applies everywhere except the Completed view itself */
  const hidingDone = () => !!prefs.hideDone && !(prefs.view.kind === 'smart' && prefs.view.id === 'completed');
  function viewTasks(opts = {}) {
    const v = prefs.view, today = todayStr();
    let list = tasks;
    if (v.kind === 'project') list = list.filter(t => t.projectId === v.id);
    else if (v.id === 'today')     list = list.filter(t => !isDone(t) && t.due && t.due <= today);
    else if (v.id === 'upcoming')  list = list.filter(t => !isDone(t) && t.due && t.due > today);
    else if (v.id === 'overdue')   list = list.filter(isOverdue);
    else if (v.id === 'completed') list = list.filter(isDone);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q) ||
        subsOf(t).some(st => st.title.toLowerCase().includes(q)));
    }
    if (hidingDone() && !opts.withDone) list = list.filter(t => !isDone(t));
    return list;
  }
  function sortOpen(a, b) {
    const da = dueMillis(a), dbm = dueMillis(b);
    if (da !== dbm) return da === null ? 1 : dbm === null ? -1 : da - dbm;
    return (a.createdAt || 0) - (b.createdAt || 0);
  }
  const sortDone = (a, b) => (b.completedAt || 0) - (a.completedAt || 0);
  /* Manual order: tasks dragged in the table carry `order`; older ones fall back to creation time */
  const orderOf = t => t.order ?? t.createdAt ?? 0;
  const sortManual = (a, b) => orderOf(a) - orderOf(b);

  /* Groups for the table: by project in smart views, open/done inside a project */
  function buildGroups(list) {
    const v = prefs.view;
    if (v.kind === 'project') {
      const p = projectOf(v.id);
      const groups = [
        { key: `p:${p.id}:open`, name: 'To do', color: p.color, projectId: p.id, tasks: list.filter(t => !isDone(t)).sort(sortManual), canAdd: true, reorder: !search },
        { key: `p:${p.id}:done`, name: 'Completed', color: '#00c875', projectId: p.id, tasks: list.filter(isDone).sort(sortDone), canAdd: false, defaultCollapsed: true }
      ];
      return hidingDone() ? groups.slice(0, 1) : groups;
    }
    const showEmpty = v.id === 'all' && !search;
    const groups = [...projects, NO_PROJECT].map(p => ({
      key: `${v.id}:${p.id}`, name: p.name, color: p.color, projectId: p.id, link: !!p.id,
      tasks: list.filter(t => (t.projectId || null) === p.id && projectOf(t.projectId) === (p.id ? p : null))
        .sort(v.id === 'completed' ? sortDone : v.id === 'all' ? (a, b) => (isDone(a) - isDone(b)) || sortManual(a, b) : (a, b) => (isDone(a) - isDone(b)) || sortOpen(a, b)),
      canAdd: v.id !== 'completed',
      reorder: v.id === 'all' && !search
    }));
    // Orphans (project deleted on another device) fall into "No project"
    const orphans = list.filter(t => t.projectId && !projectOf(t.projectId));
    const loose = groups[groups.length - 1];
    if (orphans.length) { loose.tasks.push(...orphans); loose.reorder = false; }
    return groups.filter(g => g.tasks.length || (showEmpty && g.projectId));
  }

  /* Each project keeps its own layout (saved on the project doc, so it follows you across devices);
     the My Work views share one layout kept in local prefs. */
  function currentMode() {
    const v = prefs.view;
    return v.kind === 'project' ? (projectOf(v.id)?.layout || 'table') : prefs.mode;
  }

  /* ── Render ── */
  function render() {
    if (prefs.view.kind === 'project' && !projectOf(prefs.view.id)) prefs.view = { kind: 'smart', id: 'today' };
    renderSidebar();
    renderHeader();
    renderBody();
  }

  function renderSidebar() {
    const today = todayStr();
    const open = tasks.filter(t => !isDone(t));
    const counts = {
      today: open.filter(t => t.due && t.due <= today).length,
      upcoming: open.filter(t => t.due && t.due > today).length,
      overdue: open.filter(isOverdue).length,
      all: open.length,
      completed: tasks.length - open.length
    };
    const v = prefs.view;
    $('#smartNav').innerHTML = SMART_VIEWS.map(s => `
      <button class="nav-item ${v.kind === 'smart' && v.id === s.id ? 'active' : ''}" data-smart="${s.id}">
        <span class="nav-icon">${s.icon}</span>
        <span class="nav-name">${s.label}</span>
        <span class="nav-count ${s.id === 'overdue' && counts.overdue ? 'alert' : ''}">${counts[s.id] || ''}</span>
      </button>`).join('');
    $('#projectNav').innerHTML = projects.length ? projects.map(p => `
      <button class="nav-item ${v.kind === 'project' && v.id === p.id ? 'active' : ''}" data-project="${p.id}">
        <span class="proj-dot" style="background:${esc(p.color)}"></span>
        <span class="nav-name">${esc(p.name)}</span>
        <span class="nav-count">${open.filter(t => t.projectId === p.id).length || ''}</span>
      </button>`).join('')
      : `<div class="side-empty">No projects yet</div>`;
  }

  function renderHeader() {
    const v = prefs.view;
    const p = v.kind === 'project' ? projectOf(v.id) : null;
    const smart = SMART_VIEWS.find(s => s.id === v.id);
    $('#mainTitle').textContent = p ? p.name : smart.label;
    $('#titleDot').style.background = p ? p.color : 'transparent';
    $('#titleDot').hidden = !p;
    $('#editProjectBtn').hidden = !p;
    const list = viewTasks({ withDone: true });
    const open = list.filter(t => !isDone(t)).length;
    const scope = currentMode() === 'calendar' ? calendarTasks({ withDone: true }) : list;
    const doneCount = scope.filter(isDone).length;
    const tgl = $('#hideDoneBtn');
    tgl.hidden = v.kind === 'smart' && v.id === 'completed';
    tgl.setAttribute('aria-checked', String(!!prefs.hideDone));
    $('#hideDoneCount').textContent = prefs.hideDone && doneCount ? doneCount : '';
    tgl.title = prefs.hideDone ? `${doneCount} completed task${doneCount === 1 ? '' : 's'} hidden` : 'Hide completed tasks';
    const subs = {
      today: 'Tasks due today, plus anything overdue',
      upcoming: 'Everything scheduled after today',
      overdue: 'Past their due date and not done yet',
      all: 'Every task across all projects',
      completed: 'Finished tasks, most recent first'
    };
    $('#mainSub').textContent = p
      ? `${open} open · ${list.length - open} completed`
      : currentMode() === 'calendar' ? 'Every task with a due date. Click a day to see what\'s due.' : subs[v.id];
    $$('.tab').forEach(tb => tb.classList.toggle('active', tb.dataset.mode === currentMode()));
  }

  /* Snapshots re-render the body while someone may be typing in an add box;
     put the caret back where it was so rapid entry keeps working. */
  const ADD_ATTRS = ['data-add-sub', 'data-add-project', 'data-add-status', 'data-add-date'];
  function renderBody() {
    if (rowDrag) { rowDrag.pendingRender = true; return; }
    const body = $('#mainBody');
    const a = document.activeElement;
    const attr = a && body.contains(a) && ADD_ATTRS.find(n => a.hasAttribute(n));
    const keep = attr && { sel: `[${attr}="${CSS.escape(a.getAttribute(attr))}"]`, value: a.value, pos: a.selectionStart };
    const handleOf = a && body.contains(a) && a.matches('[data-drag]') && a.closest('.trow.task')?.dataset.id;
    renderBodyInner(body);
    if (handleOf) $(`.trow.task[data-id="${handleOf}"] [data-drag]`, body)?.focus();
    if (keep) {
      const el = $(keep.sel, body);
      if (el) { el.value = keep.value; el.focus(); el.setSelectionRange(keep.pos, keep.pos); }
    }
  }
  function renderBodyInner(body) {
    const list = viewTasks();
    if (currentMode() === 'board') { body.innerHTML = renderBoard(list); return; }
    if (currentMode() === 'calendar') { body.innerHTML = renderCalendar(); return; }

    const groups = buildGroups(list);
    if (!groups.length) { body.innerHTML = renderEmpty(); return; }
    body.innerHTML = groups.map(renderGroup).join('');
  }

  function renderEmpty() {
    const v = prefs.view;
    if (search) return `<div class="empty-state"><h3>No matches</h3><p>No tasks match “${esc(search)}”.</p></div>`;
    if (!projects.length && !tasks.length) return `
      <div class="empty-state">
        <h3>Welcome to your Task Board</h3>
        <p>Start by creating a project, then add tasks with due dates and reminders.</p>
        <button class="btn btn-primary" data-action="new-project">Create your first project</button>
      </div>`;
    const hiddenDone = hidingDone() ? viewTasks({ withDone: true }).filter(isDone).length : 0;
    if (hiddenDone) return `<div class="empty-state"><h3>All done here</h3>
      <p>${hiddenDone} completed task${hiddenDone === 1 ? ' is' : 's are'} hidden.</p>
      <button class="btn btn-ghost" data-action="show-done">Show completed</button></div>`;
    const msg = {
      today: ['You\'re all caught up', 'Nothing due today. Enjoy it.'],
      upcoming: ['Nothing scheduled', 'Tasks with future due dates show up here.'],
      overdue: ['No overdue tasks', 'Everything is on track.'],
      all: ['No tasks yet', 'Add a task to get started.'],
      completed: ['Nothing completed yet', 'Check off a task and it lands here.']
    }[v.id] || ['No tasks', ''];
    return `<div class="empty-state"><h3>${msg[0]}</h3><p>${msg[1]}</p>
      <button class="btn btn-primary" data-action="new-task">New task</button></div>`;
  }

  function renderGroup(g) {
    const collapsed = prefs.collapsed[g.key] ?? !!g.defaultCollapsed;
    const total = g.tasks.length;
    const statusBar = total ? STATUSES.map(s => {
      const n = g.tasks.filter(t => (t.status || 'todo') === s.id).length;
      return n ? `<span style="width:${(n / total) * 100}%;background:${s.color}" title="${s.label}: ${n}"></span>` : '';
    }).join('') : '';
    return `
    <section class="group ${collapsed ? 'collapsed' : ''} ${g.reorder ? 'reorderable' : ''}" data-group="${esc(g.key)}" data-group-project="${g.projectId ?? ''}" style="--gc:${esc(g.color)}">
      <div class="group-head">
        <button class="group-toggle" data-action="toggle-group" style="color:${esc(g.color)}" aria-label="Collapse group">${CARET_ICON}</button>
        <button class="group-name ${g.link ? 'link' : ''}" ${g.link ? `data-project="${g.projectId}"` : ''} style="color:${esc(g.color)}">${esc(g.name)}</button>
        <span class="group-count">${total} ${total === 1 ? 'task' : 'tasks'}</span>
      </div>
      <div class="table-scroll"><div class="table">
        <div class="trow thead">
          <div class="bar" style="background:${esc(g.color)}"></div>
          <div class="c-check"></div>
          <div class="c-title">Task</div>
          <div>Status</div><div>Priority</div><div>Due date</div><div>Reminder</div><div></div>
        </div>
        ${g.tasks.map(t => renderRow(t, g)).join('')}
        ${g.canAdd ? `
        <div class="trow add-row">
          <div class="bar" style="background:${esc(g.color)};opacity:.5"></div>
          <div class="c-check"></div>
          <div class="c-title"><input data-add-project="${g.projectId ?? ''}" placeholder="+ Add task" maxlength="200"></div>
          <div></div><div></div><div></div><div></div><div></div>
        </div>` : ''}
        ${total ? `
        <div class="trow summary-row">
          <div></div><div></div><div></div>
          <div><div class="status-bar">${statusBar}</div></div>
          <div></div><div></div><div></div><div></div>
        </div>` : ''}
      </div></div>
    </section>`;
  }

  function renderRow(t, g) {
    const st = statusOf(t.status), pr = priorityOf(t.priority);
    const proj = projectOf(t.projectId);
    const showProj = prefs.view.kind === 'project' ? false : g.projectId !== (t.projectId || null) && proj;
    const dueCls = isOverdue(t) ? 'overdue' : t.due === todayStr() && !isDone(t) ? 'today' : '';
    const hasRem = t.reminderAt && t.reminderMode !== 'none';
    const subs = subsOf(t);
    const subsOpen = subs.length ? !prefs.subsCollapsed[t.id] : addingSubFor === t.id;
    const subsDone = subs.filter(st => st.done).length;
    return `
    <div class="trow task ${isDone(t) ? 'done' : ''} ${subsOpen ? 'subs-open' : ''}" data-id="${t.id}">
      <div class="bar" style="background:${esc(g.color)}"></div>
      <div class="c-check">
        ${g.reorder && !isDone(t) ? `<button class="drag-handle" data-drag aria-label="Drag to reorder (or focus and use arrow keys)" title="Drag to reorder">${GRIP_ICON}</button>` : '<span class="drag-spacer"></span>'}
        <input type="checkbox" data-action="toggle-done" ${isDone(t) ? 'checked' : ''} aria-label="Mark complete">
      </div>
      <div class="c-title" data-action="open">
        ${subs.length
          ? `<button class="sub-caret" data-action="toggle-subs" aria-label="${subsOpen ? 'Hide' : 'Show'} subtasks" aria-expanded="${subsOpen}">${CARET_ICON}</button>`
          : '<span class="sub-caret-spacer"></span>'}
        <span class="t-text">${esc(t.title)}</span>
        ${subs.length ? `<button class="t-subs ${subsDone === subs.length ? 'all' : ''}" data-action="toggle-subs" title="Subtasks">${CHECKLIST_ICON}${subsDone}/${subs.length}</button>` : ''}
        ${t.notes ? `<span class="t-notes" title="Has notes">${NOTES_ICON}</span>` : ''}
        ${showProj ? `<span class="t-proj">${esc(proj.name)}</span>` : ''}
        <span class="t-open">Open</span>
      </div>
      <div><button class="pill" data-action="status" style="background:${st.color}">${labelHtml(st)}</button></div>
      <div><button class="pill ${pr.id ? '' : 'empty'}" data-action="priority" style="${pr.id ? `background:${pr.color}` : ''}">${pr.id ? labelHtml(pr) : ''}</button></div>
      <div class="c-due" data-action="due">
        <span class="due-label ${t.due ? dueCls : 'empty'}">${t.due ? esc(fmtDue(t)) : '—'}</span>
        <input type="date" class="due-input" value="${esc(t.due || '')}" tabindex="-1" aria-label="Due date">
      </div>
      <div class="c-remind ${hasRem ? (t.reminded ? 'fired' : 'on') : ''}" data-action="open" title="${hasRem ? (t.reminded ? 'Reminder sent' : 'Reminder set') : 'Add reminder'}">
        ${hasRem ? `${BELL_ICON}<span>${esc(fmtReminder(t.reminderAt))}</span>` : '<span>—</span>'}
      </div>
      <div class="c-more"><button class="icon-btn sm" data-action="more" aria-label="More">${DOTS_ICON}</button></div>
    </div>
    ${subsOpen ? subs.map(st => `
    <div class="trow sub ${st.done ? 'done' : ''}" data-id="${t.id}" data-sub="${esc(st.id)}">
      <div class="bar" style="background:${esc(g.color)}"></div>
      <div class="c-check"></div>
      <div class="c-sub">
        <input type="checkbox" data-action="sub-toggle" ${st.done ? 'checked' : ''} aria-label="Mark subtask complete">
        <span class="s-text" data-action="sub-edit" title="Click to rename">${esc(st.title)}</span>
        <button class="icon-btn sm s-del" data-action="sub-delete" aria-label="Delete subtask">${X_ICON}</button>
      </div>
    </div>`).join('') + `
    <div class="trow sub add-sub" data-id="${t.id}">
      <div class="bar" style="background:${esc(g.color)};opacity:.5"></div>
      <div class="c-check"></div>
      <div class="c-sub"><input data-add-sub="${t.id}" placeholder="+ Add subtask" maxlength="200"></div>
    </div>` : ''}`;
  }

  function renderBoard(list) {
    if (!list.length && !projects.length) return renderEmpty();
    const v = prefs.view;
    return `<div class="board">${STATUSES.map(s => {
      const col = list.filter(t => (t.status || 'todo') === s.id).sort(s.id === 'done' ? sortDone : sortOpen);
      return `
      <div class="column" data-status="${s.id}">
        <div class="column-head" style="background:${s.color}"><span>${labelHtml(s)}</span><span>${col.length}</span></div>
        <div class="column-body">${col.map(renderCard).join('')}${s.id === 'done' && hidingDone() ? `<div class="col-hidden">Completed tasks hidden<br><button class="link-btn" data-action="show-done">Show them</button></div>` : ''}</div>
        ${v.id !== 'completed' || v.kind === 'project' ? `<div class="column-add"><input data-add-status="${s.id}" placeholder="+ Add task" maxlength="200"></div>` : ''}
      </div>`;
    }).join('')}</div>`;
  }

  /* ── Calendar ──
     Ignores the Today/Upcoming/Overdue filters so every dated task shows up;
     a project view still narrows it to that project. */
  function calendarTasks(opts = {}) {
    const v = prefs.view;
    let list = tasks.filter(t => t.due && !(hidingDone() && !opts.withDone && isDone(t)));
    if (v.kind === 'project') list = list.filter(t => t.projectId === v.id);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q));
    }
    return list;
  }
  function renderCalendar() {
    const byDay = {};
    calendarTasks().forEach(t => (byDay[t.due] ||= []).push(t));
    Object.values(byDay).forEach(l => l.sort((a, b) => (isDone(a) - isDone(b)) || sortOpen(a, b)));

    const [y, m] = calMonth.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const start = new Date(y, m - 1, 1 - first.getDay());   // weeks start Sunday
    const weeks = Math.ceil((first.getDay() + new Date(y, m, 0).getDate()) / 7);
    const today = todayStr();
    const dows = [...Array(7)].map((_, i) => new Date(2026, 0, 4 + i).toLocaleDateString(undefined, { weekday: 'short' }));

    let cells = '';
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const ds = ymd(d), list = byDay[ds] || [];
      const open = list.filter(t => !isDone(t));
      const late = ds < today && open.length;
      cells += `
      <button class="cal-day ${d.getMonth() !== m - 1 ? 'other' : ''} ${ds === today ? 'today' : ''} ${ds === calSelected ? 'sel' : ''}"
        data-action="cal-day" data-date="${ds}" aria-label="${d.toDateString()}, ${list.length} due">
        <span class="cal-num">${d.getDate()}</span>
        ${list.length ? `<span class="cal-badge ${late ? 'late' : ''}">${open.length || '✓'}</span>` : ''}
        <span class="cal-chips">
          ${list.slice(0, 3).map(t => {
            const p = projectOf(t.projectId);
            return `<span class="cal-chip ${isDone(t) ? 'done' : ''} ${isOverdue(t) ? 'late' : ''}" style="--cc:${p ? esc(p.color) : '#9aadbd'}">${esc(t.title)}</span>`;
          }).join('')}
          ${list.length > 3 ? `<span class="cal-more">+${list.length - 3} more</span>` : ''}
        </span>
      </button>`;
    }
    return `
    <div class="calendar">
      <div class="cal-main">
        <div class="cal-head">
          <button class="icon-btn" data-action="cal-prev" aria-label="Previous month"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <h3>${first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
          <button class="icon-btn" data-action="cal-next" aria-label="Next month"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <button class="btn btn-ghost" data-action="cal-today">Today</button>
        </div>
        <div class="cal-grid">
          ${dows.map(w => `<div class="cal-dow">${w}</div>`).join('')}
          ${cells}
        </div>
      </div>
      ${renderDayPanel(byDay[calSelected] || [])}
    </div>`;
  }
  function renderDayPanel(list) {
    const d = parseDate(calSelected), today = todayStr();
    const rel = calSelected === today ? 'Today' : calSelected === addDays(today, 1) ? 'Tomorrow' : calSelected === addDays(today, -1) ? 'Yesterday' : '';
    return `
    <aside class="day-panel">
      <div class="day-head">
        <div class="day-rel">${rel}</div>
        <h3>${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
        <div class="day-count">${list.length ? `${list.filter(t => !isDone(t)).length} open · ${list.filter(isDone).length} done` : 'Nothing due'}</div>
      </div>
      <ul class="day-list">
        ${list.map(t => {
          const st = statusOf(t.status), p = projectOf(t.projectId), subs = subsOf(t);
          return `
          <li class="day-item ${isDone(t) ? 'done' : ''}" data-id="${t.id}" style="--cc:${p ? esc(p.color) : '#9aadbd'}">
            <input type="checkbox" data-action="toggle-done" ${isDone(t) ? 'checked' : ''} aria-label="Mark complete">
            <div class="day-body" data-action="open">
              <div class="day-title">${esc(t.title)}</div>
              <div class="day-meta">
                ${p ? `<span><i class="proj-dot" style="background:${esc(p.color)}"></i>${esc(p.name)}</span>` : ''}
                ${t.dueTime ? `<span>${fmtTime(t.dueTime)}</span>` : ''}
                ${subs.length ? `<span>${CHECKLIST_ICON}${subs.filter(x => x.done).length}/${subs.length}</span>` : ''}
                ${t.reminderAt && !t.reminded ? `<span>${BELL_ICON}</span>` : ''}
              </div>
            </div>
            <button class="mini-pill status-chip" data-action="status" style="background:${st.color}">${labelHtml(st)}</button>
          </li>`;
        }).join('')}
      </ul>
      <input class="day-add" data-add-date="${calSelected}" placeholder="+ Add task on this day" maxlength="200">
    </aside>`;
  }
  function shiftMonth(n) {
    const [y, m] = calMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    calMonth = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    renderBody();
  }

  function renderCard(t) {
    const proj = projectOf(t.projectId), pr = priorityOf(t.priority);
    const dueCls = isOverdue(t) ? 'overdue' : t.due === todayStr() && !isDone(t) ? 'today' : '';
    return `
    <div class="card ${isDone(t) ? 'done' : ''}" draggable="true" data-id="${t.id}" data-action="open" style="--card-color:${proj ? esc(proj.color) : 'transparent'}">
      <div class="card-title">${esc(t.title)}</div>
      <div class="card-meta">
        ${proj && prefs.view.kind !== 'project' ? `<span>${esc(proj.name)}</span>` : ''}
        ${t.due ? `<span class="due-label ${dueCls}">${esc(fmtDue(t))}</span>` : ''}
        ${pr.id ? `<span class="mini-pill" style="background:${pr.color}">${labelHtml(pr)}</span>` : ''}
        ${t.reminderAt && !t.reminded ? `<span title="Reminder ${esc(fmtReminder(t.reminderAt))}">${BELL_ICON}</span>` : ''}
        ${t.notes ? `<span>${NOTES_ICON}</span>` : ''}
        ${subsOf(t).length ? `<span class="card-subs" title="Subtasks">${CHECKLIST_ICON}${subsOf(t).filter(st => st.done).length}/${subsOf(t).length}</span>` : ''}
      </div>
      ${subsOf(t).length ? `<div class="card-progress"><span style="width:${subsOf(t).filter(st => st.done).length / subsOf(t).length * 100}%"></span></div>` : ''}
    </div>`;
  }

  /* ── Pop menu (status / priority / row actions) ── */
  function openMenu(anchor, html, onPick) {
    const menu = $('#popMenu');
    menu.innerHTML = html;
    menu.hidden = false;
    const r = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let left = r.left + r.width / 2 - mw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
    let top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8) top = r.top - mh - 6;
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.onclick = e => {
      const b = e.target.closest('[data-val]');
      if (!b) return;
      closeMenu();
      onPick(b.dataset.val);
    };
  }
  function closeMenu() { $('#popMenu').hidden = true; }
  const optList = (opts, cur) => opts.map(o =>
    `<button class="pop-opt ${o.color ? '' : 'none'}" data-val="${o.id}" style="${o.color ? `background:${o.color}` : ''}">${o.id === cur ? '✓ ' : ''}${labelHtml(o)}</button>`).join('');

  /* ── Event wiring ── */
  document.addEventListener('click', e => {
    if (!$('#popMenu').hidden && !e.target.closest('#popMenu') && !e.target.closest('[data-action="status"],[data-action="priority"],[data-action="more"]')) closeMenu();
  });

  $('#authSignIn').addEventListener('click', signIn);
  $('#landingSignIn').addEventListener('click', signIn);
  $('#authSignOut').addEventListener('click', () => {
    if (confirm('Sign out of Task Board?')) auth.signOut().then(() => toast('Signed out'));
  });
  $('#menuBtn').addEventListener('click', () => document.body.classList.toggle('side-open'));
  $('#scrim').addEventListener('click', () => document.body.classList.remove('side-open'));

  let searchTimer;
  $('#search').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { search = e.target.value.trim(); renderHeader(); renderBody(); }, 120);
  });

  $('#sidebar').addEventListener('click', e => {
    const s = e.target.closest('[data-smart]'), p = e.target.closest('[data-project]');
    if (s) setView({ kind: 'smart', id: s.dataset.smart });
    else if (p) setView({ kind: 'project', id: p.dataset.project });
  });
  function setView(v) {
    prefs.view = v; savePrefs();
    document.body.classList.remove('side-open');
    render();
    window.scrollTo(0, 0);
  }

  $$('.tab').forEach(tb => tb.addEventListener('click', () => {
    const mode = tb.dataset.mode, v = prefs.view;
    if (v.kind === 'project') {
      const p = projectOf(v.id);
      if (p && (p.layout || 'table') !== mode) {
        p.layout = mode;   // local copy, so the switch is instant
        projCol().doc(p.id).update({ layout: mode }).catch(fail);
      }
    } else { prefs.mode = mode; savePrefs(); }
    renderHeader(); renderBody();
  }));
  $('#newTaskBtn').addEventListener('click', () => openDrawer(null));
  function setHideDone(on) {
    prefs.hideDone = on; savePrefs();
    renderHeader(); renderBody();
  }
  $('#hideDoneBtn').addEventListener('click', () => setHideDone(!prefs.hideDone));
  $('#addProjectBtn').addEventListener('click', () => openProjectModal(null));
  $('#editProjectBtn').addEventListener('click', () => openProjectModal(prefs.view.id));

  const body = $('#mainBody');
  body.addEventListener('click', e => {
    const actEl = e.target.closest('[data-action]');
    const projLink = e.target.closest('.group-name[data-project]');
    if (projLink) { setView({ kind: 'project', id: projLink.dataset.project }); return; }
    if (!actEl) return;
    const action = actEl.dataset.action;
    if (action === 'new-project') return openProjectModal(null);
    if (action === 'new-task') return openDrawer(null);
    if (action === 'show-done') return setHideDone(false);
    if (action === 'cal-prev') return shiftMonth(-1);
    if (action === 'cal-next') return shiftMonth(1);
    if (action === 'cal-today') { calSelected = todayStr(); calMonth = calSelected.slice(0, 7); return renderBody(); }
    if (action === 'cal-day') {
      calSelected = actEl.dataset.date;
      if (calSelected.slice(0, 7) !== calMonth) calMonth = calSelected.slice(0, 7);
      renderBody();
      if (window.innerWidth <= 860) $('.day-panel', body)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (action === 'toggle-group') {
      const g = actEl.closest('.group'), key = g.dataset.group;
      const now = !g.classList.contains('collapsed');
      g.classList.toggle('collapsed', now);
      prefs.collapsed[key] = now; savePrefs();
      return;
    }
    const row = actEl.closest('[data-id]');
    const t = row && tasks.find(x => x.id === row.dataset.id);
    if (!t) return;
    const subId = actEl.closest('[data-sub]')?.dataset.sub;
    switch (action) {
      case 'toggle-subs':
        e.stopPropagation();
        prefs.subsCollapsed[t.id] = !prefs.subsCollapsed[t.id];
        if (!prefs.subsCollapsed[t.id]) delete prefs.subsCollapsed[t.id];
        savePrefs(); renderBody(); return;
      case 'sub-toggle': toggleSubtask(t, subId); return;
      case 'sub-delete': removeSubtask(t, subId); return;
      case 'sub-edit': startSubRename(actEl, t, subId); return;
      case 'toggle-done': toggleDone(t); break;
      case 'open': openDrawer(t.id); break;
      case 'status':
        openMenu(actEl, optList(STATUSES, t.status), val => setStatus(t, val)); break;
      case 'priority':
        openMenu(actEl, optList(PRIORITIES, t.priority || ''), val => updateTask(t.id, { priority: val })); break;
      case 'due': {
        const inp = $('.due-input', actEl);
        try { inp.showPicker(); } catch (_) { inp.focus(); inp.click(); }
        break;
      }
      case 'more':
        openMenu(actEl, `
          <button class="pop-item" data-val="edit">Edit task</button>
          <button class="pop-item" data-val="add-sub">Add subtask</button>
          <button class="pop-item" data-val="dup">Duplicate</button>
          ${t.due ? '<button class="pop-item" data-val="clear-due">Clear due date</button>' : ''}
          <button class="pop-item danger" data-val="delete">Delete</button>`, val => {
          if (val === 'edit') openDrawer(t.id);
          if (val === 'add-sub') {
            if (subsOf(t).length) delete prefs.subsCollapsed[t.id], savePrefs();
            else addingSubFor = t.id;
            renderBody();
            $(`[data-add-sub="${t.id}"]`, body)?.focus();
          }
          if (val === 'dup') { const { id, ...d } = t; createTask({ ...d, title: d.title + ' (copy)', status: 'todo', completedAt: null, reminded: false, createdAt: Date.now(), subtasks: subsOf(t).map(st => ({ ...st, id: newSubId(), done: false })) }); }
          if (val === 'clear-due') setDue(t, '');
          if (val === 'delete') deleteTask(t.id);
        });
        break;
    }
  });
  function startSubRename(span, t, subId) {
    const inp = document.createElement('input');
    inp.className = 's-edit'; inp.value = span.textContent; inp.maxLength = 200;
    span.replaceWith(inp);
    inp.focus(); inp.select();
    let done = false;
    const finish = save => {
      if (done) return; done = true;
      const v = inp.value.trim();
      if (save && v !== span.textContent) renameSubtask(t, subId, v);
      else inp.replaceWith(span);
    };
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
    });
    inp.addEventListener('blur', () => finish(true));
  }
  body.addEventListener('focusout', e => {
    if (e.target.matches('[data-add-sub]') && !e.target.value.trim() && addingSubFor === e.target.dataset.addSub) {
      addingSubFor = null;
      setTimeout(renderBody, 0);
    }
  });

  body.addEventListener('change', e => {
    if (!e.target.classList.contains('due-input')) return;
    const t = tasks.find(x => x.id === e.target.closest('[data-id]').dataset.id);
    if (t) setDue(t, e.target.value);
  });
  body.addEventListener('keydown', e => {
    const inp = e.target;
    if (e.key === 'Enter' && inp.matches('[data-add-date]')) {
      const title = inp.value.trim(); if (!title) return;
      const v = prefs.view;
      createTask({ title, due: inp.dataset.addDate, projectId: v.kind === 'project' ? v.id : null });
      inp.value = '';
      return;
    }
    if (e.key === 'Enter' && inp.matches('[data-add-sub]')) {
      const t = tasks.find(x => x.id === inp.dataset.addSub), title = inp.value.trim();
      if (!t || !title) return;
      addingSubFor = null;
      delete prefs.subsCollapsed[t.id];
      inp.value = '';
      addSubtask(t, title);
      renderBody();
      return;
    }
    if (e.key !== 'Enter' || !(inp.matches('[data-add-project]') || inp.matches('[data-add-status]'))) return;
    const title = inp.value.trim();
    if (!title) return;
    const v = prefs.view;
    const data = { title };
    if (inp.matches('[data-add-project]')) data.projectId = inp.dataset.addProject || null;
    else {
      data.status = inp.dataset.addStatus;
      if (data.status === 'done') data.completedAt = Date.now();
      if (v.kind === 'project') data.projectId = v.id;
    }
    if (v.kind === 'smart' && (v.id === 'today' || v.id === 'overdue')) data.due = todayStr();
    if (v.kind === 'smart' && v.id === 'upcoming') data.due = addDays(todayStr(), 1);
    createTask(data);
    inp.value = '';
  });

  /* ── Table row reordering ──
     Pointer events (not HTML5 drag) so it also works on touch screens.
     Order values are spaced numbers; a drop takes the midpoint of its new neighbours,
     and a group is renumbered only when two neighbours get too close. */
  function groupTaskIds(groupEl, exceptId) {
    return $$('.trow.task', groupEl).map(r => r.dataset.id).filter(id => id !== exceptId);
  }
  function moveTask(t, groupEl, index) {
    const ids = groupTaskIds(groupEl, t.id);
    const list = ids.map(id => tasks.find(x => x.id === id)).filter(x => x && !isDone(x));
    index = Math.max(0, Math.min(index, list.length));
    const before = list[index - 1], after = list[index];
    let order;
    if (before && after) order = (orderOf(before) + orderOf(after)) / 2;
    else if (before) order = orderOf(before) + 1024;
    else if (after) order = orderOf(after) - 1024;
    else order = Date.now();
    const patch = { order };
    const target = groupEl.dataset.groupProject || null;
    if (prefs.view.kind !== 'project' && (t.projectId || null) !== target) patch.projectId = target;

    const tooClose = before && after && Math.abs(orderOf(after) - orderOf(before)) < 1e-6;
    if (tooClose) {
      const seq = [...list]; seq.splice(index, 0, t);
      const batch = db.batch();
      seq.forEach((x, i) => {
        x.order = (i + 1) * 1024;
        batch.update(taskCol().doc(x.id), x === t ? { ...patch, order: x.order, updatedAt: Date.now() } : { order: x.order });
      });
      if (patch.projectId !== undefined) t.projectId = patch.projectId;
      batch.commit().catch(fail);
    } else {
      Object.assign(t, patch);   // optimistic, so the row lands without waiting for the snapshot
      updateTask(t.id, patch);
    }
    if (patch.projectId !== undefined) {
      const p = projectOf(patch.projectId);
      toast(`Moved to ${p ? p.name : 'No project'}`);
    }
  }

  function clearDropMarks() { $$('.drop-before, .drop-after, .drop-into', body).forEach(el => el.classList.remove('drop-before', 'drop-after', 'drop-into')); }

  function findDrop(x, y) {
    const el = document.elementFromPoint(x, y);
    const groupEl = el?.closest('.group.reorderable');
    if (!groupEl || groupEl.classList.contains('collapsed')) return null;
    let row = el.closest('.trow.task, .trow.sub, .trow.add-row');
    if (!row) {
      // Over the group header or the summary row: top or end of the group
      const head = el.closest('.group-head, .thead');
      return { groupEl, index: head ? 0 : groupTaskIds(groupEl, rowDrag.id).length, mark: head ? $('.trow.task:not(.dragging)', groupEl) : $('.add-row', groupEl), side: head ? 'before' : 'into' };
    }
    if (row.classList.contains('add-row')) return { groupEl, index: groupTaskIds(groupEl, rowDrag.id).length, mark: row, side: 'into' };
    // A subtask row counts as the bottom half of its parent task
    let after = true;
    if (row.classList.contains('task')) {
      const r = row.getBoundingClientRect();
      after = y > r.top + r.height / 2;
    } else {
      const id = row.dataset.id;
      const subs = $$(`.trow.sub[data-id="${id}"]`, groupEl);
      row = subs[subs.length - 1];
    }
    const taskId = row.dataset.id;
    if (taskId === rowDrag.id) return null;
    const ids = groupTaskIds(groupEl, rowDrag.id);
    const i = ids.indexOf(taskId);
    if (i < 0) return null;
    const task = tasks.find(x => x.id === taskId);
    if (task && isDone(task)) return { groupEl, index: ids.filter(id => !isDone(tasks.find(x => x.id === id))).length, mark: $('.add-row', groupEl), side: 'into' };
    return { groupEl, index: after ? i + 1 : i, mark: row, side: after ? 'after' : 'before' };
  }

  body.addEventListener('pointerdown', e => {
    const handle = e.target.closest('[data-drag]');
    if (!handle || e.button !== 0) return;
    e.preventDefault();
    const row = handle.closest('.trow.task');
    const t = tasks.find(x => x.id === row.dataset.id);
    if (!t) return;
    const rect = row.getBoundingClientRect();
    const ghost = row.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.width = rect.width + 'px';
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    document.body.appendChild(ghost);
    rowDrag = { id: t.id, t, row, ghost, offsetY: e.clientY - rect.top, startY: e.clientY, drop: null, lastY: e.clientY, pendingRender: false };
    row.classList.add('dragging');
    $$(`.trow.sub[data-id="${t.id}"]`, body).forEach(r => r.classList.add('dragging'));
    document.body.classList.add('row-dragging');
    handle.setPointerCapture(e.pointerId);
    rowDrag.scroller = setInterval(() => {
      if (!rowDrag) return;
      const y = rowDrag.lastY, edge = 70;
      if (y < edge + 56) window.scrollBy(0, -12);
      else if (y > innerHeight - edge) window.scrollBy(0, 12);
    }, 16);
  });
  body.addEventListener('pointermove', e => {
    if (!rowDrag) return;
    rowDrag.lastY = e.clientY;
    rowDrag.ghost.style.top = (e.clientY - rowDrag.offsetY) + 'px';
    clearDropMarks();
    rowDrag.drop = findDrop(e.clientX, e.clientY);
    const d = rowDrag.drop;
    if (d?.mark) d.mark.classList.add('drop-' + d.side);
  });
  function endRowDrag(commit) {
    if (!rowDrag) return;
    const { t, ghost, drop, scroller, pendingRender, startY, lastY } = rowDrag;
    clearInterval(scroller);
    ghost.remove();
    clearDropMarks();
    document.body.classList.remove('row-dragging');
    rowDrag = null;
    if (commit && drop && Math.abs(lastY - startY) > 3) moveTask(t, drop.groupEl, drop.index);
    renderBody();
    if (!commit && pendingRender) renderBody();
  }
  body.addEventListener('pointerup', () => endRowDrag(true));
  body.addEventListener('pointercancel', () => endRowDrag(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && rowDrag) endRowDrag(false); });

  // Keyboard: focus the handle, then ArrowUp / ArrowDown
  body.addEventListener('keydown', e => {
    const handle = e.target.closest?.('[data-drag]');
    if (!handle || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const row = handle.closest('.trow.task'), groupEl = row.closest('.group');
    const t = tasks.find(x => x.id === row.dataset.id);
    const ids = groupTaskIds(groupEl, null).filter(id => !isDone(tasks.find(x => x.id === id)));
    const i = ids.indexOf(t.id) + (e.key === 'ArrowUp' ? -1 : 1);
    if (i < 0 || i >= ids.length) return;
    moveTask(t, groupEl, i);
    renderBody();
    $(`.trow.task[data-id="${t.id}"] [data-drag]`, body)?.focus();
  });

  /* Kanban drag & drop */
  let dragId = null;
  body.addEventListener('dragstart', e => {
    const card = e.target.closest('.card');
    if (!card) return;
    dragId = card.dataset.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
  });
  body.addEventListener('dragend', e => { e.target.closest('.card')?.classList.remove('dragging'); $$('.column.drag-over').forEach(c => c.classList.remove('drag-over')); });
  body.addEventListener('dragover', e => {
    const col = e.target.closest('.column');
    if (!col || !dragId) return;
    e.preventDefault();
    $$('.column.drag-over').forEach(c => c !== col && c.classList.remove('drag-over'));
    col.classList.add('drag-over');
  });
  body.addEventListener('drop', e => {
    const col = e.target.closest('.column');
    if (!col || !dragId) return;
    e.preventDefault();
    const t = tasks.find(x => x.id === dragId);
    dragId = null;
    col.classList.remove('drag-over');
    if (t && t.status !== col.dataset.status) setStatus(t, col.dataset.status);
  });

  /* ── Task drawer ── */
  function openDrawer(id) {
    const t = id ? tasks.find(x => x.id === id) : null;
    editingTaskId = id;
    const v = prefs.view;
    draft = t ? { ...t } : {
      title: '', notes: '', status: 'todo', priority: '',
      projectId: v.kind === 'project' ? v.id : null,
      due: currentMode() === 'calendar' ? calSelected : v.kind === 'smart' && v.id === 'today' ? todayStr() : '', dueTime: '',
      reminderMode: 'none', reminderAt: null, subtasks: []
    };
    draft.subtasks = subsOf(draft).map(st => ({ ...st }));
    $('#fTitle').value = draft.title;
    $('#fNotes').value = draft.notes || '';
    $('#fProject').innerHTML = `<option value="">No project</option>` +
      projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    $('#fProject').value = draft.projectId || '';
    $('#fDue').value = draft.due || '';
    $('#fDueTime').value = draft.dueTime || '';
    $('#fReminder').value = draft.reminderMode || 'none';
    $('#fReminderAt').value = draft.reminderAt ? toLocalInput(draft.reminderAt) : '';
    renderPickers();
    renderDrawerSubs();
    syncReminderUI();
    $('#deleteTaskBtn').hidden = !t;
    $('#taskMeta').textContent = t
      ? `Created ${new Date(t.createdAt).toLocaleString()}${t.completedAt ? ' · Completed ' + new Date(t.completedAt).toLocaleString() : ''}`
      : '';
    $('#drawer').classList.add('open');
    $('#drawer').setAttribute('aria-hidden', 'false');
    $('#drawerScrim').classList.add('open');
    setTimeout(() => { if (!t) $('#fTitle').focus(); }, 50);
  }
  function closeDrawer() {
    $('#drawer').classList.remove('open');
    $('#drawer').setAttribute('aria-hidden', 'true');
    $('#drawerScrim').classList.remove('open');
    editingTaskId = null; draft = null;
  }
  function renderPickers() {
    $('#fStatus').innerHTML = STATUSES.map(s =>
      `<button type="button" class="pick ${draft.status === s.id ? 'sel' : ''}" data-status="${s.id}" style="background:${s.color}">${labelHtml(s)}</button>`).join('');
    $('#fPriority').innerHTML = PRIORITIES.map(p =>
      `<button type="button" class="pick ${p.color ? '' : 'none'} ${(draft.priority || '') === p.id ? 'sel' : ''}" data-priority="${p.id}" style="${p.color ? `background:${p.color}` : ''}">${labelHtml(p)}</button>`).join('');
  }
  /* Drawer checklist. Changes to an existing task save immediately, like checking a box should;
     a new task keeps them in the draft until Save. */
  function renderDrawerSubs() {
    const subs = draft.subtasks, done = subs.filter(st => st.done).length;
    $('#subProgress').hidden = !subs.length;
    $('#subCount').textContent = subs.length ? `${done}/${subs.length}` : '';
    $('#subProgress span').style.width = subs.length ? `${done / subs.length * 100}%` : '0';
    $('#subList').innerHTML = subs.map(st => `
      <li class="sub-item ${st.done ? 'done' : ''}" data-sub="${esc(st.id)}">
        <input type="checkbox" ${st.done ? 'checked' : ''} aria-label="Mark subtask complete">
        <input class="sub-title" value="${esc(st.title)}" maxlength="200" aria-label="Subtask">
        <button type="button" class="icon-btn sm" data-sub-del aria-label="Delete subtask">${X_ICON}</button>
      </li>`).join('');
  }
  function commitDrawerSubs() {
    renderDrawerSubs();
    const t = editingTaskId && tasks.find(x => x.id === editingTaskId);
    if (t) saveSubtasks(t, draft.subtasks.map(st => ({ ...st })));
  }
  $('#subList').addEventListener('change', e => {
    const li = e.target.closest('[data-sub]'); if (!li) return;
    const st = draft.subtasks.find(x => x.id === li.dataset.sub);
    if (e.target.type === 'checkbox') st.done = e.target.checked;
    else {
      const v = e.target.value.trim();
      if (!v) draft.subtasks = draft.subtasks.filter(x => x !== st);
      else st.title = v;
    }
    commitDrawerSubs();
  });
  $('#subList').addEventListener('click', e => {
    const del = e.target.closest('[data-sub-del]'); if (!del) return;
    const id = del.closest('[data-sub]').dataset.sub;
    draft.subtasks = draft.subtasks.filter(x => x.id !== id);
    commitDrawerSubs();
  });
  $('#subList').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.classList.contains('sub-title')) { e.preventDefault(); e.target.blur(); }
  });
  $('#subAdd').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const title = e.target.value.trim(); if (!title) return;
    draft.subtasks.push({ id: newSubId(), title, done: false });
    e.target.value = '';
    commitDrawerSubs();
  });

  function syncReminderUI() {
    const mode = $('#fReminder').value;
    const due = $('#fDue').value, time = $('#fDueTime').value;
    const custom = $('#fReminderAt');
    custom.hidden = mode !== 'custom';
    if (mode === 'custom' && !custom.value) {
      const guess = computeReminderAt('atdue', due, time) || Date.now() + 60 * 60e3;
      custom.value = toLocalInput(guess);
    }
    $$('#fReminder option').forEach(o => {
      if (!['none', 'custom'].includes(o.value)) o.disabled = !due;
    });
    const at = computeReminderAt(mode, due, time, custom.value);
    const hint = $('#reminderHint');
    if (mode === 'none') hint.textContent = due ? '' : 'Set a due date to use relative reminders.';
    else if (!at) hint.textContent = 'Set a due date first.';
    else {
      const perm = 'Notification' in window ? Notification.permission : 'unsupported';
      hint.textContent = `Reminds you ${fmtReminder(at)}${at < Date.now() ? ' (in the past)' : ''}` +
        (perm === 'granted' ? '' : ' · Enable notifications with the bell in the top bar.') +
        (!time && mode !== 'custom' ? ' · Untimed due dates use 9am.' : '');
    }
  }

  $('#fStatus').addEventListener('click', e => {
    const b = e.target.closest('[data-status]'); if (!b) return;
    draft.status = b.dataset.status; renderPickers();
  });
  $('#fPriority').addEventListener('click', e => {
    const b = e.target.closest('[data-priority]'); if (!b) return;
    draft.priority = b.dataset.priority; renderPickers();
  });
  ['#fReminder', '#fDue', '#fDueTime', '#fReminderAt'].forEach(s => $(s).addEventListener('input', () => {
    if (s === '#fDue' && !$('#fDue').value && !['none', 'custom'].includes($('#fReminder').value)) $('#fReminder').value = 'none';
    syncReminderUI();
  }));
  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#cancelTaskBtn').addEventListener('click', closeDrawer);
  $('#drawerScrim').addEventListener('click', closeDrawer);
  $('#deleteTaskBtn').addEventListener('click', () => {
    if (!editingTaskId) return;
    const id = editingTaskId;
    closeDrawer();
    deleteTask(id);
  });
  $('#taskForm').addEventListener('submit', e => {
    e.preventDefault();
    const title = $('#fTitle').value.trim();
    if (!title) { $('#fTitle').focus(); return; }
    const mode = $('#fReminder').value;
    const due = $('#fDue').value, dueTime = due ? $('#fDueTime').value : '';
    const reminderAt = computeReminderAt(mode, due, dueTime, $('#fReminderAt').value);
    const data = {
      title,
      notes: $('#fNotes').value.trim(),
      projectId: $('#fProject').value || null,
      status: draft.status,
      priority: draft.priority || '',
      due, dueTime,
      reminderMode: reminderAt ? mode : 'none',
      reminderAt,
      subtasks: draft.subtasks
    };
    const prev = editingTaskId ? tasks.find(x => x.id === editingTaskId) : null;
    if (!prev || prev.reminderAt !== reminderAt) data.reminded = false;
    if (data.status === 'done' && (!prev || !isDone(prev))) { data.completedAt = Date.now(); if (prev) data.prevStatus = prev.status; }
    if (data.status !== 'done') data.completedAt = null;
    if (prev) updateTask(prev.id, data);
    else createTask(data).then(() => toast('Task created'));
    if (reminderAt && 'Notification' in window && Notification.permission === 'default') requestNotif();
    closeDrawer();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!$('#popMenu').hidden) closeMenu();
      else if ($('#drawer').classList.contains('open')) closeDrawer();
    }
    if (e.key === 'n' && !e.metaKey && !e.ctrlKey && user && !$('#app').hidden &&
        !e.target.closest('input,textarea,select,[contenteditable]') && !$('#drawer').classList.contains('open') && !$('#projectModal').open) {
      e.preventDefault(); openDrawer(null);
    }
  });

  /* ── Project modal ── */
  let pickedColor = PROJECT_COLORS[0];
  function openProjectModal(id) {
    const p = id ? projectOf(id) : null;
    editingProjectId = id;
    $('#projectModalTitle').textContent = p ? 'Edit project' : 'New project';
    $('#pName').value = p ? p.name : '';
    pickedColor = p ? p.color : PROJECT_COLORS[projects.length % PROJECT_COLORS.length];
    renderSwatches();
    $('#deleteProjectBtn').hidden = !p;
    $('#projectModal').showModal();
    $('#pName').focus();
  }
  function renderSwatches() {
    $('#pColors').innerHTML = PROJECT_COLORS.map(c =>
      `<button type="button" class="swatch ${c === pickedColor ? 'sel' : ''}" data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join('');
  }
  $('#pColors').addEventListener('click', e => {
    const b = e.target.closest('[data-color]'); if (!b) return;
    pickedColor = b.dataset.color; renderSwatches();
  });
  $('#cancelProjectBtn').addEventListener('click', () => $('#projectModal').close());
  $('#projectForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#pName').value.trim();
    if (!name) return;
    if (editingProjectId) {
      projCol().doc(editingProjectId).update({ name, color: pickedColor, updatedAt: Date.now() }).catch(fail);
    } else {
      const ref = projCol().doc();
      const data = { name, color: pickedColor, createdAt: Date.now(), updatedAt: Date.now() };
      ref.set(data).catch(fail);
      // Show it right away; the snapshot listener replaces this with the stored copy
      if (!projectOf(ref.id)) projects.push({ id: ref.id, ...data });
      $('#projectModal').close();
      setView({ kind: 'project', id: ref.id });
      return;
    }
    $('#projectModal').close();
  });
  $('#deleteProjectBtn').addEventListener('click', async () => {
    const p = projectOf(editingProjectId);
    if (!p) return;
    const owned = tasks.filter(t => t.projectId === p.id);
    const ok = confirm(`Delete "${p.name}"${owned.length ? ` and its ${owned.length} task${owned.length === 1 ? '' : 's'}` : ''}?\n\nThis can't be undone.`);
    if (!ok) return;
    $('#projectModal').close();
    setView({ kind: 'smart', id: 'today' });
    // Firestore batches cap at 500 writes
    const refs = [projCol().doc(p.id), ...owned.map(t => taskCol().doc(t.id))];
    try {
      for (let i = 0; i < refs.length; i += 450) {
        const batch = db.batch();
        refs.slice(i, i + 450).forEach(r => batch.delete(r));
        await batch.commit();
      }
      toast(`Deleted project "${p.name}"`);
    } catch (err) { fail(err); }
  });

  /* ── Reminders ──
     Fire while any tab is open; offline tabs catch up on next load.
     The notification tag is the task id, so several open tabs collapse into one. */
  function updateNotifBtn() {
    const btn = $('#notifBtn');
    btn.hidden = !('Notification' in window) || Notification.permission !== 'default';
  }
  function requestNotif() {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(p => {
      updateNotifBtn();
      toast(p === 'granted' ? 'Reminders will pop up as notifications' : 'Reminders will show in the app only');
    });
  }
  $('#notifBtn').addEventListener('click', requestNotif);

  /* ── Theme: system → light → dark ── */
  const THEME_KEY = 'taskBoard.theme';
  const THEME_TITLES = { system: 'Theme: match system', light: 'Theme: light', dark: 'Theme: dark' };
  function applyTheme(mode) {
    if (mode === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = mode;
    const btn = $('#themeBtn');
    btn.dataset.mode = mode;
    btn.title = THEME_TITLES[mode];
  }
  let theme = 'system';
  try { theme = localStorage.getItem(THEME_KEY) || 'system'; } catch (_) {}
  applyTheme(theme);
  $('#themeBtn').addEventListener('click', () => {
    theme = { system: 'light', light: 'dark', dark: 'system' }[theme] || 'system';
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
    applyTheme(theme);
    toast(THEME_TITLES[theme]);
  });

  function checkReminders() {
    if (!user) return;
    const now = Date.now();
    tasks.filter(t => !isDone(t) && t.reminderAt && !t.reminded && t.reminderAt <= now).forEach(t => {
      updateTask(t.id, { reminded: true });
      const proj = projectOf(t.projectId);
      const body = [t.due ? 'Due ' + fmtDue(t) : '', proj ? proj.name : ''].filter(Boolean).join(' · ');
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          const n = new Notification('⏰ ' + t.title, { body, tag: t.id, icon: 'icon.svg' });
          n.onclick = () => { window.focus(); openDrawer(t.id); n.close(); };
        } catch (_) {}
      }
      toast(`⏰ Reminder: ${t.title}`, { action: 'Open', onAction: () => openDrawer(t.id), duration: 10000 });
    });
  }
  setInterval(checkReminders, 15000);

  /* Re-render when the day rolls over so Today/Overdue stay accurate */
  let lastDay = todayStr();
  setInterval(() => {
    if (todayStr() !== lastDay) { lastDay = todayStr(); if (user && !$('#app').hidden) render(); }
  }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && user && !$('#app').hidden) { render(); checkReminders(); }
  });
})();
