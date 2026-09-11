// ------------------------------------------------------------------
// طبقة البيانات: تسجيل الدخول إلى كل مشروع Firebase على حدة، وجلب بيانات
// الطلاب والسندات، ثم حساب نفس المؤشرات (KPIs) التي يحسبها كل موقع مدرسة
// بمفرده — لكن هنا تُجمَّع عبر المدارس الست معًا. كما توفر دوال الكتابة
// (إضافة دفعة، أرشفة/نقل/حذف طالب، إدارة المستخدمين، تغيير كلمة المرور)
// بنفس منطق وحقول كل موقع مدرسة على حدة (store.js) تمامًا.
// ------------------------------------------------------------------
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { SCHOOLS, gradeById, STAGES } from './schools-config.js';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function emptyAgg() {
  return {
    studentCount: 0,
    expectedFees: 0, // إجمالي الرسوم المتوقعة (بعد الخصم)
    collected: 0, // إجمالي المحصل من الرسوم الدراسية فقط (سندات القبض المرتبطة بطالب)
    totalRevenue: 0, // كل الإيرادات (تشمل أي دخل آخر غير مرتبط بطالب)
    totalExpense: 0, // إجمالي المصروفات
    outstanding: 0, // إجمالي المتبقي على الطلاب
  };
}

function addAgg(a, b) {
  a.studentCount += b.studentCount;
  a.expectedFees += b.expectedFees;
  a.collected += b.collected;
  a.totalRevenue += b.totalRevenue;
  a.totalExpense += b.totalExpense;
  a.outstanding += b.outstanding;
  return a;
}

// يحسب كل المؤشرات لمدرسة واحدة، بالإضافة إلى تجميعها حسب الصف والمرحلة
// ملاحظة: الطلاب المؤرشفون (archived === true) لا يُحسبون ضمن أي مؤشر — تمامًا مثل أنهم غير موجودين —
// حتى تعكس كل الأرقام حالة "الطلاب النشطين" فقط، ويظهر المؤرشفون فقط في شاشة الأرشيف المخصّصة.
function computeSchoolAggregates(students, vouchers) {
  const paidByStudent = new Map();
  let totalRevenue = 0;
  let totalExpense = 0;
  const expenseByAccount = new Map();
  const revenueByAccount = new Map();

  for (const v of vouchers) {
    const amount = Number(v.amount) || 0;
    if (v.type === 'receipt') {
      totalRevenue += amount;
      revenueByAccount.set(v.account_id || 'rev_other', (revenueByAccount.get(v.account_id || 'rev_other') || 0) + amount);
      if (v.student_id) {
        paidByStudent.set(v.student_id, (paidByStudent.get(v.student_id) || 0) + amount);
      }
    } else if (v.type === 'payment') {
      totalExpense += amount;
      expenseByAccount.set(v.account_id || 'exp_other', (expenseByAccount.get(v.account_id || 'exp_other') || 0) + amount);
    }
  }

  const byGrade = new Map(); // class_id -> agg
  const overall = emptyAgg();
  overall.totalRevenue = round2(totalRevenue);
  overall.totalExpense = round2(totalExpense);

  const activeStudents = students.filter((s) => s.archived !== true);

  for (const s of activeStudents) {
    const netFee = round2((Number(s.tuition_fee) || 0) * (1 - (Number(s.discount_percent) || 0) / 100));
    const paid = round2(paidByStudent.get(s.id) || 0);
    const remaining = Math.max(0, round2(netFee - paid));

    overall.studentCount += 1;
    overall.expectedFees += netFee;
    overall.collected += paid;
    overall.outstanding += remaining;

    const gradeId = s.class_id || '__unknown__';
    if (!byGrade.has(gradeId)) byGrade.set(gradeId, emptyAgg());
    const g = byGrade.get(gradeId);
    g.studentCount += 1;
    g.expectedFees += netFee;
    g.collected += paid;
    g.outstanding += remaining;
  }

  overall.expectedFees = round2(overall.expectedFees);
  overall.collected = round2(overall.collected);
  overall.outstanding = round2(overall.outstanding);
  for (const g of byGrade.values()) {
    g.expectedFees = round2(g.expectedFees);
    g.collected = round2(g.collected);
    g.outstanding = round2(g.outstanding);
  }

  // تجميع حسب المرحلة انطلاقًا من تجميع الصفوف
  const byStage = new Map();
  for (const stage of STAGES) byStage.set(stage.id, emptyAgg());
  for (const [gradeId, g] of byGrade.entries()) {
    const grade = gradeById(gradeId);
    const stageId = grade ? grade.stage : null;
    if (stageId && byStage.has(stageId)) addAgg(byStage.get(stageId), g);
  }

  return {
    overall, byGrade, byStage,
    paidByStudent, // Map<studentId, paidAmount> — تُستخدم في شاشة تفاصيل الطالب
    expenseByAccount, revenueByAccount, // Map<accountId, amount> — تُستخدم في شاشة المنصرفات
  };
}

// سجل الجلسات الحيّة (بعد تسجيل دخول ناجح) — يبقى محفوظًا في الذاكرة طوال الجلسة حتى تستخدمه
// دوال الكتابة (إضافة دفعة، حذف، أرشفة...) دون الحاجة لإعادة تسجيل الدخول في كل مرة.
const sessions = new Map(); // schoolId -> { school, app, db, auth, email, password }

function getSession(schoolId) {
  const s = sessions.get(schoolId);
  if (!s) throw new Error('لا توجد جلسة دخول فعّالة لهذه المدرسة — أعيدوا تسجيل الدخول.');
  return s;
}

// تسجيل الدخول إلى مدرسة واحدة (مشروع Firebase منفصل) ثم جلب بياناتها وحساب مؤشراتها
// يستخدم نفس أسلوب الدخول المستخدم في كل موقع مدرسة على حدة: اسم مستخدم يُحوَّل أولًا
// إلى البريد الإلكتروني الفعلي (عبر مستند usernames/{username} القابل للقراءة العامة)،
// ثم يُستخدم ذلك البريد لتسجيل الدخول الفعلي — ما يسمح باستخدام نفس اسم المستخدم وكلمة
// المرور في كل مدرسة حتى لو كان البريد الإلكتروني الفعلي المرتبط به مختلفًا من مدرسة لأخرى.
async function loadOneSchool(school, username, password) {
  if (school.notConfigured) {
    return { school, status: 'not_configured' };
  }
  let app;
  try {
    app = initializeApp(school.firebaseConfig, school.id);
  } catch (e) {
    return { school, status: 'error', message: 'تعذّر تهيئة الاتصال بمشروع Firebase الخاص بهذه المدرسة.' };
  }

  // بعض مشاريع Firebase (مثل eduplus-abha) أُنشئت فيها قاعدة بيانات Firestore باسم مخصّص
  // (مثل "default" بدون قوسين) بدل قاعدة البيانات الافتراضية المحجوزة الحقيقية "(default)" —
  // لهذا نسمح بتحديد databaseId صريح لكل مدرسة عبر schools-config.js عند الحاجة.
  const db = school.databaseId ? getFirestore(app, school.databaseId) : getFirestore(app);
  const uname = String(username || '').trim().toLowerCase();
  let email;
  try {
    const mapDoc = await getDoc(doc(db, 'usernames', uname));
    if (!mapDoc.exists()) {
      return { school, status: 'auth_error', message: 'اسم المستخدم هذا غير موجود في هذه المدرسة — راجعوا خطوات الإعداد.' };
    }
    email = mapDoc.data().email;
  } catch (e) {
    console.error('[schools-overview] usernames lookup failed for', school.id, e);
    return { school, status: 'auth_error', message: `تعذّر التحقق من اسم المستخدم لهذه المدرسة. (${(e && e.code) || (e && e.message) || e})` };
  }

  const auth = getAuth(app);
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    const code = e && e.code;
    let message = 'تعذّر تسجيل الدخول لهذه المدرسة.';
    if (code === 'auth/user-not-found' || code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      message = 'كلمة المرور غير صحيحة لهذه المدرسة — راجعوا خطوات الإعداد.';
    } else if (code === 'auth/too-many-requests') {
      message = 'محاولات كثيرة جدًا — الرجاء الانتظار قليلاً ثم إعادة المحاولة.';
    } else {
      console.error('[schools-overview] sign-in failed for', school.id, e);
      message = `تعذّر تسجيل الدخول لهذه المدرسة. [التفاصيل: ${code || (e && e.message) || e}]`;
    }
    return { school, status: 'auth_error', message };
  }

  sessions.set(school.id, { school, app, db, auth, email, password });

  try {
    const [studentsSnap, vouchersSnap, usersSnap] = await Promise.all([
      getDocs(collection(db, 'students')),
      getDocs(collection(db, 'vouchers')),
      getDocs(collection(db, 'users')).catch(() => null), // قد لا تُقرأ users إن كان الحساب غير مسؤول — لا نفشل الشاشة كلها بسببها
    ]);
    const students = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const vouchers = vouchersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const users = usersSnap ? usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : null;
    const agg = computeSchoolAggregates(students, vouchers);
    return { school, status: 'ok', students, vouchers, users, ...agg };
  } catch (e) {
    // نطبع الخطأ الحقيقي في console ونعرض جزءًا منه في الرسالة نفسها — بدل رسالة عامة موحّدة —
    // لتشخيص أي مشكلة فعلية (فهرس مفقود، قاعدة أمان، مشكلة شبكة...) بسرعة دون تخمين.
    console.error('[schools-overview] reading students/vouchers failed for', school.id, e);
    const detail = (e && e.code) || (e && e.message) || String(e);
    const message = `تعذّر قراءة بيانات هذه المدرسة — تحقّقوا من صلاحيات الحساب (users/{uid}.active يجب أن تساوي true). [التفاصيل: ${detail}]`;
    return { school, status: 'read_error', message };
  }
}

// يسجّل الدخول ويجلب بيانات كل المدارس الست بالتوازي، ويستدعي onSchoolResult
// فور جهوزية كل مدرسة على حدة (بدل الانتظار حتى تجهز جميعها معًا)
export function loadAllSchools(username, password, onSchoolResult) {
  sessions.clear();
  return Promise.all(
    SCHOOLS.map((school) =>
      loadOneSchool(school, username, password).then((result) => {
        onSchoolResult(result);
        return result;
      })
    )
  );
}

// يعيد تحميل بيانات مدرسة واحدة فقط (بعد أي عملية كتابة) باستخدام نفس بيانات الدخول المحفوظة في الجلسة
export async function refreshSchool(schoolId) {
  const s = getSession(schoolId);
  const [studentsSnap, vouchersSnap, usersSnap] = await Promise.all([
    getDocs(collection(s.db, 'students')),
    getDocs(collection(s.db, 'vouchers')),
    getDocs(collection(s.db, 'users')).catch(() => null),
  ]);
  const students = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const vouchers = vouchersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const users = usersSnap ? usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : null;
  const agg = computeSchoolAggregates(students, vouchers);
  return { school: s.school, status: 'ok', students, vouchers, users, ...agg };
}

// ------------------------------------------------------------------
// دوال الكتابة — تُطابق تمامًا نفس الحقول والمنطق المستخدم في js/store.js
// الخاص بكل موقع مدرسة على حدة (createReceipt / deleteStudent / updateStudent ...)
// حتى تبقى البيانات متوافقة ١٠٠٪ مع تطبيق المدرسة نفسه.
// ------------------------------------------------------------------

// إضافة دفعة (سند قبض) لطالب — يحجز رقمًا تسلسليًا فريدًا عبر معاملة Firestore
export async function addPayment(schoolId, student, { amount, date, method, accountId, note }) {
  const s = getSession(schoolId);
  const cashSide = method === 'bank' ? 'bank' : 'cash';
  const resolvedAccountId = accountId || 'rev_tuition';
  const ref = doc(collection(s.db, 'vouchers'));
  const record = {
    id: ref.id, type: 'receipt', serial: '', date, amount: round2(Number(amount)),
    party_name: student.name || '', student_id: student.id, method: cashSide,
    account_id: resolvedAccountId, fee_type_id: null,
    debit_account_id: cashSide, credit_account_id: resolvedAccountId,
    description: note || '', created_at: new Date().toISOString(),
  };
  await runTransaction(s.db, async (tx) => {
    const countersRef = doc(s.db, 'meta', 'counters');
    const countersSnap = await tx.get(countersRef);
    const counters = countersSnap.exists() ? countersSnap.data() : { receipt: 0, payment: 0 };
    const next = (counters.receipt || 0) + 1;
    record.serial = `REC-${String(next).padStart(4, '0')}`;
    tx.set(countersRef, { ...counters, receipt: next }, { merge: true });
    tx.set(ref, record);
  });
  return record;
}

// أرشفة/إلغاء أرشفة طالب — حقل "archived" غير موجود أصلًا في تطبيق المدرسة الخاص بها (store.js)،
// لذلك هذه الأرشفة تخصّ لوحة التحكم الموحّدة فقط حاليًا: الطالب سيختفي من كل الإحصائيات هنا،
// لكنه سيبقى ظاهرًا بشكل طبيعي في موقع المدرسة نفسه ما لم يُطلب لاحقًا تعديل ذلك الموقع أيضًا.
export async function setStudentArchived(schoolId, studentId, archived) {
  const s = getSession(schoolId);
  await updateDoc(doc(s.db, 'students', studentId), { archived: !!archived });
}

// نقل طالب إلى صف آخر — نفس منطق updateStudent في store.js (يحافظ على رقم القيد كما هو)
export async function transferStudent(schoolId, studentId, newClassId) {
  const s = getSession(schoolId);
  await updateDoc(doc(s.db, 'students', studentId), { class_id: newClassId, updated_at: new Date().toISOString() });
}

// حذف طالب واحد — يتطلب صلاحية "مسؤول" فعليًا عبر Security Rules في كل مشروع
export async function deleteStudent(schoolId, studentId) {
  const s = getSession(schoolId);
  await deleteDoc(doc(s.db, 'students', studentId));
}

// حذف كل طلاب صف واحد دفعة واحدة
export async function deleteAllStudentsInClass(schoolId, studentIds) {
  const s = getSession(schoolId);
  for (const id of studentIds) {
    // تتابعي عمدًا (لا Promise.all) لتفادي إغراق القراءة/الكتابة بطلبات متزامنة كثيرة جدًا دفعة واحدة
    await deleteDoc(doc(s.db, 'students', id));
  }
}

// ---------- إدارة المستخدمين (المديرين) — نفس منطق createUser/updateUser/deleteUser في store.js ----------

export async function createManager(schoolId, { username, password, name, role, email }) {
  const s = getSession(schoolId);
  const uname = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9_.\-]{3,30}$/.test(uname)) throw new Error('اسم المستخدم يجب أن يكون 3-30 حرفًا (إنجليزي/أرقام/._- فقط)');
  const mail = String(email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw new Error('يرجى إدخال بريد إلكتروني صحيح');
  if (!password || password.length < 8) throw new Error('كلمة المرور يجب ألا تقل عن 8 أحرف');
  const existingMap = await getDoc(doc(s.db, 'usernames', uname));
  if (existingMap.exists()) throw new Error('اسم المستخدم موجود مسبقًا في هذه المدرسة');
  const roleVal = role === 'admin' ? 'admin' : 'staff';

  // تطبيق Firebase ثانوي مؤقت حتى لا يُفقَد تسجيل دخول الحساب الحالي أثناء إنشاء الحساب الجديد
  const secondaryApp = initializeApp(s.school.firebaseConfig, `SecondaryUserCreation-${schoolId}-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, mail, password);
    const newUid = cred.user.uid;
    await signOut(secondaryAuth);
    const createdAt = Date.now();
    await setDoc(doc(s.db, 'users', newUid), {
      uid: newUid, username: uname, email: mail, name: (name || '').trim() || uname, role: roleVal, active: true, createdAt,
    });
    await setDoc(doc(s.db, 'usernames', uname), { email: mail });
    return { id: newUid, uid: newUid, username: uname, email: mail, name: (name || '').trim() || uname, role: roleVal, active: true, createdAt };
  } catch (e) {
    const code = e && e.code ? e.code : '';
    if (code === 'auth/email-already-in-use') throw new Error('هذا البريد الإلكتروني مستخدَم مسبقًا لحساب آخر');
    throw new Error('تعذّر إنشاء الحساب: ' + ((e && e.message) || code || e));
  } finally {
    try { await deleteApp(secondaryApp); } catch (e) { /* تجاهل */ }
  }
}

export async function updateManager(schoolId, uid, { name, role, active }) {
  const s = getSession(schoolId);
  const roleVal = role === 'admin' ? 'admin' : 'staff';
  await updateDoc(doc(s.db, 'users', uid), {
    ...(typeof name === 'string' && name.trim() ? { name: name.trim() } : {}),
    role: roleVal,
    active: active !== false,
  });
}

export async function sendManagerPasswordReset(schoolId, email) {
  const s = getSession(schoolId);
  await sendPasswordResetEmail(s.auth, email);
}

export async function deleteManager(schoolId, uid) {
  const s = getSession(schoolId);
  await deleteDoc(doc(s.db, 'users', uid));
}

// تغيير كلمة المرور المشتركة عبر كل المدارس التي تم تسجيل الدخول إليها بنجاح في هذه الجلسة —
// يتطلب "reauthenticate" أولًا (كلمة المرور الحالية) لأسباب أمنية يفرضها Firebase نفسه.
export async function changeSharedPassword(currentPassword, newPassword) {
  const results = [];
  for (const s of sessions.values()) {
    const user = s.auth.currentUser;
    if (!user) { results.push({ schoolId: s.school.id, ok: false, error: 'لا توجد جلسة دخول فعّالة.' }); continue; }
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPassword);
      results.push({ schoolId: s.school.id, ok: true });
    } catch (e) {
      const code = e && e.code;
      let message = (e && e.message) || String(e);
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') message = 'كلمة المرور الحالية غير صحيحة.';
      results.push({ schoolId: s.school.id, ok: false, error: message });
    }
  }
  return results;
}

export function getSessionSchoolIds() {
  return Array.from(sessions.keys());
}

export function getSessionInfo(schoolId) {
  const s = sessions.get(schoolId);
  return s ? { email: s.email } : null;
}
