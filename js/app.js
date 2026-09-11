import { SCHOOLS, STAGES, GRADES, ACCOUNTS, gradeById } from './schools-config.js';
import {
  loadAllSchools, refreshSchool, addPayment, setStudentArchived, transferStudent,
  deleteStudent, deleteAllStudentsInClass, createManager, updateManager,
  sendManagerPasswordReset, deleteManager, changeSharedPassword, getSessionSchoolIds, getSessionInfo,
} from './data.js';

// ------------------------------------------------------------------
// حالة التطبيق
// ------------------------------------------------------------------
const state = {
  results: new Map(), // schoolId -> نتيجة loadOneSchool / refreshSchool
  view: 'overview', // 'overview' | 'school' | 'stage' | 'class' | 'archive' | 'expenses' | 'settings'
  returnView: 'overview', // الشاشة التي نعود إليها من الأرشيف/المنصرفات/الإعدادات
  schoolId: null,
  stageId: null,
  classId: null,
  classSearch: '',
  settingsTab: 'account', // 'account' | 'managers'
  modal: null,
};

const el = {
  loginScreen: document.getElementById('loginScreen'),
  loginForm: document.getElementById('loginForm'),
  loginUsername: document.getElementById('loginUsername'),
  loginPassword: document.getElementById('loginPassword'),
  loginSubmitBtn: document.getElementById('loginSubmitBtn'),
  loginError: document.getElementById('loginError'),
  topbar: document.getElementById('topbar'),
  backBtn: document.getElementById('backBtn'),
  pageTitle: document.getElementById('pageTitle'),
  pageSubtitle: document.getElementById('pageSubtitle'),
  logoutBtn: document.getElementById('logoutBtn'),
  expensesBtn: document.getElementById('expensesBtn'),
  archiveBtn: document.getElementById('archiveBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  mainContent: document.getElementById('mainContent'),
  modalRoot: document.getElementById('modalRoot'),
};

function fmt(n) {
  return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function describeError(e) {
  const code = e && e.code;
  if (code === 'permission-denied') return 'الحساب الحالي لا يملك صلاحية "مسؤول" اللازمة لهذا الإجراء في هذه المدرسة.';
  return (e && e.message) || String(e);
}
let toastTimer = null;
function showToast(message, isError = false) {
  let toastEl = document.getElementById('toastEl');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'toastEl';
    document.body.appendChild(toastEl);
  }
  toastEl.className = 'toast' + (isError ? ' error' : '');
  toastEl.textContent = message;
  toastEl.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.style.display = 'none'; }, 4000);
}

async function reloadSchool(schoolId) {
  const fresh = await refreshSchool(schoolId);
  state.results.set(schoolId, fresh);
  return fresh;
}

// ------------------------------------------------------------------
// تسجيل الدخول
// ------------------------------------------------------------------
el.loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const username = el.loginUsername.value.trim();
  const password = el.loginPassword.value;
  if (!username || !password) return;

  el.loginError.style.display = 'none';
  el.loginSubmitBtn.disabled = true;
  el.loginSubmitBtn.textContent = 'جارٍ تسجيل الدخول...';

  el.loginScreen.hidden = true;
  el.topbar.hidden = false;
  el.mainContent.hidden = false;

  state.results = new Map();
  for (const school of SCHOOLS) state.results.set(school.id, { school, status: 'loading' });
  state.view = 'overview';
  render();

  loadAllSchools(username, password, (result) => {
    state.results.set(result.school.id, result);
    render();
  }).finally(() => {
    el.loginSubmitBtn.disabled = false;
    el.loginSubmitBtn.textContent = 'تسجيل الدخول';
  });
});

el.logoutBtn.addEventListener('click', () => {
  window.location.reload();
});

el.backBtn.addEventListener('click', () => {
  if (state.view === 'class') {
    state.view = 'stage';
    state.classId = null;
  } else if (state.view === 'stage') {
    state.view = 'school';
    state.stageId = null;
  } else if (state.view === 'school') {
    state.view = 'overview';
    state.schoolId = null;
  } else if (state.view === 'archive' || state.view === 'expenses' || state.view === 'settings') {
    state.view = state.returnView || 'overview';
  }
  render();
});

function openTopLevel(view) {
  if (!['archive', 'expenses', 'settings'].includes(state.view)) state.returnView = state.view;
  state.view = view;
  render();
}
el.expensesBtn.addEventListener('click', () => openTopLevel('expenses'));
el.archiveBtn.addEventListener('click', () => openTopLevel('archive'));
el.settingsBtn.addEventListener('click', () => openTopLevel('settings'));

// ------------------------------------------------------------------
// عرض المؤشرات (KPI)
// ------------------------------------------------------------------
function kpiCard({ label, value, cls = '', icon = '' }) {
  return `
    <div class="kpi-card ${cls}">
      <div>
        <div class="kpi-label">${label}</div>
        <div class="kpi-value">${value}</div>
      </div>
      ${icon ? `<div class="kpi-icon">${icon}</div>` : ''}
    </div>`;
}

function renderKpiRow(agg) {
  return `<div class="kpi-grid">
    ${kpiCard({ label: 'عدد الطلاب', value: agg.studentCount.toLocaleString('en-US'), icon: '👥' })}
    ${kpiCard({ label: 'إجمالي المحصل (رسوم دراسية)', value: fmt(agg.collected), icon: '💵' })}
    ${kpiCard({ label: 'إجمالي المتبقي على الطلاب', value: fmt(agg.outstanding), cls: 'bad', icon: '📈' })}
    ${kpiCard({ label: 'إجمالي الرسوم المتوقعة', value: fmt(agg.expectedFees), cls: 'fill-blue filled' })}
    ${kpiCard({ label: 'صافي الدخل', value: fmt(agg.totalRevenue - agg.totalExpense), cls: 'fill-green filled' })}
    ${kpiCard({ label: 'إجمالي المصروفات', value: fmt(agg.totalExpense), cls: 'fill-red filled' })}
  </div>`;
}

function emptyAgg() {
  return { studentCount: 0, expectedFees: 0, collected: 0, totalRevenue: 0, totalExpense: 0, outstanding: 0 };
}
function addInto(a, b) {
  a.studentCount += b.studentCount;
  a.expectedFees += b.expectedFees;
  a.collected += b.collected;
  a.totalRevenue += b.totalRevenue;
  a.totalExpense += b.totalExpense;
  a.outstanding += b.outstanding;
}

// ------------------------------------------------------------------
// المستوى ١: نظرة عامة — بطاقة لكل مدرسة
// ------------------------------------------------------------------
function renderOverview() {
  el.backBtn.hidden = true;
  el.pageTitle.textContent = 'نظرة عامة — جميع المدارس';
  el.pageSubtitle.textContent = 'إجمالي مجمّع من المدارس الست، مع تفصيل كل مدرسة على حدة';

  const okResults = [...state.results.values()].filter((r) => r.status === 'ok');
  const combined = emptyAgg();
  for (const r of okResults) addInto(combined, r.overall);

  const notConfigured = [...state.results.values()].filter((r) => r.status === 'not_configured');
  const failed = [...state.results.values()].filter((r) => r.status === 'auth_error' || r.status === 'read_error' || r.status === 'error');

  let banners = '';
  if (notConfigured.length) {
    banners += `<div class="banner warn">⚠️ ${notConfigured.map((r) => r.school.name).join('، ')}: لم يتم ربط مشروع Firebase الخاص بهذه المدرسة بعد — لن تظهر بياناتها حتى يكتمل إعدادها.</div>`;
  }
  if (failed.length) {
    banners += failed
      .map((r) => `<div class="banner error">⚠️ ${r.school.name}: ${r.message || 'تعذّر تحميل بيانات هذه المدرسة.'}</div>`)
      .join('');
  }

  const cards = SCHOOLS.map((school) => {
    const r = state.results.get(school.id);
    const status = r ? r.status : 'loading';
    const color = school.color;
    if (status === 'loading') {
      return `<div class="stage-card" style="background:${color}">
        <div class="sc-loading">جارٍ التحميل...</div>
        <div class="sc-name" style="margin-top:8px">${school.name}</div>
      </div>`;
    }
    if (status !== 'ok') {
      const label = status === 'not_configured' ? 'غير مُعد بعد' : 'تعذّر التحميل';
      return `<div class="stage-card disabled" style="background:${color}">
        <span class="sc-badge">${label}</span>
        <div class="sc-count">—</div>
        <div class="sc-name">${school.name}</div>
      </div>`;
    }
    const a = r.overall;
    return `<div class="stage-card clickable" style="background:${color}" data-school="${school.id}">
      <div class="sc-count">${a.studentCount}</div>
      <div class="sc-name">${school.name}</div>
      <div class="sc-rows">
        <div class="sc-row"><span class="lbl">المحصل:</span><span>${fmt(a.collected)}</span></div>
        <div class="sc-row"><span class="lbl">المتبقي:</span><span>${fmt(a.outstanding)}</span></div>
      </div>
    </div>`;
  }).join('');

  el.mainContent.innerHTML = `
    ${banners}
    ${renderKpiRow(combined)}
    <div class="section-title">المدارس</div>
    <div class="card-grid">${cards}</div>
  `;

  el.mainContent.querySelectorAll('[data-school]').forEach((cardEl) => {
    cardEl.addEventListener('click', () => {
      state.schoolId = cardEl.dataset.school;
      state.view = 'school';
      render();
    });
  });
}

// ------------------------------------------------------------------
// المستوى ٢: تفاصيل مدرسة — بطاقة لكل مرحلة
// ------------------------------------------------------------------
function renderSchoolView() {
  const r = state.results.get(state.schoolId);
  if (!r || r.status !== 'ok') { state.view = 'overview'; return render(); }

  el.backBtn.hidden = false;
  el.pageTitle.textContent = r.school.name;
  el.pageSubtitle.textContent = 'اختر المرحلة للاطلاع على صفوفها';

  const cards = STAGES.map((stage) => {
    const a = r.byStage.get(stage.id) || emptyAgg();
    return `<div class="stage-card clickable" style="background:${stage.color}" data-stage="${stage.id}">
      <div class="sc-count">${a.studentCount}</div>
      <div class="sc-name">${stage.name}</div>
      <div class="sc-rows">
        <div class="sc-row"><span class="lbl">الرسوم:</span><span>${fmt(a.expectedFees)}</span></div>
        <div class="sc-row"><span class="lbl">المحصل:</span><span>${fmt(a.collected)}</span></div>
        <div class="sc-row"><span class="lbl">المتبقي:</span><span>${fmt(a.outstanding)}</span></div>
      </div>
    </div>`;
  }).join('');

  el.mainContent.innerHTML = `
    ${renderKpiRow(r.overall)}
    <div class="section-title">المراحل الدراسية</div>
    <div class="card-grid">${cards}</div>
  `;

  el.mainContent.querySelectorAll('[data-stage]').forEach((cardEl) => {
    cardEl.addEventListener('click', () => {
      state.stageId = cardEl.dataset.stage;
      state.view = 'stage';
      render();
    });
  });
}

// ------------------------------------------------------------------
// المستوى ٣: تفاصيل مرحلة داخل مدرسة — بطاقة لكل صف (قابلة للنقر الآن لعرض طلاب الصف)
// ------------------------------------------------------------------
function renderStageView() {
  const r = state.results.get(state.schoolId);
  if (!r || r.status !== 'ok') { state.view = 'overview'; return render(); }
  const stage = STAGES.find((s) => s.id === state.stageId);
  if (!stage) { state.view = 'school'; return render(); }

  el.backBtn.hidden = false;
  el.pageTitle.textContent = `${stage.name} — ${r.school.name}`;
  el.pageSubtitle.textContent = 'اختر الصف لعرض قائمة الطلاب';

  const gradesInStage = [...r.byGrade.entries()].filter(([gradeId]) => {
    const g = gradeById(gradeId);
    return g && g.stage === stage.id;
  });

  const stageAgg = r.byStage.get(stage.id) || emptyAgg();

  const cards = gradesInStage.length
    ? gradesInStage
        .map(([gradeId, a]) => {
          const grade = gradeById(gradeId);
          return `<div class="stage-card clickable" style="background:${stage.color}" data-grade="${gradeId}">
            <div class="sc-count">${a.studentCount}</div>
            <div class="sc-name">${grade ? grade.name : gradeId}</div>
            <div class="sc-rows">
              <div class="sc-row"><span class="lbl">إجمالي الرسوم:</span><span>${fmt(a.expectedFees)}</span></div>
              <div class="sc-row"><span class="lbl">المحصل:</span><span>${fmt(a.collected)}</span></div>
              <div class="sc-row"><span class="lbl">المتبقي:</span><span>${fmt(a.outstanding)}</span></div>
            </div>
          </div>`;
        })
        .join('')
    : '';

  el.mainContent.innerHTML = `
    ${renderKpiRow(stageAgg)}
    <div class="section-title">الصفوف</div>
    ${cards ? `<div class="card-grid">${cards}</div>` : '<div class="empty-note">لا يوجد طلاب في هذه المرحلة حاليًا.</div>'}
  `;

  el.mainContent.querySelectorAll('[data-grade]').forEach((cardEl) => {
    cardEl.addEventListener('click', () => {
      state.classId = cardEl.dataset.grade;
      state.classSearch = '';
      state.view = 'class';
      render();
    });
  });
}

// ------------------------------------------------------------------
// المستوى ٤: طلاب صف واحد — بطاقة لكل طالب مع إجراءات (تفاصيل/حذف/أرشفة/نقل)
// ------------------------------------------------------------------
function studentStatus(netFee, paid) {
  const remaining = round2(netFee - paid);
  if (netFee > 0 && remaining <= 0) return { key: 'paid', label: 'مكتمل' };
  if (paid > 0) return { key: 'pending', label: 'معلق' };
  return { key: 'overdue', label: 'لم يُدفع' };
}

function studentCardHtml(school, r, s, { showArchiveAction = true, showTransferAction = true } = {}) {
  const netFee = round2((Number(s.tuition_fee) || 0) * (1 - (Number(s.discount_percent) || 0) / 100));
  const paid = round2((r.paidByStudent && r.paidByStudent.get(s.id)) || 0);
  const remaining = Math.max(0, round2(netFee - paid));
  const pct = netFee > 0 ? Math.min(100, Math.round((paid / netFee) * 100)) : (paid > 0 ? 100 : 0);
  const status = studentStatus(netFee, paid);

  const archiveBtn = showArchiveAction
    ? `<button class="btn btn-ghost" data-action="archive" data-school="${school.id}" data-student="${s.id}">🗄 أرشفة</button>`
    : `<button class="btn btn-ghost" data-action="unarchive" data-school="${school.id}" data-student="${s.id}">↩ إلغاء الأرشفة</button>`;
  const transferBtn = showTransferAction
    ? `<button class="btn btn-ghost" data-action="transfer" data-school="${school.id}" data-student="${s.id}">⇧ نقل</button>`
    : '';

  return `<div class="student-card">
    <span class="st-badge ${status.key}">${status.label}</span>
    <div class="st-name">${escapeHtml(s.name || '')}</div>
    <div class="st-regno">الرقم: ${escapeHtml(s.reg_no || '—')}</div>
    <div class="st-row"><span class="lbl">إجمالي الرسوم</span><span class="val">${fmt(netFee)}</span></div>
    <div class="st-row"><span class="lbl">المدفوع</span><span class="val paid">${fmt(paid)}</span></div>
    <div class="st-row"><span class="lbl">المتبقي</span><span class="val remaining">${fmt(remaining)}</span></div>
    <div class="progress-row"><span>${pct}%</span><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div></div>
    <button class="btn btn-primary" style="width:100%;margin-bottom:8px" data-action="details" data-school="${school.id}" data-student="${s.id}">عرض التفاصيل</button>
    <div class="st-actions">
      <button class="btn btn-danger" data-action="delete" data-school="${school.id}" data-student="${s.id}">🗑 حذف</button>
      ${archiveBtn}
      ${transferBtn}
    </div>
  </div>`;
}

function wireStudentCardActions(container) {
  container.querySelectorAll('[data-action="details"]').forEach((btn) => {
    btn.addEventListener('click', () => openStudentDetail(btn.dataset.school, btn.dataset.student));
  });
  container.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => onDeleteStudent(btn.dataset.school, btn.dataset.student));
  });
  container.querySelectorAll('[data-action="archive"]').forEach((btn) => {
    btn.addEventListener('click', () => onArchiveStudent(btn.dataset.school, btn.dataset.student, true));
  });
  container.querySelectorAll('[data-action="unarchive"]').forEach((btn) => {
    btn.addEventListener('click', () => onArchiveStudent(btn.dataset.school, btn.dataset.student, false));
  });
  container.querySelectorAll('[data-action="transfer"]').forEach((btn) => {
    btn.addEventListener('click', () => openTransferModal(btn.dataset.school, btn.dataset.student));
  });
}

function renderClassView() {
  const r = state.results.get(state.schoolId);
  if (!r || r.status !== 'ok') { state.view = 'overview'; return render(); }
  const grade = gradeById(state.classId);

  el.backBtn.hidden = false;
  el.pageTitle.textContent = grade ? grade.name : (state.classId || '');
  el.pageSubtitle.textContent = `${r.school.name} — إدارة سجلات الطلاب وتتبع دفعات الرسوم`;

  const allInClass = (r.students || []).filter((s) => s.class_id === state.classId && s.archived !== true);
  const q = state.classSearch.trim().toLowerCase();
  const filtered = q
    ? allInClass.filter((s) => [s.name, s.reg_no, s.guardian_phone].some((f) => String(f || '').toLowerCase().includes(q)))
    : allInClass;

  const cardsHtml = filtered.length
    ? `<div class="student-grid">${filtered.map((s) => studentCardHtml(r.school, r, s)).join('')}</div>`
    : '<div class="empty-note">لا يوجد طلاب في هذا الصف.</div>';

  el.mainContent.innerHTML = `
    <div class="toolbar-row">
      <button class="btn btn-primary" id="addStudentBtn" disabled title="إضافة طالب من لوحة التحكم الموحّدة قيد الإعداد — أضيفوه من موقع المدرسة نفسها حاليًا">+ إضافة طالب (قريبًا)</button>
      <input class="search-input" id="classSearchInput" placeholder="ابحث بالاسم أو رقم القيد أو جوال ولي الأمر..." value="${escapeHtml(state.classSearch)}" />
      <button class="btn btn-danger" id="deleteAllBtn">🗑 حذف جميع الطلاب</button>
    </div>
    <div class="section-title">${grade ? escapeHtml(grade.name) : ''} <span style="color:var(--text-muted);font-weight:700;font-size:13px">(${filtered.length})</span></div>
    ${cardsHtml}
  `;

  document.getElementById('classSearchInput').addEventListener('input', (e) => {
    state.classSearch = e.target.value;
    render();
  });
  document.getElementById('deleteAllBtn').addEventListener('click', onDeleteAllInClass);
  wireStudentCardActions(el.mainContent);
}

// ------------------------------------------------------------------
// إجراءات الطلاب (كتابة في Firestore)
// ------------------------------------------------------------------
async function onDeleteStudent(schoolId, studentId) {
  const r = state.results.get(schoolId);
  const s = r && (r.students || []).find((x) => x.id === studentId);
  if (!s) return;
  if (!confirm(`هل أنتم متأكدون من حذف الطالب "${s.name || ''}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
  try {
    await deleteStudent(schoolId, studentId);
    await reloadSchool(schoolId);
    render();
    showToast('تم حذف الطالب.');
  } catch (e) {
    showToast('تعذّر الحذف: ' + describeError(e), true);
  }
}

async function onArchiveStudent(schoolId, studentId, archived) {
  try {
    await setStudentArchived(schoolId, studentId, archived);
    await reloadSchool(schoolId);
    render();
    showToast(archived ? 'تمت أرشفة الطالب — لن يظهر ضمن أي إحصائية بعد الآن.' : 'تم إلغاء أرشفة الطالب.');
  } catch (e) {
    showToast('تعذّر التنفيذ: ' + describeError(e), true);
  }
}

async function onDeleteAllInClass() {
  const r = state.results.get(state.schoolId);
  if (!r) return;
  const ids = (r.students || []).filter((s) => s.class_id === state.classId && s.archived !== true).map((s) => s.id);
  if (!ids.length) return;
  if (!confirm(`هل أنتم متأكدون من حذف كل طلاب هذا الصف (${ids.length} طالبًا)؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
  try {
    await deleteAllStudentsInClass(state.schoolId, ids);
    await reloadSchool(state.schoolId);
    render();
    showToast('تم حذف كل طلاب هذا الصف.');
  } catch (e) {
    showToast('تعذّر الحذف: ' + describeError(e), true);
  }
}

function openStudentDetail(schoolId, studentId) {
  state.modal = { type: 'studentDetail', schoolId, studentId };
  renderModal();
}

function openTransferModal(schoolId, studentId) {
  state.modal = { type: 'transfer', schoolId, studentId };
  renderModal();
}

// ------------------------------------------------------------------
// الأرشيف — الطلاب المؤرشفون عبر كل المدارس
// ------------------------------------------------------------------
function renderArchiveView() {
  el.backBtn.hidden = false;
  el.pageTitle.textContent = 'الأرشيف';
  el.pageSubtitle.textContent = 'الطلاب المؤرشفون عبر كل المدارس — مستبعدون من كل الإحصائيات في هذه اللوحة';

  const groups = [];
  for (const school of SCHOOLS) {
    const r = state.results.get(school.id);
    if (!r || r.status !== 'ok') continue;
    const archived = (r.students || []).filter((s) => s.archived === true);
    if (archived.length) groups.push({ school, r, archived });
  }

  if (!groups.length) {
    el.mainContent.innerHTML = '<div class="empty-note">لا يوجد طلاب مؤرشفون حاليًا.</div>';
    return;
  }

  el.mainContent.innerHTML = `
    <div class="banner warn">⚠️ ملاحظة: الأرشفة هنا خاصة بهذه اللوحة الموحّدة فقط — الطالب سيبقى يظهر بشكل طبيعي داخل موقع مدرسته الخاص ما لم يُعدَّل ذلك الموقع لاحقًا ليتعرّف على نفس الحقل.</div>
    ${groups.map((g) => `
      <div class="school-group-title"><span class="dot" style="background:${g.school.color}"></span>${escapeHtml(g.school.name)} (${g.archived.length})</div>
      <div class="student-grid">${g.archived.map((s) => studentCardHtml(g.school, g.r, s, { showArchiveAction: false, showTransferAction: false })).join('')}</div>
    `).join('')}
  `;
  wireStudentCardActions(el.mainContent);
}

// ------------------------------------------------------------------
// المنصرفات — تفصيل حسب البند لكل مدرسة، وإجمالي مجمّع
// ------------------------------------------------------------------
function renderExpensesView() {
  el.backBtn.hidden = false;
  el.pageTitle.textContent = 'المنصرفات';
  el.pageSubtitle.textContent = 'تفصيل المصروفات حسب البند لكل مدرسة، وإجمالي مجمّع لكل المدارس';

  const expenseAccounts = ACCOUNTS.filter((a) => a.type === 'expense');
  const combined = new Map(expenseAccounts.map((a) => [a.id, 0]));
  let combinedTotal = 0;
  const sections = [];

  for (const school of SCHOOLS) {
    const r = state.results.get(school.id);
    if (!r || r.status !== 'ok') continue;
    const rows = expenseAccounts.map((a) => ({ account: a, amount: round2((r.expenseByAccount && r.expenseByAccount.get(a.id)) || 0) }));
    const total = round2(rows.reduce((sum, row) => sum + row.amount, 0));
    rows.forEach((row) => combined.set(row.account.id, round2((combined.get(row.account.id) || 0) + row.amount)));
    combinedTotal = round2(combinedTotal + total);
    sections.push({ school, rows, total });
  }

  const combinedRows = expenseAccounts.map((a) => `<tr><td>${a.code} — ${a.name}</td><td class="amount">${fmt(combined.get(a.id) || 0)}</td></tr>`).join('');
  const sectionsHtml = sections.map((sec) => `
    <div class="school-group-title"><span class="dot" style="background:${sec.school.color}"></span>${escapeHtml(sec.school.name)}</div>
    <table class="expense-table">
      <thead><tr><th>البند</th><th>المبلغ</th></tr></thead>
      <tbody>
        ${sec.rows.map((row) => `<tr><td>${row.account.code} — ${row.account.name}</td><td class="amount">${fmt(row.amount)}</td></tr>`).join('')}
        <tr><td><strong>الإجمالي</strong></td><td class="amount"><strong>${fmt(sec.total)}</strong></td></tr>
      </tbody>
    </table>
  `).join('');

  el.mainContent.innerHTML = `
    <div class="section-title" style="margin-top:0">الإجمالي المجمّع — كل المدارس</div>
    <table class="expense-table">
      <thead><tr><th>البند</th><th>المبلغ</th></tr></thead>
      <tbody>${combinedRows}<tr><td><strong>الإجمالي الكلي</strong></td><td class="amount"><strong>${fmt(combinedTotal)}</strong></td></tr></tbody>
    </table>
    ${sectionsHtml}
  `;
}

// ------------------------------------------------------------------
// الإعدادات — حسابي / المديرين
// ------------------------------------------------------------------
function renderSettingsView() {
  el.backBtn.hidden = false;
  el.pageTitle.textContent = 'الإعدادات';
  el.pageSubtitle.textContent = '';

  el.mainContent.innerHTML = `
    <div class="tabs-row">
      <button class="tab-btn ${state.settingsTab === 'account' ? 'active' : ''}" data-tab="account">حسابي</button>
      <button class="tab-btn ${state.settingsTab === 'managers' ? 'active' : ''}" data-tab="managers">المديرين</button>
    </div>
    <div id="settingsTabContent"></div>
  `;
  el.mainContent.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => { state.settingsTab = btn.dataset.tab; render(); });
  });
  const content = document.getElementById('settingsTabContent');
  if (state.settingsTab === 'account') {
    content.innerHTML = accountTabHtml();
    wireAccountTab();
  } else {
    content.innerHTML = managersTabHtml();
    wireManagersTab();
  }
}

function accountTabHtml() {
  const rows = SCHOOLS.map((school) => {
    const info = getSessionInfo(school.id);
    if (!info) return '';
    return `<div class="st-row"><span class="lbl">${escapeHtml(school.name)}</span><span class="val">${escapeHtml(info.email)}</span></div>`;
  }).join('');
  return `
    <div class="student-summary-card">
      <div class="section-title" style="margin:0 0 10px;font-size:14px">البريد الإلكتروني الفعلي لهذا الحساب في كل مدرسة</div>
      ${rows || '<div class="empty-note">لا توجد جلسات دخول نشطة.</div>'}
    </div>
    <form id="changePasswordForm">
      <div class="section-title" style="font-size:14px;margin-top:0">تغيير كلمة المرور المشتركة</div>
      <p class="modal-note">سيتم تحديث كلمة المرور في كل مدرسة تم تسجيل الدخول إليها بنجاح في هذه الجلسة (${getSessionSchoolIds().length} من ${SCHOOLS.length}).</p>
      <div class="field-row"><label>كلمة المرور الحالية *</label><input type="password" id="curPass" required /></div>
      <div class="field-row"><label>كلمة المرور الجديدة (8 أحرف على الأقل) *</label><input type="password" id="newPass" required minlength="8" /></div>
      <button type="submit" class="btn btn-primary" style="width:100%">حفظ التغييرات</button>
      <div class="modal-error" id="passError"></div>
    </form>
  `;
}

function wireAccountTab() {
  const form = document.getElementById('changePasswordForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('passError');
    errEl.classList.remove('show');
    const cur = document.getElementById('curPass').value;
    const next = document.getElementById('newPass').value;
    const results = await changeSharedPassword(cur, next);
    const failed = results.filter((res) => !res.ok);
    if (!failed.length) {
      showToast('تم تحديث كلمة المرور في كل المدارس.');
      form.reset();
    } else {
      errEl.textContent = failed.map((f) => `${(SCHOOLS.find((s) => s.id === f.schoolId) || {}).name || f.schoolId}: ${f.error}`).join(' | ');
      errEl.classList.add('show');
    }
  });
}

function managersTabHtml() {
  return SCHOOLS.map((school) => {
    const r = state.results.get(school.id);
    if (!r || r.status !== 'ok') return '';
    if (!r.users) {
      return `
        <div class="school-group-title"><span class="dot" style="background:${school.color}"></span>${escapeHtml(school.name)}</div>
        <div class="empty-note">تعذّرت قراءة قائمة المستخدمين لهذه المدرسة (يتطلب حسابًا بصلاحية "مسؤول" في هذا المشروع).</div>
      `;
    }
    const cards = r.users.map((u) => managerCardHtml(school, u)).join('') || '<div class="empty-note">لا يوجد مستخدمون بعد.</div>';
    return `
      <div class="school-group-title">
        <span class="dot" style="background:${school.color}"></span>${escapeHtml(school.name)}
        <button class="btn btn-primary" style="margin-inline-start:auto;padding:7px 14px;font-size:12px" data-add-manager="${school.id}">+ إضافة مدير</button>
      </div>
      ${cards}
    `;
  }).join('');
}

function managerCardHtml(school, u) {
  const activeCls = u.active !== false ? 'status-active' : 'status-inactive';
  const activeLabel = u.active !== false ? 'نشط' : 'معطّل';
  const roleCls = u.role === 'admin' ? 'role-admin' : 'role-staff';
  const roleLabel = u.role === 'admin' ? 'مسؤول' : 'محاسب';
  return `
    <div class="manager-card">
      <div class="mg-top">
        <div class="mg-name">${escapeHtml(u.name || u.username || '—')}
          <span class="badge-pill ${roleCls}">${roleLabel}</span>
          <span class="badge-pill ${activeCls}">${activeLabel}</span>
        </div>
      </div>
      <div class="mg-email">${escapeHtml(u.email || '')} — اسم المستخدم: ${escapeHtml(u.username || '—')}</div>
      <div class="mg-actions">
        <button class="btn btn-ghost" data-mg-action="toggle" data-school="${school.id}" data-uid="${u.id}">${u.active !== false ? 'تعطيل' : 'تفعيل'}</button>
        <button class="btn btn-ghost" data-mg-action="role" data-school="${school.id}" data-uid="${u.id}">${u.role === 'admin' ? 'اجعله محاسب' : 'اجعله مسؤول'}</button>
        <button class="btn btn-ghost" data-mg-action="reset" data-school="${school.id}" data-uid="${u.id}">🔑 كلمة السر</button>
        <button class="btn btn-danger" data-mg-action="delete" data-school="${school.id}" data-uid="${u.id}">🗑 حذف</button>
      </div>
    </div>`;
}

function wireManagersTab() {
  el.mainContent.querySelectorAll('[data-add-manager]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.modal = { type: 'addManager', schoolId: btn.dataset.addManager };
      renderModal();
    });
  });
  el.mainContent.querySelectorAll('[data-mg-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const schoolId = btn.dataset.school;
      const uid = btn.dataset.uid;
      const action = btn.dataset.mgAction;
      const r = state.results.get(schoolId);
      const u = r && r.users && r.users.find((x) => x.id === uid);
      if (!u) return;
      try {
        if (action === 'toggle') {
          await updateManager(schoolId, uid, { name: u.name, role: u.role, active: !(u.active !== false) });
        } else if (action === 'role') {
          await updateManager(schoolId, uid, { name: u.name, role: u.role === 'admin' ? 'staff' : 'admin', active: u.active !== false });
        } else if (action === 'reset') {
          await sendManagerPasswordReset(schoolId, u.email);
          showToast('تم إرسال رسالة إعادة تعيين كلمة المرور إلى ' + u.email);
          return;
        } else if (action === 'delete') {
          if (!confirm(`حذف المستخدم "${u.name || u.username}"؟ سيفقد القدرة على الدخول للنظام فورًا.`)) return;
          await deleteManager(schoolId, uid);
        }
        await reloadSchool(schoolId);
        render();
        showToast('تم الحفظ.');
      } catch (e) {
        showToast('تعذّر التنفيذ: ' + describeError(e), true);
      }
    });
  });
}

// ------------------------------------------------------------------
// النوافذ المنبثقة (Modal)
// ------------------------------------------------------------------
function closeModal() {
  state.modal = null;
  el.modalRoot.innerHTML = '';
}

function studentDetailModalHtml(r, s) {
  const netFee = round2((Number(s.tuition_fee) || 0) * (1 - (Number(s.discount_percent) || 0) / 100));
  const paid = round2((r.paidByStudent && r.paidByStudent.get(s.id)) || 0);
  const remaining = Math.max(0, round2(netFee - paid));
  const pct = netFee > 0 ? Math.min(100, Math.round((paid / netFee) * 100)) : (paid > 0 ? 100 : 0);
  const grade = gradeById(s.class_id);
  const payments = (r.vouchers || [])
    .filter((v) => v.type === 'receipt' && v.student_id === s.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const paymentsHtml = payments.length
    ? `<div class="payment-history-list">${payments.map((v) => `
        <div class="payment-row">
          <div><div class="pr-amount">${fmt(v.amount)}</div><div class="pr-meta">${escapeHtml(v.date || '')} · ${v.method === 'bank' ? 'تحويل بنكي' : 'نقدًا'}</div></div>
          <div class="pr-meta">${escapeHtml(v.serial || '')}</div>
        </div>`).join('')}</div>`
    : '<div class="empty-note">لم يتم تسجيل دفعات بعد</div>';

  return `
    <div class="modal-header">
      <div><h2>${escapeHtml(s.name || '')}</h2><p class="modal-sub">الرقم: ${escapeHtml(s.reg_no || '—')}${grade ? ' · ' + escapeHtml(grade.name) : ''}</p></div>
      <button class="modal-close" id="modalCloseBtn">×</button>
    </div>
    <div class="student-summary-card">
      <div class="summary-grid">
        <div class="sg-item"><div class="sg-label">إجمالي الرسوم</div><div class="sg-value">${fmt(netFee)}</div></div>
        <div class="sg-item"><div class="sg-label">المبلغ المدفوع</div><div class="sg-value good">${fmt(paid)}</div></div>
        <div class="sg-item"><div class="sg-label">رقم الجوال</div><div class="sg-value" style="font-size:13px">${escapeHtml(s.guardian_phone || '—')}</div></div>
        <div class="sg-item"><div class="sg-label">المتبقي</div><div class="sg-value bad">${fmt(remaining)}</div></div>
      </div>
      <div class="progress-row" style="margin-top:14px"><span>${pct}%</span><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div></div>
    </div>
    <form id="addPaymentForm">
      <div class="field-grid-2">
        <div class="field-row"><label>المبلغ (ر.س) *</label><input type="number" id="payAmount" min="0.01" step="0.01" required /></div>
        <div class="field-row"><label>التاريخ *</label><input type="date" id="payDate" required value="${new Date().toISOString().slice(0, 10)}" /></div>
      </div>
      <div class="field-row"><label>طريقة الاستلام</label>
        <select id="payMethod"><option value="cash">نقدًا (الصندوق)</option><option value="bank">تحويل بنكي (البنك)</option></select>
      </div>
      <button type="submit" class="btn btn-primary" style="width:100%" id="addPaymentSubmitBtn">+ إضافة دفعة</button>
      <div class="modal-error" id="paymentError"></div>
    </form>
    <div class="section-title" style="margin-top:22px;font-size:13.5px">سجل الدفعات</div>
    ${paymentsHtml}
  `;
}

function renderModal() {
  if (!state.modal) { el.modalRoot.innerHTML = ''; return; }
  el.modalRoot.innerHTML = `<div class="modal-overlay" id="modalOverlay"><div class="modal-panel" id="modalPanel"></div></div>`;
  const overlay = document.getElementById('modalOverlay');
  const panel = document.getElementById('modalPanel');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  if (state.modal.type === 'studentDetail') {
    const { schoolId, studentId } = state.modal;
    const r = state.results.get(schoolId);
    const s = r && (r.students || []).find((x) => x.id === studentId);
    if (!s) { closeModal(); return; }
    panel.classList.add('modal-wide');
    panel.innerHTML = studentDetailModalHtml(r, s);
    document.getElementById('addPaymentForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('paymentError');
      errEl.classList.remove('show');
      const amount = document.getElementById('payAmount').value;
      const date = document.getElementById('payDate').value;
      const method = document.getElementById('payMethod').value;
      const btn = document.getElementById('addPaymentSubmitBtn');
      btn.disabled = true;
      try {
        await addPayment(schoolId, s, { amount, date, method });
        await reloadSchool(schoolId);
        render();
        state.modal = { type: 'studentDetail', schoolId, studentId };
        renderModal();
        showToast('تمت إضافة الدفعة.');
      } catch (err) {
        errEl.textContent = describeError(err);
        errEl.classList.add('show');
        btn.disabled = false;
      }
    });
  } else if (state.modal.type === 'transfer') {
    const { schoolId, studentId } = state.modal;
    const r = state.results.get(schoolId);
    const s = r && (r.students || []).find((x) => x.id === studentId);
    if (!s) { closeModal(); return; }
    const options = GRADES.filter((g) => g.id !== s.class_id).map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
    panel.innerHTML = `
      <div class="modal-header"><div><h2>نقل الطالب</h2><p class="modal-sub">${escapeHtml(s.name || '')}</p></div><button class="modal-close" id="modalCloseBtn">×</button></div>
      <div class="field-row"><label>الصف الجديد</label><select id="newClassSelect">${options}</select></div>
      <div class="modal-actions"><button class="btn btn-ghost" id="cancelTransferBtn" type="button">إلغاء</button><button class="btn btn-primary" id="confirmTransferBtn" type="button">نقل</button></div>
      <div class="modal-error" id="transferError"></div>
    `;
    document.getElementById('cancelTransferBtn').addEventListener('click', closeModal);
    document.getElementById('confirmTransferBtn').addEventListener('click', async () => {
      const newClassId = document.getElementById('newClassSelect').value;
      try {
        await transferStudent(schoolId, studentId, newClassId);
        await reloadSchool(schoolId);
        closeModal();
        render();
        showToast('تم نقل الطالب.');
      } catch (err) {
        const errEl = document.getElementById('transferError');
        errEl.textContent = describeError(err);
        errEl.classList.add('show');
      }
    });
  } else if (state.modal.type === 'addManager') {
    const school = SCHOOLS.find((sc) => sc.id === state.modal.schoolId);
    panel.innerHTML = `
      <div class="modal-header"><div><h2>إضافة مدير جديد</h2><p class="modal-sub">${escapeHtml(school ? school.name : '')}</p></div><button class="modal-close" id="modalCloseBtn">×</button></div>
      <form id="addManagerForm">
        <div class="field-row"><label>اسم المستخدم (للدخول) *</label><input id="mgUsername" required /></div>
        <div class="field-row"><label>البريد الإلكتروني *</label><input type="email" id="mgEmail" required /></div>
        <div class="field-row"><label>الاسم الكامل</label><input id="mgName" /></div>
        <div class="field-row"><label>الدور *</label>
          <select id="mgRole"><option value="staff">محاسب — بدون صلاحية إدارة المستخدمين</option><option value="admin">مسؤول — صلاحية كاملة</option></select>
        </div>
        <div class="field-row"><label>كلمة المرور (8 أحرف على الأقل) *</label><input type="password" id="mgPassword" required minlength="8" /></div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" id="mgCancelBtn">إلغاء</button><button type="submit" class="btn btn-primary">حفظ المستخدم</button></div>
        <div class="modal-error" id="mgError"></div>
      </form>
    `;
    document.getElementById('mgCancelBtn').addEventListener('click', closeModal);
    document.getElementById('addManagerForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('mgError');
      errEl.classList.remove('show');
      try {
        await createManager(school.id, {
          username: document.getElementById('mgUsername').value,
          email: document.getElementById('mgEmail').value,
          name: document.getElementById('mgName').value,
          role: document.getElementById('mgRole').value,
          password: document.getElementById('mgPassword').value,
        });
        await reloadSchool(school.id);
        closeModal();
        render();
        showToast('تم إنشاء المستخدم.');
      } catch (err) {
        errEl.textContent = describeError(err);
        errEl.classList.add('show');
      }
    });
  }

  const closeBtn = document.getElementById('modalCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
}

// ------------------------------------------------------------------
// التحكم العام بالعرض
// ------------------------------------------------------------------
function render() {
  if (state.view === 'overview') renderOverview();
  else if (state.view === 'school') renderSchoolView();
  else if (state.view === 'stage') renderStageView();
  else if (state.view === 'class') renderClassView();
  else if (state.view === 'archive') renderArchiveView();
  else if (state.view === 'expenses') renderExpensesView();
  else if (state.view === 'settings') renderSettingsView();
}
