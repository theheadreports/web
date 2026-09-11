// ------------------------------------------------------------------
// طبقة البيانات: تسجيل الدخول إلى كل مشروع Firebase على حدة، وجلب بيانات
// الطلاب والسندات، ثم حساب نفس المؤشرات (KPIs) التي يحسبها كل موقع مدرسة
// بمفرده — لكن هنا تُجمَّع عبر المدارس الست معًا.
// ------------------------------------------------------------------
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
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
function computeSchoolAggregates(students, vouchers) {
  const paidByStudent = new Map();
  let totalRevenue = 0;
  let totalExpense = 0;

  for (const v of vouchers) {
    const amount = Number(v.amount) || 0;
    if (v.type === 'receipt') {
      totalRevenue += amount;
      if (v.student_id) {
        paidByStudent.set(v.student_id, (paidByStudent.get(v.student_id) || 0) + amount);
      }
    } else if (v.type === 'payment') {
      totalExpense += amount;
    }
  }

  const byGrade = new Map(); // class_id -> agg
  const overall = emptyAgg();
  overall.totalRevenue = round2(totalRevenue);
  overall.totalExpense = round2(totalExpense);

  for (const s of students) {
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

  return { overall, byGrade, byStage };
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

  const db = getFirestore(app);
  const uname = String(username || '').trim().toLowerCase();
  let email;
  try {
    const mapDoc = await getDoc(doc(db, 'usernames', uname));
    if (!mapDoc.exists()) {
      return { school, status: 'auth_error', message: 'اسم المستخدم هذا غير موجود في هذه المدرسة — راجعوا خطوات الإعداد.' };
    }
    email = mapDoc.data().email;
  } catch (e) {
    return { school, status: 'auth_error', message: 'تعذّر التحقق من اسم المستخدم لهذه المدرسة.' };
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
    }
    return { school, status: 'auth_error', message };
  }

  try {
    const [studentsSnap, vouchersSnap] = await Promise.all([
      getDocs(collection(db, 'students')),
      getDocs(collection(db, 'vouchers')),
    ]);
    const students = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const vouchers = vouchersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const agg = computeSchoolAggregates(students, vouchers);
    return { school, status: 'ok', ...agg };
  } catch (e) {
    let message = 'تعذّر قراءة بيانات هذه المدرسة — تحقّقوا من صلاحيات الحساب (users/{uid}.active يجب أن تساوي true).';
    return { school, status: 'read_error', message };
  }
}

// يسجّل الدخول ويجلب بيانات كل المدارس الست بالتوازي، ويستدعي onSchoolResult
// فور جهوزية كل مدرسة على حدة (بدل الانتظار حتى تجهز جميعها معًا)
export function loadAllSchools(username, password, onSchoolResult) {
  return Promise.all(
    SCHOOLS.map((school) =>
      loadOneSchool(school, username, password).then((result) => {
        onSchoolResult(result);
        return result;
      })
    )
  );
}
