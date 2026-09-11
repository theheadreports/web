// ------------------------------------------------------------------
// إعداد المدارس الست — نظرة عامة موحّدة
// ------------------------------------------------------------------
// كل مدرسة هنا لها مشروع Firebase خاص بها (منفصل تمامًا عن البقية)، وهذا الملف
// يجمع فقط معلومات الاتصال العامة (config) + اسم العرض + لون البطاقة الخاص بها.
// هذه القيم "عامة" بطبيعة تصميم Firebase وليست أسرارًا — تمامًا مثل كل موقع مدرسة على حدة.
//
// ملاحظة مهمة: مدرسة "eduplus-khamis" أدناه لا تزال بقيم غير حقيقية (لم يتم ربط
// مشروع Firebase فعلي بها بعد) — بطاقتها ستظهر بحالة "غير متاح" حتى يتم استكمال
// إعداد Firebase الخاص بها في موقعها المستقل.
// ------------------------------------------------------------------

export const SCHOOLS = [
  {
    id: 'edusteps-riyadh',
    name: 'إيديوبلس - الرياض',
    color: '#2f6fed',
    firebaseConfig: {
      apiKey: 'AIzaSyBbwKmwsXBvPoGQdSJtg0lYNws1zmmaDfU',
      authDomain: 'edusteps-riyadh.firebaseapp.com',
      projectId: 'edusteps-riyadh',
      storageBucket: 'edusteps-riyadh.firebasestorage.app',
      messagingSenderId: '807100965198',
      appId: '1:807100965198:web:55d187043245e8d5bc7e1f',
    },
  },
  {
    id: 'eduplus-khamis',
    name: 'إيديوبلس - خميس',
    color: '#16a34a',
    firebaseConfig: {
      apiKey: 'AIzaSyDiLP5vCqE58_C-VZLW8lcgXEvo-t54S8E',
      authDomain: 'edusteps-khamis.firebaseapp.com',
      projectId: 'edusteps-khamis',
      storageBucket: 'edusteps-khamis.firebasestorage.app',
      messagingSenderId: '766959634196',
      appId: '1:766959634196:web:5e330fc8d406f76ed1e401',
    },
  },
  {
    id: 'eduplus-abha',
    name: 'إيديوبلس - أبها',
    color: '#f59e0b',
    // قاعدة بيانات Firestore في هذا المشروع تحديدًا أُنشئت باسم مخصّص "default" (بدون قوسين)
    // بدل الاسم الافتراضي المحجوز "(default)" — لذلك يجب تحديد databaseId صراحة هنا.
    databaseId: 'default',
    firebaseConfig: {
      apiKey: 'AIzaSyD1l1f_28mVk9L1xVWUyMGP3a0HRk6xGGw',
      authDomain: 'eduplus-abha.firebaseapp.com',
      projectId: 'eduplus-abha',
      storageBucket: 'eduplus-abha.firebasestorage.app',
      messagingSenderId: '1042252819558',
      appId: '1:1042252819558:web:d743c955383f1f9d73d1a7',
    },
  },
  {
    id: 'edu-steps-accounting',
    name: 'رياض ومدارس إديو ستبس العالمية',
    color: '#ec4899',
    firebaseConfig: {
      apiKey: 'AIzaSyCgk_XHTkZZAZVb3xSnvA138v_HJ_1Unbg',
      authDomain: 'edusteps2-d4093.firebaseapp.com',
      projectId: 'edusteps2-d4093',
      storageBucket: 'edusteps2-d4093.firebasestorage.app',
      messagingSenderId: '979878374470',
      appId: '1:979878374470:web:a962f93a9e912fa4976e47',
    },
  },
  {
    id: 'cute-kids-international',
    name: 'إيديوبلس - نجران',
    color: '#8b5cf6',
    firebaseConfig: {
      apiKey: 'AIzaSyDhbJ0SYdmhJWHcMvvBPIm8Yl9uh4PDCHk',
      authDomain: 'cute-kids-48c5a.firebaseapp.com',
      projectId: 'cute-kids-48c5a',
      storageBucket: 'cute-kids-48c5a.firebasestorage.app',
      messagingSenderId: '643261840017',
      appId: '1:643261840017:web:1be895bad096ab50139d30',
    },
  },
  {
    id: 'al-masar-sudani',
    name: 'المسار السوداني',
    color: '#0ea5e9',
    firebaseConfig: {
      apiKey: 'AIzaSyC1eLDfHjG9eBjPRTgp1hAaHkzoxgbuCJ8',
      authDomain: 'almasar-alsudani.firebaseapp.com',
      projectId: 'almasar-alsudani',
      storageBucket: 'almasar-alsudani.firebasestorage.app',
      messagingSenderId: '711114800171',
      appId: '1:711114800171:web:e2c112026b601726753e6e',
    },
  },
];

// ترتيب الصفوف وربطها بالمراحل — نفس القائمة المستخدمة في كل موقع مدرسة على حدة
// (لا يوجد حقل "مرحلة" مخزّن فعليًا في البيانات؛ الاستنتاج هنا يعتمد على معرّف الصف،
// وهو ثابت ومطابق في كل المواقع الستة لأنها جميعًا مبنية على نفس القالب).
export const GRADES = [
  { id: 'kg_s', name: 'تمهيدي (KG-S)', stage: 'kg' },
  { id: 'kg1', name: 'الروضة الأولى (KG1)', stage: 'kg' },
  { id: 'kg2', name: 'الروضة الثانية (KG2)', stage: 'kg' },
  { id: 'g1', name: 'الصف الأول الابتدائي', stage: 'primary' },
  { id: 'g2', name: 'الصف الثاني الابتدائي', stage: 'primary' },
  { id: 'g3', name: 'الصف الثالث الابتدائي', stage: 'primary' },
  { id: 'g4', name: 'الصف الرابع الابتدائي', stage: 'primary' },
  { id: 'g5', name: 'الصف الخامس الابتدائي', stage: 'primary' },
  { id: 'g6', name: 'الصف السادس الابتدائي', stage: 'primary' },
  { id: 'g7', name: 'الصف الأول المتوسط', stage: 'middle' },
  { id: 'g8', name: 'الصف الثاني المتوسط', stage: 'middle' },
  { id: 'g9', name: 'الصف الثالث المتوسط', stage: 'middle' },
  { id: 'g10', name: 'الصف الأول الثانوي', stage: 'secondary' },
  { id: 'g11', name: 'الصف الثاني الثانوي', stage: 'secondary' },
  { id: 'g12', name: 'الصف الثالث الثانوي', stage: 'secondary' },
];

export const STAGES = [
  { id: 'kg', name: 'رياض الأطفال', color: '#ec4899' },
  { id: 'primary', name: 'المرحلة الابتدائية', color: '#2f6fed' },
  { id: 'middle', name: 'المرحلة المتوسطة', color: '#16a34a' },
  { id: 'secondary', name: 'المرحلة الثانوية', color: '#f59e0b' },
];

export function gradeById(id) {
  return GRADES.find((g) => g.id === id) || null;
}

export function stageById(id) {
  return STAGES.find((s) => s.id === id) || null;
}

// دليل الحسابات — نفس القائمة الثابتة المستخدمة في كود كل موقع مدرسة على حدة (store.js)،
// لذلك يمكن الاعتماد عليها هنا لعرض المصروفات والرسوم حسب الحساب دون قراءة إضافية من Firestore.
export const ACCOUNTS = [
  { id: 'cash', code: '1001', name: 'الصندوق (النقدية)', type: 'asset' },
  { id: 'bank', code: '1002', name: 'البنك', type: 'asset' },
  { id: 'rev_tuition', code: '4001', name: 'إيرادات الرسوم الدراسية', type: 'revenue' },
  { id: 'rev_activities', code: '4002', name: 'إيرادات الأنشطة والباصات', type: 'revenue' },
  { id: 'rev_other', code: '4003', name: 'إيرادات أخرى', type: 'revenue' },
  { id: 'exp_salaries', code: '5001', name: 'رواتب الموظفين', type: 'expense' },
  { id: 'exp_supplies', code: '5003', name: 'مستلزمات وقرطاسية', type: 'expense' },
  { id: 'exp_maintenance', code: '5004', name: 'صيانة وتشغيل', type: 'expense' },
  { id: 'exp_other', code: '5005', name: 'مصروفات أخرى', type: 'expense' },
];

export function accountById(id) {
  return ACCOUNTS.find((a) => a.id === id) || null;
}

export function accountLabel(id) {
  return accountById(id) || { id, code: '—', name: id || 'حساب غير معروف', type: '' };
}
