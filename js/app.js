import { SCHOOLS, STAGES, gradeById } from './schools-config.js';
import { loadAllSchools } from './data.js';

// ------------------------------------------------------------------
// حالة التطبيق
// ------------------------------------------------------------------
const state = {
  results: new Map(), // schoolId -> نتيجة loadOneSchool
  view: 'overview', // 'overview' | 'school' | 'stage'
  schoolId: null,
  stageId: null,
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
  mainContent: document.getElementById('mainContent'),
};

function fmt(n) {
  return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  if (state.view === 'stage') {
    state.view = 'school';
    state.stageId = null;
  } else if (state.view === 'school') {
    state.view = 'overview';
    state.schoolId = null;
  }
  render();
});

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
// المستوى ٣: تفاصيل مرحلة داخل مدرسة — بطاقة لكل صف
// ------------------------------------------------------------------
function renderStageView() {
  const r = state.results.get(state.schoolId);
  if (!r || r.status !== 'ok') { state.view = 'overview'; return render(); }
  const stage = STAGES.find((s) => s.id === state.stageId);
  if (!stage) { state.view = 'school'; return render(); }

  el.backBtn.hidden = false;
  el.pageTitle.textContent = `${stage.name} — ${r.school.name}`;
  el.pageSubtitle.textContent = 'اختر الصف للمتابعة';

  const gradesInStage = [...r.byGrade.entries()].filter(([gradeId]) => {
    const g = gradeById(gradeId);
    return g && g.stage === stage.id;
  });

  const stageAgg = r.byStage.get(stage.id) || emptyAgg();

  const cards = gradesInStage.length
    ? gradesInStage
        .map(([gradeId, a]) => {
          const grade = gradeById(gradeId);
          return `<div class="stage-card" style="background:${stage.color}">
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
}

// ------------------------------------------------------------------
// التحكم العام بالعرض
// ------------------------------------------------------------------
function render() {
  if (state.view === 'overview') renderOverview();
  else if (state.view === 'school') renderSchoolView();
  else if (state.view === 'stage') renderStageView();
}
