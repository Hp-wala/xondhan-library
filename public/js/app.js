(() => {
  'use strict';

  // ---------- Setup ----------
  const cfg = window.APP_CONFIG || {};
  const DEV = window.__DEV_MODE__ === true; // set only by public/dev-mode.js on localhost
  if (!DEV && (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('YOUR-PROJECT') || !cfg.SUPABASE_ANON_KEY)) {
    document.body.textContent = 'App is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in public/config.js';
    return;
  }
  const sb = DEV ? window.__DEV_SB__ : window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });

  const LOW_STOCK = 3;
  const DAILY_FINE = 5;
  const PAGE_SIZE = 10;
  const IDLE_LIMIT_MS = 30 * 60 * 1000;
  const state = { books: [], tx: [], history: [], view: 'dashboard', stockTab: 'out', booksQuery: '', booksFilter: 'all', booksPage: 1, historyQuery: '', historyStatus: 'all', historyPage: 1, mobileNavOpen: false };

  // ---------- Helpers ----------
  const $ = (s, r = document) => r.querySelector(s);

  // Safe DOM builder: text is always inserted as text nodes (no innerHTML => no XSS).
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      e.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return e;
  }

  const isoToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const addDays = (date, days) => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  const fmtDate = (s) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
  const fmtTs = (s) => new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  let toastTimer;
  function toast(msg, type = 'info') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast t-' + type;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
  }

  function friendlyError(err) {
    const m = (err && err.message) || '';
    // Only show messages we raise ourselves in SQL; hide internals otherwise.
    const known = ['Book is out of stock', 'Book already returned', 'Student name is required', 'Invalid quantity',
      'Invalid loan period', 'Book not found', 'Transaction not found', 'Not authorized'];
    const hit = known.find((k) => m.includes(k));
    if (hit) return hit;
    if (err && err.code === '23503') return 'This book has borrowing records and cannot be deleted.';
    if (err && err.code === '23514') return 'Invalid values (check copies and numbers).';
    console.error(err);
    return 'Something went wrong. Please try again.';
  }

  function openDialog(title, body, actions) {
    const d = $('#dialog');
    d.replaceChildren(h('h2', null, title), body, h('div', { class: 'dialog-actions' }, actions));
    if (!d.open) d.showModal();
    return d;
  }
  const closeDialog = () => { const d = $('#dialog'); if (d.open) d.close(); };

  function confirmDialog(title, message, okLabel = 'Confirm', danger = false) {
    return new Promise((resolve) => {
      const d = openDialog(title, h('p', null, message), [
        h('button', { class: 'btn', onclick: () => { closeDialog(); resolve(false); } }, 'Cancel'),
        h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), onclick: () => { closeDialog(); resolve(true); } }, okLabel)
      ]);
      d.addEventListener('close', () => resolve(false), { once: true });
    });
  }

  function typedConfirmDialog(title, message, requiredText, okLabel) {
    return new Promise((resolve) => {
      const input = h('input', { type: 'text', autocomplete: 'off', maxlength: 100, placeholder: requiredText, 'aria-label': `Type ${requiredText} to confirm` });
      const submit = h('button', { class: 'btn btn-danger', disabled: true }, okLabel);
      const cancel = h('button', { class: 'btn' }, 'Cancel');
      const body = h('div', null,
        h('p', null, message),
        h('label', { class: 'field' }, h('span', null, `Type ${requiredText} to enable this action.`), input));
      const d = openDialog(title, body, [cancel, submit]);
      d.classList.add('clear-confirm-dialog');
      const finish = (confirmed) => {
        d.classList.remove('clear-confirm-dialog');
        if (d.open) d.close();
        resolve(confirmed);
      };
      input.addEventListener('input', () => {
        submit.disabled = input.value.trim().toLowerCase() !== requiredText.toLowerCase();
      });
      cancel.addEventListener('click', () => finish(false));
      submit.addEventListener('click', () => {
        if (!submit.disabled) finish(true);
      });
      d.addEventListener('close', () => resolve(false), { once: true });
      input.focus();
    });
  }

  // Prevent spreadsheet formula injection in exported files
  const safeCell = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : v);

  const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 200;
  const isValidPhone = (s) => /^[0-9+\-\s()]{7,20}$/.test(s);

  // ---------- Auth ----------
  let idleTimer;
  function resetIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(async () => { await signOut(); toast('Signed out due to inactivity', 'info'); }, IDLE_LIMIT_MS);
  }
  ['click', 'keydown', 'mousemove', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => { if (!$('#appView').hidden) resetIdle(); }, { passive: true }));

  async function isAdmin() {
    const { data, error } = await sb.rpc('is_admin');
    return !error && data === true;
  }

  async function signOut() {
    clearTimeout(idleTimer);
    await sb.auth.signOut();
    state.books = []; state.tx = []; state.history = [];
    $('#appView').hidden = true;
    $('#loginView').hidden = false;
    $('#loginPassword').value = '';
  }

  let failCount = 0, lockUntil = 0;
  async function onLogin(e) {
    e.preventDefault();
    const err = $('#loginError');
    err.hidden = true;
    if (Date.now() < lockUntil) {
      err.textContent = `Too many attempts. Wait ${Math.ceil((lockUntil - Date.now()) / 1000)}s.`;
      err.hidden = false;
      return;
    }
    const email = $('#loginEmail').value.trim();
    const password = $('#loginPassword').value;
    if (!isValidEmail(email) || !password) {
      err.textContent = 'Enter a valid email and password.';
      err.hidden = false;
      return;
    }
    const btn = $('#loginBtn');
    btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !(await isAdmin())) {
      if (!error) await sb.auth.signOut();
      failCount++;
      if (failCount >= 5) { lockUntil = Date.now() + 30000; failCount = 0; }
      err.textContent = 'Invalid credentials.';
      err.hidden = false;
      btn.disabled = false;
      return;
    }
    failCount = 0;
    btn.disabled = false;
    await enterApp();
  }

  async function enterApp() {
    $('#loginView').hidden = true;
    $('#appView').hidden = false;
    resetIdle();
    await loadAll();
    go('dashboard');
  }

  // ---------- Data ----------
  async function loadAll() {
    const [b, t, s] = await Promise.all([
      sb.from('books').select('*').order('title', { ascending: true }).limit(5000),
      sb.from('transactions').select('*, books(title)').order('id', { ascending: false }).limit(5000),
      sb.from('stock_history').select('*').order('created_at', { ascending: false }).limit(500)
    ]);
    if (b.error || t.error || s.error) { toast(friendlyError(b.error || t.error || s.error), 'error'); return; }
    state.books = b.data;
    state.tx = t.data.map((x) => ({ ...x, book_title: x.books ? x.books.title : '(deleted)' }));
    state.history = s.data;
  }

  async function refresh() { await loadAll(); render(); }

  const stockOf = (b) => (b.available_copies <= 0 ? 'out' : b.available_copies <= LOW_STOCK ? 'low' : 'ok');
  const stockBadge = (b) => {
    const s = stockOf(b);
    return h('span', { class: 'badge ' + { out: 'b-out', low: 'b-low', ok: 'b-ok' }[s] }, { out: 'Out of stock', low: 'Low: ' + b.available_copies, ok: b.available_copies + ' available' }[s]);
  };

  // ---------- Router ----------
  function go(view) {
    state.view = view;
    setMobileNav(false);
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    render();
    $('#content').focus();
  }

  function render() {
    const c = $('#content');
    const views = { dashboard: vDashboard, books: vBooks, issue: vIssue, borrowers: vBorrowers, stock: vStock, history: vHistory, settings: vSettings };
    c.classList.toggle('account-view', state.view === 'settings');
    c.replaceChildren(topbar(), (views[state.view] || vDashboard)());
  }

  function topbar() {
    const search = h('input', { type: 'search', placeholder: 'Search books by title, author or ISBN', value: state.booksQuery, maxlength: 100, 'aria-label': 'Search books' });
    const form = h('form', { class: 'global-search', onsubmit: (e) => { e.preventDefault(); state.booksQuery = search.value.trim(); state.booksPage = 1; go('books'); } },
      h('span', { class: 'search-icon', 'aria-hidden': 'true' }, '⌕'), search,
      h('button', { class: 'btn btn-primary btn-sm', type: 'submit' }, 'Search'));
    const active = state.tx.filter((t) => t.status === 'issued');
    return h('div', { class: 'topbar' }, form,
      h('div', { class: 'toolbar quick-actions' },
        h('button', { class: 'btn', onclick: () => go('issue') }, '+ Issue'),
        h('button', { class: 'btn', onclick: () => returnPicker(active) }, '+ Return'),
        h('button', { class: 'btn btn-primary', onclick: () => bookDialog() }, '+ Add Book')));
  }

  function setMobileNav(open) {
    state.mobileNavOpen = open;
    const sidebar = $('.sidebar');
    const backdrop = $('#sidebarBackdrop');
    const menu = $('#mobileMenuToggle');
    sidebar.classList.toggle('is-open', open);
    backdrop.hidden = !open;
    if (menu) {
      menu.classList.toggle('is-open', open);
      menu.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    }
  }

  function returnPicker(active) {
    if (!active.length) return toast('There are no active books to return.', 'info');
    const rows = active.map((t) => h('button', { class: 'return-pick', onclick: () => { closeDialog(); returnBook(t); } },
      h('span', null, h('b', null, t.student_name), h('small', null, `${t.book_title} · due ${fmtDate(t.due_date)}`)),
      h('span', { class: 'return-arrow', 'aria-hidden': 'true' }, 'Return →')));
    openDialog('Choose a book to return', h('div', { class: 'return-picker' }, rows), [h('button', { class: 'btn', onclick: closeDialog }, 'Cancel')]);
  }

  const pageHead = (title, sub, ...actions) =>
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, title), sub ? h('p', { class: 'muted' }, sub) : null), h('div', { class: 'toolbar' }, actions));

  function table(headers, rows, emptyText) {
    return h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, headers.map((x) => h('th', null, x)))),
      h('tbody', null, rows.length ? rows : h('tr', null, h('td', { class: 'empty', colspan: headers.length }, emptyText)))
    ));
  }

  // ---------- Dashboard ----------
  function vDashboard() {
    const active = state.tx.filter((t) => t.status === 'issued');
    const today = isoToday();
    const overdue = active.filter((t) => t.due_date < today);
    const out = state.books.filter((b) => stockOf(b) === 'out').length;
    const low = state.books.filter((b) => stockOf(b) === 'low').length;
    const totalCopies = state.books.reduce((sum, b) => sum + b.total_copies, 0);
    const lateTransactions = overdue.slice(0, 10);
    const overdueRows = lateTransactions.map((t) => {
      const late = daysBetween(t.due_date, today);
      return h('tr', null, h('td', null, t.student_name), h('td', { class: 'wrap' }, t.book_title), h('td', null, fmtDate(t.due_date)), h('td', null, `${late} days`), h('td', { class: 'fine' }, `₹${late * DAILY_FINE}`), h('td', null, h('button', { class: 'btn btn-sm btn-success', onclick: () => returnBook(t) }, 'Return')));
    });
    const overdueCards = lateTransactions.map((t) => {
      const late = daysBetween(t.due_date, today);
      return h('article', { class: 'overdue-mobile-card' },
        h('div', { class: 'overdue-mobile-heading' }, h('div', null, h('b', null, t.student_name), h('span', null, t.book_title)),
          h('span', { class: 'badge b-over' }, `${late}d late`)),
        h('div', { class: 'overdue-mobile-facts' },
          h('div', null, h('small', null, 'Due date'), h('b', null, fmtDate(t.due_date))),
          h('div', null, h('small', null, 'Fine'), h('b', { class: 'fine' }, `₹${late * DAILY_FINE}`))),
        h('button', { class: 'btn btn-sm btn-success overdue-mobile-return', onclick: () => returnBook(t) }, 'Return'));
    });
    return h('div', null,
      pageHead('Dashboard', 'A clear view of what is on the shelves and out in the community.'),
      h('div', { class: 'stats stats-compact' },
        stat(totalCopies, 'Kul books', 'stat-books'),
        stat(active.length, 'Abhi issued', 'stat-issued'),
        stat(low, 'Low stock', low ? 'warn' : 'stat-low'),
        stat(out, 'Out of stock', out ? 'bad' : 'stat-out')
      ),
      h('section', { class: 'card overdue-panel' },
        h('div', { class: 'section-heading' }, h('div', null, h('h2', null, 'Late returns'), h('p', { class: 'muted' }, `Fine estimate · ₹${DAILY_FINE} per day`)), h('span', { class: 'badge ' + (overdue.length ? 'b-over' : 'b-ok') }, `${overdue.length} overdue`)),
        h('div', { class: 'overdue-table' }, table(['Student', 'Book', 'Due date', 'Late', 'Fine', ''], overdueRows, 'No late books right now.'),
          overdue.length > 10 ? h('p', { class: 'muted overdue-more' }, 'Showing the 10 most recent late returns.') : null),
        h('div', { class: 'overdue-list' }, overdueCards.length ? overdueCards : h('p', { class: 'muted overdue-empty' }, 'No late books right now.'),
          overdue.length > 10 ? h('p', { class: 'muted overdue-more' }, 'Showing the 10 most recent late returns.') : null))
    );
  }
  const stat = (n, label, cls = '') => h('div', { class: 'stat ' + cls }, h('b', null, n), h('span', null, label));

  // ---------- Books ----------
  function vBooks() {
    const q = state.booksQuery.toLowerCase();
    const filtered = state.books.filter((b) => (!q || [b.title, b.author, b.isbn, b.category, b.publisher].some((x) => (x || '').toLowerCase().includes(q))) && (state.booksFilter === 'all' || stockOf(b) === state.booksFilter));
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    state.booksPage = Math.min(state.booksPage, pages);
    const list = filtered.slice((state.booksPage - 1) * PAGE_SIZE, state.booksPage * PAGE_SIZE);
    const search = h('input', { type: 'search', placeholder: 'Search title, author, ISBN…', value: state.booksQuery, maxlength: 100, 'aria-label': 'Search books' });
    search.addEventListener('input', () => {
      state.booksQuery = search.value.trim();
      state.booksPage = 1;
      const pos = search.selectionStart;
      render();
      const again = $('.books-search');
      again.focus(); again.setSelectionRange(pos, pos);
    });
    search.className = 'books-search';
    const filter = h('select', { 'aria-label': 'Filter books by stock', onchange: () => { state.booksFilter = filter.value; state.booksPage = 1; render(); } },
      [['all', 'All stock'], ['ok', 'Available'], ['low', 'Low stock'], ['out', 'Out of stock']].map(([value, label]) => h('option', { value, selected: state.booksFilter === value }, label)));
    const fileInput = h('input', { type: 'file', accept: '.xlsx,.xls,.csv', hidden: true, onchange: (e) => importBooks(e.target.files[0]) });
    return h('div', null,
      pageHead('Books', `${state.books.length} titles`,
        h('button', { class: 'btn btn-primary', onclick: () => bookDialog() }, '+ Add book'),
        h('button', { class: 'btn', onclick: () => fileInput.click() }, 'Import Excel'),
        h('button', { class: 'btn', onclick: exportBooks }, 'Export Excel'),
        fileInput),
      h('div', { class: 'card' }, h('div', { class: 'list-controls' }, search, filter),
        table(['#', 'Title', 'Author', 'Publisher', 'Price', 'Stock', 'Total', ''],
          list.map((b, i) => h('tr', null,
            h('td', null, b.s_no || i + 1),
            h('td', { class: 'wrap' }, b.title),
            h('td', { class: 'wrap' }, b.author),
            h('td', { class: 'wrap' }, b.publisher || '-'),
            h('td', null, b.price ? '₹' + b.price : '-'),
            h('td', null, stockBadge(b)),
            h('td', null, b.total_copies),
            h('td', { class: 'actions' },
              h('button', { class: 'btn btn-sm', onclick: () => bookDialog(b) }, 'Edit'),
              h('button', { class: 'btn btn-sm btn-danger', onclick: () => deleteBook(b) }, 'Delete')))),
          'No books found.'), pager(state.booksPage, pages, filtered.length, (page) => { state.booksPage = page; render(); })));
  }

  function pager(page, pages, total, onChange) {
    return h('div', { class: 'pagination' }, h('span', { class: 'muted' }, `${total} results · Page ${page} of ${pages}`),
      h('div', { class: 'toolbar' },
        h('button', { class: 'btn btn-sm', disabled: page <= 1, onclick: () => onChange(page - 1), 'aria-label': 'Previous page' }, '←'),
        h('button', { class: 'btn btn-sm', disabled: page >= pages, onclick: () => onChange(page + 1), 'aria-label': 'Next page' }, '→')));
  }

  function bookDialog(book) {
    const f = {
      title: h('input', { type: 'text', maxlength: 300, required: true, value: book ? book.title : '' }),
      author: h('input', { type: 'text', maxlength: 200, required: true, value: book ? book.author : '' }),
      isbn: h('input', { type: 'text', maxlength: 20, value: book ? book.isbn || '' : '' }),
      category: h('input', { type: 'text', maxlength: 100, value: book ? book.category || '' : '' }),
      publisher: h('input', { type: 'text', maxlength: 200, value: book ? book.publisher || '' : '' }),
      price: h('input', { type: 'number', min: 0, step: '0.01', value: book ? book.price : 0 }),
      pages: h('input', { type: 'number', min: 0, step: 1, value: book ? book.page_count : 0 }),
      copies: h('input', { type: 'number', min: 1, max: 100000, step: 1, value: book ? book.total_copies : 1 })
    };
    const lbl = (t, el, note) => h('label', { class: 'field' }, h('span', null, t, note ? h('small', null, ' ' + note) : null), el);
    const err = h('p', { class: 'error', hidden: true, role: 'alert' });
    const save = h('button', { class: 'btn btn-primary' }, 'Save');
    save.addEventListener('click', async () => {
      err.hidden = true;
      const row = {
        title: f.title.value.trim(), author: f.author.value.trim(), isbn: f.isbn.value.trim() || null,
        category: f.category.value.trim() || null, publisher: f.publisher.value.trim() || null,
        price: Number(f.price.value) || 0, page_count: parseInt(f.pages.value, 10) || 0
      };
      const total = parseInt(f.copies.value, 10);
      let msg = '';
      if (!row.title || !row.author) msg = 'Title and author are required.';
      else if (row.isbn && !/^[0-9Xx\-\s]{6,20}$/.test(row.isbn)) msg = 'ISBN looks invalid.';
      else if (!Number.isInteger(total) || total < 1) msg = 'Copies must be at least 1.';
      else if (row.price < 0 || row.page_count < 0) msg = 'Price and pages cannot be negative.';
      if (book) {
        const issued = book.total_copies - book.available_copies;
        if (!msg && total < issued) msg = `${issued} copies are currently issued; total cannot be lower.`;
      }
      if (msg) { err.textContent = msg; err.hidden = false; return; }
      save.disabled = true;
      let res;
      if (book) {
        row.total_copies = total;
        row.available_copies = total - (book.total_copies - book.available_copies);
        res = await sb.from('books').update(row).eq('id', book.id);
      } else {
        row.total_copies = total; row.available_copies = total;
        res = await sb.from('books').insert(row);
      }
      save.disabled = false;
      if (res.error) { err.textContent = friendlyError(res.error); err.hidden = false; return; }
      closeDialog(); toast(book ? 'Book updated' : 'Book added', 'success'); refresh();
    });
    openDialog(book ? 'Edit book' : 'Add book', h('div', null,
      lbl('Title', f.title), lbl('Author', f.author),
      h('div', { class: 'grid-2' }, lbl('ISBN', f.isbn, '(optional)'), lbl('Category', f.category, '(optional)')),
      lbl('Publisher', f.publisher, '(optional)'),
      h('div', { class: 'grid-2' }, lbl('Price (₹)', f.price), lbl('Pages', f.pages)),
      lbl('Total copies', f.copies), err),
      [h('button', { class: 'btn', onclick: closeDialog }, 'Cancel'), save]);
  }

  async function deleteBook(b) {
    if (!(await confirmDialog('Delete book', `Delete "${b.title}"? This cannot be undone.`, 'Delete', true))) return;
    const { error } = await sb.from('books').delete().eq('id', b.id);
    if (error) return toast(friendlyError(error), 'error');
    toast('Book deleted', 'success'); refresh();
  }

  function exportBooks() {
    const rows = state.books.map((b) => ({
      'S.no': safeCell(b.s_no || ''), 'Book title': safeCell(b.title), Author: safeCell(b.author), ISBN: safeCell(b.isbn || ''),
      Category: safeCell(b.category || ''), Publisher: safeCell(b.publisher || ''), 'Page count': b.page_count, Price: b.price,
      Available: b.available_copies, Total: b.total_copies
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Books');
    XLSX.writeFile(wb, `books_${isoToday()}.xlsx`);
  }

  async function importBooks(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast('File too large (max 2 MB)', 'error');
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      if (!rows.length) return toast('The file is empty', 'error');
      if (rows.length > 2000) return toast('Max 2000 rows per import', 'error');
      const num = (v) => parseInt(String(v).replace(/[^0-9]/g, ''), 10) || 0;
      const trim = (v, n) => String(v ?? '').trim().slice(0, n);
      const existing = new Set(state.books.map((b) => (b.title + '|' + b.author).toLowerCase()));
      const out = []; let skipped = 0;
      for (const r of rows) {
        const title = trim(r['Book title'] || r['Title'], 300), author = trim(r['Author'], 200);
        if (!title || !author) { skipped++; continue; }
        const key = (title + '|' + author).toLowerCase();
        if (existing.has(key)) { skipped++; continue; }
        existing.add(key);
        const copies = Math.min(Math.max(num(r['No'] || r['Copies'] || r['Total'] || 1), 1), 100000);
        out.push({
          s_no: trim(r['S.no'] || r['S.No'], 20) || null, title, author, isbn: trim(r['ISBN'], 20) || null,
          category: trim(r['Category'], 100) || null, publisher: trim(r['Publisher'], 200) || null,
          price: num(r['Price']), page_count: num(r['Page count'] || r['Pages']), total_copies: copies, available_copies: copies
        });
      }
      for (let i = 0; i < out.length; i += 200) {
        const { error } = await sb.from('books').insert(out.slice(i, i + 200));
        if (error) throw error;
      }
      toast(`${out.length} books imported, ${skipped} skipped`, 'success');
      refresh();
    } catch (e) { toast(friendlyError(e), 'error'); }
  }

  // ---------- Issue ----------
  function vIssue() {
    let selected = null;
    const name = h('input', { type: 'text', maxlength: 120, required: true, autocomplete: 'off' });
    const email = h('input', { type: 'email', maxlength: 200, autocomplete: 'off' });
    const phone = h('input', { type: 'tel', maxlength: 20, autocomplete: 'off' });
    const days = h('select', null, [7, 14, 21, 30].map((d) => h('option', { value: d, selected: d === 14 }, d + ' days')));
    const search = h('input', { type: 'search', placeholder: 'Search by title, author or ISBN…', maxlength: 100, 'aria-label': 'Search book' });
    const results = h('div', { class: 'picker-results', hidden: true });
    const chosen = h('div', { class: 'selected-book', hidden: true });
    const duePreview = h('div', { class: 'due-preview', hidden: true });
    const err = h('p', { class: 'error', hidden: true, role: 'alert' });
    const submit = h('button', { class: 'btn btn-primary' }, 'Issue book');

    function choose(b) {
      selected = b;
      results.hidden = true; search.value = '';
      chosen.replaceChildren(h('div', { class: 'selected-book-title' }, h('b', null, b.title), stockBadge(b)), h('small', null, `${b.author} · ${b.available_copies} available${b.isbn ? ` · ISBN ${b.isbn}` : ''}`));
      chosen.hidden = false;
      updateDuePreview();
    }
    function updateDuePreview() {
      if (!selected) return;
      duePreview.replaceChildren(h('span', { class: 'due-label' }, 'Due date'), h('b', null, fmtDate(addDays(isoToday(), parseInt(days.value, 10)))), h('small', null, `Based on ${days.value} loan period`));
      duePreview.hidden = false;
    }
    days.addEventListener('change', updateDuePreview);
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      if (q.length < 2) { results.hidden = true; return; }
      const hits = state.books.filter((b) => [b.title, b.author, b.isbn].some((x) => (x || '').toLowerCase().includes(q))).slice(0, 15);
      results.replaceChildren(...(hits.length
        ? hits.map((b) => h('button', { type: 'button', class: 'picker-item', onclick: () => choose(b) }, b.title, h('small', null, `${b.author} · ${b.available_copies} available`)))
        : [h('div', { class: 'picker-item' }, 'No books found')]));
      results.hidden = false;
    });

    submit.addEventListener('click', async () => {
      err.hidden = true;
      const n = name.value.trim(), em = email.value.trim(), ph = phone.value.trim();
      let msg = '';
      if (!selected) msg = 'Select a book first.';
      else if (selected.available_copies <= 0) msg = 'This book is out of stock.';
      else if (!n) msg = 'Student name is required.';
      else if (em && !isValidEmail(em)) msg = 'Email looks invalid.';
      else if (ph && !isValidPhone(ph)) msg = 'Phone number looks invalid.';
      if (msg) { err.textContent = msg; err.hidden = false; return; }
      submit.disabled = true;
      const { error } = await sb.rpc('issue_book', { p_book_id: selected.id, p_student_name: n, p_student_email: em, p_student_phone: ph, p_days: parseInt(days.value, 10) });
      submit.disabled = false;
      if (error) { err.textContent = friendlyError(error); err.hidden = false; return; }
      toast('Book issued', 'success');
      await loadAll(); go('issue');
    });

    const lbl = (t, el, note) => h('label', { class: 'field' }, h('span', null, t, note ? h('small', null, ' ' + note) : null), el);
    return h('div', null, pageHead('Issue Book', 'Choose a title and confirm the loan period.'),
      h('div', { class: 'card' },
        h('div', { class: 'field' }, h('span', null, 'Book'), search, results, chosen),
        h('div', { class: 'grid-2' }, lbl('Student name', name), h('div', null, lbl('Loan period', days), duePreview)),
        h('div', { class: 'grid-2' }, lbl('Email', email, '(optional)'), lbl('Phone', phone, '(optional)')),
        err, submit));
  }

  // ---------- Borrowers ----------
  function vBorrowers() {
    const today = isoToday();
    const active = state.tx.filter((t) => t.status === 'issued').sort((a, b) => a.due_date.localeCompare(b.due_date));
    return h('div', null, pageHead('Active Borrowers', `${active.length} books currently issued`),
      h('div', { class: 'card' }, table(['Student', 'Contact', 'Book', 'Issued', 'Due', 'Status', ''],
        active.map((t) => {
          const left = daysBetween(today, t.due_date);
          const badge = left < 0 ? h('span', { class: 'badge b-over' }, `${-left}d overdue`) : left <= 3 ? h('span', { class: 'badge b-soon' }, `${left}d left`) : h('span', { class: 'badge b-ok' }, `${left}d left`);
          return h('tr', null, h('td', null, t.student_name), h('td', null, t.student_phone || t.student_email || '-'),
            h('td', { class: 'wrap' }, t.book_title), h('td', null, fmtDate(t.issue_date)), h('td', null, fmtDate(t.due_date)), h('td', null, badge),
            h('td', null, h('button', { class: 'btn btn-sm btn-success', onclick: () => returnBook(t) }, 'Return')));
        }), 'No active borrowers.')));
  }

  async function returnBook(t) {
    if (!(await confirmDialog('Return book', `Mark "${t.book_title}" returned by ${t.student_name}?`, 'Return'))) return;
    const { error } = await sb.rpc('return_book', { p_transaction_id: t.id });
    if (error) return toast(friendlyError(error), 'error');
    toast('Book returned', 'success'); refresh();
  }

  // ---------- Stock ----------
  function vStock() {
    const groups = { out: state.books.filter((b) => stockOf(b) === 'out'), low: state.books.filter((b) => stockOf(b) === 'low'), ok: state.books.filter((b) => stockOf(b) === 'ok') };
    const tabs = [['out', `Out of stock (${groups.out.length})`], ['low', `Low stock (${groups.low.length})`], ['ok', `In stock (${groups.ok.length})`], ['log', 'Stock log']];
    const body = state.stockTab === 'log'
      ? table(['Date', 'Book', 'Action', 'Qty', 'Before', 'After', 'Source'],
        state.history.map((r) => h('tr', null, h('td', null, fmtTs(r.created_at)), h('td', { class: 'wrap' }, r.book_title), h('td', null, r.action), h('td', null, r.quantity), h('td', null, r.old_stock), h('td', null, r.new_stock), h('td', null, r.source || '-'))), 'No stock movements yet.')
      : table(['Title', 'Author', 'ISBN', 'Available', 'Total', ''],
        groups[state.stockTab].map((b) => h('tr', null, h('td', { class: 'wrap' }, b.title), h('td', { class: 'wrap' }, b.author), h('td', null, b.isbn || '-'), h('td', null, stockBadge(b)), h('td', null, b.total_copies),
          h('td', null, h('button', { class: 'btn btn-sm btn-success', onclick: () => restockDialog(b) }, '+ Restock')))), 'Nothing here.');
    return h('div', null, pageHead('Stock', `Low stock = ${LOW_STOCK} or fewer copies`),
      h('div', { class: 'card' },
        h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, label]) => h('button', { class: 'tab' + (state.stockTab === k ? ' active' : ''), role: 'tab', onclick: () => { state.stockTab = k; render(); } }, label))),
        body));
  }

  function restockDialog(book) {
    const qty = h('input', { type: 'number', min: 1, max: 10000, step: 1, value: 5 });
    const source = h('select', null, ['Purchase', 'Donation', 'Transfer', 'Other'].map((s) => h('option', { value: s }, s)));
    const notes = h('input', { type: 'text', maxlength: 300 });
    const err = h('p', { class: 'error', hidden: true, role: 'alert' });
    const ok = h('button', { class: 'btn btn-success' }, 'Add stock');
    ok.addEventListener('click', async () => {
      const q = parseInt(qty.value, 10);
      if (!Number.isInteger(q) || q < 1 || q > 10000) { err.textContent = 'Enter a quantity between 1 and 10000.'; err.hidden = false; return; }
      ok.disabled = true;
      const { error } = await sb.rpc('restock_book', { p_book_id: book.id, p_quantity: q, p_source: source.value, p_notes: notes.value.trim() });
      ok.disabled = false;
      if (error) { err.textContent = friendlyError(error); err.hidden = false; return; }
      closeDialog(); toast(`Added ${q} copies`, 'success'); refresh();
    });
    const lbl = (t, el) => h('label', { class: 'field' }, h('span', null, t), el);
    openDialog('Restock book', h('div', null, h('p', { class: 'muted' }, book.title), lbl('Quantity', qty), lbl('Source', source), lbl('Notes (optional)', notes), err),
      [h('button', { class: 'btn', onclick: closeDialog }, 'Cancel'), ok]);
  }

  // ---------- History ----------
  function vHistory() {
    const q = state.historyQuery.toLowerCase();
    const filtered = state.tx.filter((t) => (state.historyStatus === 'all' || t.status === state.historyStatus) && (!q || [t.student_name, t.student_email, t.student_phone, t.book_title].some((x) => (x || '').toLowerCase().includes(q))));
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    state.historyPage = Math.min(state.historyPage, pages);
    const list = filtered.slice((state.historyPage - 1) * PAGE_SIZE, state.historyPage * PAGE_SIZE);
    const search = h('input', { class: 'history-search', type: 'search', placeholder: 'Search student or book…', value: state.historyQuery, maxlength: 100, 'aria-label': 'Search history' });
    search.addEventListener('input', () => {
      state.historyQuery = search.value.trim(); state.historyPage = 1;
      const pos = search.selectionStart; render();
      const again = $('.history-search'); again.focus(); again.setSelectionRange(pos, pos);
    });
    const status = h('select', { 'aria-label': 'Filter history by status', onchange: () => { state.historyStatus = status.value; state.historyPage = 1; render(); } },
      [['all', 'All records'], ['issued', 'Issued'], ['returned', 'Returned']].map(([value, label]) => h('option', { value, selected: state.historyStatus === value }, label)));
    const exportBtn = h('button', { class: 'btn', onclick: () => {
      const rows = state.tx.map((t) => ({ ID: t.id, Student: safeCell(t.student_name), Email: safeCell(t.student_email || ''), Phone: safeCell(t.student_phone || ''), Book: safeCell(t.book_title), Issued: t.issue_date, Due: t.due_date, Returned: t.return_date || '', Status: t.status }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'History');
      XLSX.writeFile(wb, `history_${isoToday()}.xlsx`);
    } }, 'Export Excel');
    return h('div', null, pageHead('History', 'All issue and return records', exportBtn),
      h('div', { class: 'card' }, h('div', { class: 'list-controls' }, search, status), table(['ID', 'Student', 'Book', 'Issued', 'Due', 'Returned', 'Status'],
        list.map((t) => h('tr', null, h('td', null, t.id), h('td', null, t.student_name), h('td', { class: 'wrap' }, t.book_title), h('td', null, fmtDate(t.issue_date)), h('td', null, fmtDate(t.due_date)), h('td', null, fmtDate(t.return_date)),
          h('td', null, h('span', { class: 'badge ' + (t.status === 'issued' ? 'b-soon' : 'b-done') }, t.status)))), 'No records found.'), pager(state.historyPage, pages, filtered.length, (page) => { state.historyPage = page; render(); })));
  }

  // ---------- Account ----------
  function vSettings() {
    const pw1 = h('input', { type: 'password', autocomplete: 'new-password', maxlength: 200 });
    const pw2 = h('input', { type: 'password', autocomplete: 'new-password', maxlength: 200 });
    const err = h('p', { class: 'error', hidden: true, role: 'alert' });
    const btn = h('button', { class: 'btn btn-primary' }, 'Change password');
    btn.addEventListener('click', async () => {
      err.hidden = true;
      const a = pw1.value, b = pw2.value;
      let msg = '';
      if (a.length < 10) msg = 'Use at least 10 characters.';
      else if (!/[a-z]/.test(a) || !/[A-Z]/.test(a) || !/[0-9]/.test(a)) msg = 'Include upper-case, lower-case and a number.';
      else if (a !== b) msg = 'Passwords do not match.';
      if (msg) { err.textContent = msg; err.hidden = false; return; }
      btn.disabled = true;
      const { error } = await sb.auth.updateUser({ password: a });
      btn.disabled = false;
      if (error) { err.textContent = 'Could not change password. Try signing in again.'; err.hidden = false; return; }
      pw1.value = ''; pw2.value = '';
      toast('Password changed', 'success');
    });
    const clearDataButton = h('button', { class: 'btn btn-danger' }, 'Clear all data');
    clearDataButton.addEventListener('click', async () => {
      const confirmed = await typedConfirmDialog(
        'Clear all library data?',
        'This permanently deletes every book, issue and return record, and stock-history entry. Your admin account will remain active.',
        'Xondhan Library',
        'Clear all data'
      );
      if (!confirmed) return;
      clearDataButton.disabled = true;
      clearStatus.className = 'clear-data-status is-pending';
      clearStatus.textContent = 'Clearing library data...';
      try {
        const { error } = await sb.rpc('clear_library_data');
        if (error) {
          clearStatus.className = 'clear-data-status';
          clearStatus.replaceChildren();
          return toast(friendlyError(error), 'error');
        }
        state.books = [];
        state.tx = [];
        state.history = [];
        clearStatus.className = 'clear-data-status is-success';
        clearStatus.replaceChildren(
          h('span', { class: 'clear-data-check', 'aria-hidden': 'true' }, '✓'),
          h('span', null, 'All library data cleared')
        );
        const showcase = $('#content .account-showcase');
        if (showcase) showcase.replaceWith(window.createAccountShowcase({ books: [], transactions: [] }));
        toast('All library data cleared', 'success');
      } catch (error) {
        clearStatus.className = 'clear-data-status';
        clearStatus.replaceChildren();
        toast(friendlyError(error), 'error');
      } finally {
        clearDataButton.disabled = false;
      }
    });
    const clearStatus = h('p', { class: 'clear-data-status', role: 'status', 'aria-live': 'polite' });
    const lbl = (t, el) => h('label', { class: 'field' }, h('span', null, t), el);
    return h('div', null, pageHead('Account'),
      h('div', { class: 'card' }, h('h2', null, 'Change password'), lbl('New password', pw1), lbl('Confirm new password', pw2), err, btn),
      h('section', { class: 'card clear-data-panel' }, h('h2', null, 'Clear library data'),
        h('p', { class: 'muted' }, 'Remove all books, borrowing records and stock history. Your admin login will remain.'),
        clearDataButton, clearStatus),
      h('section', { class: 'card' }, h('h2', null, 'Terms & Conditions'), window.createAccountTermsButton()),
      window.createAccountShowcase({ books: state.books, transactions: state.tx }));
  }

  // ---------- Init ----------
  $('#loginForm').addEventListener('submit', onLogin);
  $('#logoutBtn').addEventListener('click', signOut);
  $('#nav').addEventListener('click', (e) => { const b = e.target.closest('.nav-btn'); if (b) go(b.dataset.view); });
  $('#mobileMenuToggle').addEventListener('click', () => setMobileNav(!state.mobileNavOpen));
  $('#sidebarBackdrop').addEventListener('click', () => setMobileNav(false));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.mobileNavOpen) setMobileNav(false); });

  (async () => {
    const { data } = await sb.auth.getSession();
    if (data.session && (await isAdmin())) await enterApp();
    else { if (data.session) await sb.auth.signOut(); $('#loginView').hidden = false; }
  })();
})();
