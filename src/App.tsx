import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";
import {
  Users,
  FileSpreadsheet,
  Search,
  Filter,
  LayoutDashboard,
  ClipboardCheck,
  School,
  CheckCircle2,
  XCircle,
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
} from "lucide-react";

import {
  collection,
  getDocs,
  query,
  orderBy,
  writeBatch,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "./firebase";
import type { Student } from "./types";
import { parseStudentsFromExcel } from "./excelImport";
import { computeStudent } from "./rules";

// אם אין לך mockStudents אפשר לשים []
// import { mockStudents } from "./mock";

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4"];

type Tab = "dashboard" | "students" | "mapping";
type GradeFilter = "All" | "ט" | "י" | "יא" | "יב";
type Spec1Filter = "All" | "מדעי המחשב" | "מידע ונתונים";
type Spec2Filter = "All" | "פיזיקה" | "כימיה";

type SortKey =
  | "studentId"
  | "name"
  | "class"
  | "mathUnits"
  | "englishUnits"
  | "specialization1"
  | "specialization2"
  | "status";

type SortDir = "asc" | "desc";

type StudentForm = {
  studentId: string;
  name: string;
  grade: "" | "ט" | "י" | "יא" | "יב";
  classNum: string;

  mathUnits: 3 | 4 | 5 | null;
  englishUnits: 3 | 4 | 5 | null;

  specialization1: "" | "מדעי המחשב" | "מידע ונתונים";
  specialization2: "" | "פיזיקה" | "כימיה";

  status: "" | "זכאי" | "חסם 1-2" | "לא זכאי";
};

const emptyForm: StudentForm = {
  studentId: "",
  name: "",
  grade: "",
  classNum: "",
  mathUnits: null,
  englishUnits: null,
  specialization1: "",
  specialization2: "",
  status: "",
};

// Firestore לא מקבל undefined
function stripUndefined(obj: any): any {
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (obj && typeof obj === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out;
  }
  return obj;
}

const cmpStr = (a: any, b: any) =>
  String(a ?? "").localeCompare(String(b ?? ""), "he", { numeric: true, sensitivity: "base" });

const cmpNum = (a: any, b: any) => Number(a ?? 0) - Number(b ?? 0);

const getSortValue = (s: Student, key: SortKey) => {
  switch (key) {
    case "studentId":
      return String((s as any).studentId ?? "");
    case "name":
      return String(s.name ?? "");
    case "class":
      return `${String(s.grade ?? "")}${String(s.classNum ?? "")}`;
    case "mathUnits":
      return Number(s.mathUnits ?? 0);
    case "englishUnits":
      return Number(s.englishUnits ?? 0);
    case "specialization1":
      return String(s.specialization1 ?? "");
    case "specialization2":
      return String(s.specialization2 ?? "");
    case "status":
      return String((s as any).status ?? "");
    default:
      return "";
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("students");
  const [students, setStudents] = useState<Student[]>([]); // או mockStudents
  const [loading, setLoading] = useState(false);

  // Filters (Students tab)
  const [filterGrade, setFilterGrade] = useState<GradeFilter>("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [mathFilter, setMathFilter] = useState<"All" | "3" | "4" | "5">("All");
  const [englishFilter, setEnglishFilter] = useState<"All" | "3" | "4" | "5">("All");
  const [spec1Filter, setSpec1Filter] = useState<"All" | "מדעי המחשב" | "מידע ונתונים">("All");
  const [spec2Filter, setSpec2Filter] = useState<Spec2Filter>("All");

  // Sort
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const toggleSort = (key: SortKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  };
  const arrow = (key: SortKey) => {
    if (!sort || sort.key !== key) return "↕";
    return sort.dir === "asc" ? "↑" : "↓";
  };

  // Dashboard chart filters
  const [mathChartGrade, setMathChartGrade] = useState<GradeFilter>("All");
  const [engChartGrade, setEngChartGrade] = useState<GradeFilter>("All");
  const [spec1ChartGrade, setSpec1ChartGrade] = useState<GradeFilter>("All");
  const [spec2ChartGrade, setSpec2ChartGrade] = useState<GradeFilter>("All");

  // CRUD modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState<StudentForm>(emptyForm);

  const fileRef = useRef<HTMLInputElement | null>(null);

  async function fetchStudents() {
    try {
      setLoading(true);
      const q = query(collection(db, "students"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const rows: Student[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setStudents(rows);
    } catch (e) {
      console.error(e);
      // אם תרצה: setStudents(mockStudents)
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleExcelFile(file: File) {
    setLoading(true);
    try {
      const parsed = await parseStudentsFromExcel(file);

      const batch = writeBatch(db);
      parsed.forEach((s: any) => {
        const ref = doc(collection(db, "students"));
        batch.set(
          ref,
          stripUndefined({
            ...s,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      await batch.commit();
      alert(`הועלו ${parsed.length} תלמידים בהצלחה ✅`);
      await fetchStudents();
    } catch (e: any) {
      console.error(e);
      alert(`שגיאה בייבוא: ${e?.message ?? "שגיאה"}`);
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(s: Student) {
    setEditing(s);
    setForm({
      studentId: String((s as any).studentId ?? ""),
      name: String(s.name ?? ""),
      grade: (s.grade as any) ?? "",
      classNum: String(s.classNum ?? ""),
      mathUnits: (s.mathUnits as any) ?? null,
      englishUnits: (s.englishUnits as any) ?? null,
      specialization1: (s.specialization1 as any) ?? "",
      specialization2: (s.specialization2 as any) ?? "",
      status: ((s as any).status as any) ?? "",
    });
    setModalOpen(true);
  }
async function saveStudent() {
  if (!form.name.trim()) return alert("חובה למלא שם תלמיד");
  if (!form.grade) return alert("חובה לבחור שכבה");
  if (!String(form.classNum).trim()) return alert("חובה למלא כיתה");

  // 1) בונים RawExcelRow מהטופס (כמו באקסל)
  const raw: RawExcelRow = {
    studentId: form.studentId.trim() || undefined,
    name: form.name.trim(),
    grade: form.grade as any,
    classNum: String(form.classNum).trim(),
    englishUnits: form.englishUnits,
    mathUnits: form.mathUnits,
    specialization1: form.specialization1 as any,
    specialization2: form.specialization2 as any,

    // אם אין לך שדה socialUnits בטופס -> ברירת מחדל 0
    socialUnits: 0,
  };

  // 2) מחשבים את כל הדגלים (TECH וכו') + totalUnits/status
  const computed = computeStudent(raw);

  // 3) payload לשמירה (כולל timestamps)
  const payload = stripUndefined({
    ...computed,
    updatedAt: serverTimestamp(),
    ...(editing ? {} : { createdAt: serverTimestamp() }),
  });

  try {
    setLoading(true);

    if (editing?.id) {
      await updateDoc(doc(db, "students", editing.id), payload);
      alert("עודכן בהצלחה ✅");
    } else {
      await addDoc(collection(db, "students"), payload);
      alert("נוסף תלמיד חדש ✅");
    }

    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
    await fetchStudents();
  } catch (e: any) {
    console.error(e);
    alert(`שגיאה בשמירה: ${e?.message ?? "שגיאה"}`);
  } finally {
    setLoading(false);
  }
}


  async function removeStudent(s: Student) {
    if (!s.id) return;
    if (!confirm(`למחוק את "${s.name}"?`)) return;

    try {
      setLoading(true);
      await deleteDoc(doc(db, "students", s.id));
      setStudents((prev) => prev.filter((x) => x.id !== s.id));
    } catch (e: any) {
      console.error(e);
      alert(`שגיאה במחיקה: ${e?.message ?? "שגיאה"}`);
    } finally {
      setLoading(false);
    }
  }

  // Dashboard distributions
  const getDistribution = (grade: GradeFilter, field: keyof Student, suffix = "") => {
    const base = grade === "All" ? students : students.filter((s) => s.grade === grade);
    const counts: Record<string, number> = {};
    base.forEach((s) => {
      const val = (s as any)[field];
      if (val !== null && val !== undefined && String(val) !== "") {
        const label = typeof val === "number" ? `${val} ${suffix}`.trim() : String(val);
        counts[label] = (counts[label] || 0) + 1;
      }
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  };

  const mathData = useMemo(
    () => getDistribution(mathChartGrade, "mathUnits", 'יח"ל'),
    [students, mathChartGrade]
  );
  const engData = useMemo(
    () => getDistribution(engChartGrade, "englishUnits", 'יח"ל'),
    [students, engChartGrade]
  );
  const spec1Data = useMemo(
    () => getDistribution(spec1ChartGrade, "specialization1"),
    [students, spec1ChartGrade]
  );
  const spec2Data = useMemo(
    () => getDistribution(spec2ChartGrade, "specialization2"),
    [students, spec2ChartGrade]
  );

  const stats = useMemo(() => {
    const grade12 = students.filter((s) => s.grade === "יב");
    return {
      total: students.length,
      eligible12: grade12.filter((s) => (s as any).status === "זכאי").length,
      math5_12: grade12.filter((s) => s.mathUnits === 5).length,
      eng5_12: grade12.filter((s) => s.englishUnits === 5).length,
      eliteTech12: grade12.filter((s) => (s as any).eliteTech === true).length,
    };
  }, [students]);

  // Students tab filter + sort
  const filteredStudents = useMemo(() => {
    const term = searchTerm.trim();
    return students.filter((s) => {
      const matchGrade = filterGrade === "All" || s.grade === filterGrade;
      const matchSearch =
        term === "" ||
        String(s.name ?? "").includes(term) ||
        String((s as any).studentId ?? "").includes(term);

      const matchMath = mathFilter === "All" || Number(s.mathUnits ?? 0) === Number(mathFilter);
      const matchEnglish =
        englishFilter === "All" || Number(s.englishUnits ?? 0) === Number(englishFilter);

      const matchSpec1 = spec1Filter === "All" || s.specialization1 === spec1Filter;
      const matchSpec2 = spec2Filter === "All" || s.specialization2 === spec2Filter;

      return matchGrade && matchSearch && matchMath && matchEnglish && matchSpec1 && matchSpec2;
    });
  }, [students, filterGrade, searchTerm, mathFilter, englishFilter, spec1Filter, spec2Filter]);

  const sortedStudents = useMemo(() => {
    const arr = [...filteredStudents];
    if (!sort) return arr;

    arr.sort((a, b) => {
      const va = getSortValue(a, sort.key);
      const vb = getSortValue(b, sort.key);

      const isNumeric = sort.key === "mathUnits" || sort.key === "englishUnits";
      const res = isNumeric ? cmpNum(va, vb) : cmpStr(va, vb);
      return sort.dir === "asc" ? res : -res;
    });

    return arr;
  }, [filteredStudents, sort]);

  const anyFilterOn =
    filterGrade !== "All" ||
    searchTerm !== "" ||
    mathFilter !== "All" ||
    englishFilter !== "All" ||
    spec1Filter !== "All" ||
    spec2Filter !== "All";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans" dir="rtl">
      {/* Header */}
      <header className="bg-blue-900 text-white px-6 py-4 shadow-lg flex items-center justify-between">
        <div className="flex items-center gap-3">
          <School className="text-blue-300" size={30} />
          <div className="text-xl md:text-2xl font-extrabold tracking-tight">
            בית ספר אלסנא - ניהול פדגוגי
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={openAdd}
            className="bg-white/10 hover:bg-white/15 px-4 py-2 rounded-xl flex items-center gap-2 transition text-sm font-bold"
          >
            <Plus size={16} /> הוסף תלמיד
          </button>

          <button
            onClick={() => fileRef.current?.click()}
            className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-xl flex items-center gap-2 transition text-sm font-bold"
          >
            <FileSpreadsheet size={16} /> ייבוא אקסל
          </button>

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleExcelFile(file);
              e.currentTarget.value = "";
            }}
          />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[280px] bg-white border-l border-slate-200 p-4">
          <div className="space-y-2">
            <SideBtn
              active={activeTab === "dashboard"}
              icon={<LayoutDashboard size={18} />}
              label="דשבורד ניהולי"
              onClick={() => setActiveTab("dashboard")}
            />
            <SideBtn
              active={activeTab === "students"}
              icon={<Users size={18} />}
              label="רשימת תלמידים"
              onClick={() => setActiveTab("students")}
            />
            <SideBtn
              active={activeTab === "mapping"}
              icon={<ClipboardCheck size={18} />}
              label="דוח מיפוי"
              onClick={() => setActiveTab("mapping")}
            />
          </div>

          <div className="mt-6 text-xs text-slate-500">
            {loading ? "טוען נתונים..." : `תלמידים: ${students.length}`}
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 p-6 overflow-y-auto">
          {/* DASHBOARD */}
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard
                  title='סה"כ תלמידים'
                  value={stats.total}
                  icon={<Users size={22} className="text-blue-600" />}
                  badgeBg="bg-blue-100"
                />
                <StatCard
                  title='זכאים (יב)'
                  value={stats.eligible12}
                  icon={<CheckCircle2 size={22} className="text-green-600" />}
                  badgeBg="bg-green-100"
                />
                <StatCard
                  title='5 יח"ל מתמטיקה (יב)'
                  value={stats.math5_12}
                  icon={<Filter size={22} className="text-amber-600" />}
                  badgeBg="bg-amber-100"
                />
                <StatCard
                  title="מצטייני Tech (יב)"
                  value={stats.eliteTech12}
                  icon={<CheckCircle2 size={22} className="text-purple-600" />}
                  badgeBg="bg-purple-100"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartWithFilter
                  title='יחידות לימוד - מתמטיקה'
                  data={mathData}
                  currentGrade={mathChartGrade}
                  setGrade={setMathChartGrade}
                />
                <ChartWithFilter
                  title='יחידות לימוד - אנגלית'
                  data={engData}
                  currentGrade={engChartGrade}
                  setGrade={setEngChartGrade}
                />
                <ChartWithFilter
                  title="התמחות 1"
                  data={spec1Data}
                  currentGrade={spec1ChartGrade}
                  setGrade={setSpec1ChartGrade}
                />
                <ChartWithFilter
                  title="התמחות 2"
                  data={spec2Data}
                  currentGrade={spec2ChartGrade}
                  setGrade={setSpec2ChartGrade}
                />
              </div>
            </div>
          )}

          {/* STUDENTS */}
          {activeTab === "students" && (
            <div className="space-y-4">
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center justify-between gap-2 border-b pb-2 mb-4">
                  <div className="flex items-center gap-2 text-blue-900 font-extrabold">
                    <Filter size={18} /> <span>חיפוש ופילוח מתקדם</span>
                  </div>

                
                </div>

                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                  <Field label="חיפוש שם / ת״ז">
                    <div className="relative">
                      <Search
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                        size={16}
                      />
                      <input
                        className="w-full pr-10 pl-3 py-2 border rounded-xl text-sm outline-none"
                        placeholder="הקלד שם או ת״ז..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                  </Field>

                  <Field label="שכבה">
                    <select
                      className="w-full p-2 border rounded-xl text-sm"
                      value={filterGrade}
                      onChange={(e) => setFilterGrade(e.target.value as any)}
                    >
                      <option value="All">הכל</option>
                      {["ט", "י", "יא", "יב"].map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="מתמטיקה">
                    <select
                      className="w-full p-2 border rounded-xl text-sm"
                      value={mathFilter}
                      onChange={(e) => setMathFilter(e.target.value as any)}
                    >
                      <option value="All">הכל</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                    </select>
                  </Field>

                  <Field label="אנגלית">
                    <select
                      className="w-full p-2 border rounded-xl text-sm"
                      value={englishFilter}
                      onChange={(e) => setEnglishFilter(e.target.value as any)}
                    >
                      <option value="All">הכל</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                    </select>
                  </Field>

                  <Field label="התמחות 1">
                    <select
                      className="w-full p-2 border rounded-xl text-sm"
                      value={spec1Filter}
                      onChange={(e) => setSpec1Filter(e.target.value as any)}
                    >
                      <option value="All">הכל</option>
                      <option value="מדעי המחשב">מדעי המחשב</option>
                      <option value="מידע ונתונים">מידע ונתונים</option>
                    </select>
                  </Field>

                  <Field label="התמחות 2">
                    <select
                      className="w-full p-2 border rounded-xl text-sm"
                      value={spec2Filter}
                      onChange={(e) => setSpec2Filter(e.target.value as any)}
                    >
                      <option value="All">הכל</option>
                      <option value="פיזיקה">פיזיקה</option>
                      <option value="כימיה">כימיה</option>
                    </select>
                  </Field>
                </div>

                {anyFilterOn && (
                  <button
                    onClick={() => {
                      setFilterGrade("All");
                      setSearchTerm("");
                      setMathFilter("All");
                      setEnglishFilter("All");
                      setSpec1Filter("All");
                      setSpec2Filter("All");
                      setSort(null);
                    }}
                    className="mt-4 text-xs text-red-600 hover:underline flex items-center gap-1"
                  >
                    <XCircle size={14} /> נקה פילטרים
                  </button>
                )}
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex justify-between items-center">
                  <h3 className="font-extrabold text-slate-700">תוצאות ({sortedStudents.length})</h3>
                  <button
                    onClick={fetchStudents}
                    className="text-xs px-3 py-1.5 rounded-lg border hover:bg-white"
                    title="רענון"
                  >
                    רענן
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-right">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                      <tr>
                        <th className="px-6 py-4">
                          <button className="font-bold hover:underline" onClick={() => toggleSort("studentId")}>
                            ת״ז {arrow("studentId")}
                          </button>
                        </th>
                        <th className="px-6 py-4">
                          <button className="font-bold hover:underline" onClick={() => toggleSort("name")}>
                            שם {arrow("name")}
                          </button>
                        </th>
                        <th className="px-6 py-4">
                          <button className="font-bold hover:underline" onClick={() => toggleSort("class")}>
                            כיתה {arrow("class")}
                          </button>
                        </th>
                        <th className="px-6 py-4">
                          <button className="font-bold hover:underline" onClick={() => toggleSort("mathUnits")}>
                            מתמטיקה {arrow("mathUnits")}
                          </button>
                        </th>
                        <th className="px-6 py-4">
                          <button className="font-bold hover:underline" onClick={() => toggleSort("englishUnits")}>
                            אנגלית {arrow("englishUnits")}
                          </button>
                        </th>
                        <th className="px-6 py-4">
                          <button className="font-bold hover:underline" onClick={() => toggleSort("specialization1")}>
                            התמחות 1 {arrow("specialization1")}
                          </button>
                        </th>
                        <th className="px-6 py-4">
                          <button className="font-bold hover:underline" onClick={() => toggleSort("specialization2")}>
                            התמחות 2 {arrow("specialization2")}
                          </button>
                        </th>
                        <th className="px-6 py-4">
                          <button className="font-bold hover:underline" onClick={() => toggleSort("status")}>
                            סטטוס {arrow("status")}
                          </button>
                        </th>
                        <th className="px-6 py-4 text-left">פעולות</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {sortedStudents.map((s) => (
                        <tr key={s.id} className="hover:bg-blue-50/50 transition">
                          <td className="px-6 py-4">{(s as any).studentId || "-"}</td>
                          <td className="px-6 py-4 font-extrabold">{s.name}</td>
                          <td className="px-6 py-4">
                            {s.grade}
                            {s.classNum}
                          </td>
                          <td className="px-6 py-4">
                            <Tag kind={s.mathUnits === 5 ? "purple" : "slate"}>
                              {s.mathUnits ? `${s.mathUnits} יח"ל` : "-"}
                            </Tag>
                          </td>
                          <td className="px-6 py-4">
                            <Tag kind={s.englishUnits === 5 ? "purple" : "slate"}>
                              {s.englishUnits ? `${s.englishUnits} יח"ל` : "-"}
                            </Tag>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-blue-100 text-blue-700">
                              {s.specialization1 || "-"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-green-100 text-green-700">
                              {s.specialization2 || "-"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <StatusPill status={(s as any).status} />
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                className="p-2 rounded-lg border hover:bg-slate-50"
                                title="עריכה"
                                onClick={() => openEdit(s)}
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                className="p-2 rounded-lg border hover:bg-rose-50 text-rose-600"
                                title="מחיקה"
                                onClick={() => removeStudent(s)}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}

                      {sortedStudents.length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-6 py-10 text-center text-slate-500">
                            אין תוצאות להצגה
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* MAPPING (מלא — לא ייעלם) */}
          {activeTab === "mapping" && (
            <div className="space-y-6">
              <div className="bg-amber-50 border border-amber-200 p-6 rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-xl font-extrabold text-amber-900">דוח מיפוי פדגוגי רב-שכבתי</div>
                  <div className="text-sm text-amber-700">תמונת מצב לימודית עבור כלל תלמידי ביה"ס</div>
                </div>
                <ClipboardCheck className="text-amber-600" size={40} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(["יב", "יא", "י", "ט"] as const).map((gradeName) => {
                  const gradeStudents = students.filter((s) => s.grade === gradeName);
                  const math5 = gradeStudents.filter((s) => s.mathUnits === 5).length;
                  const eng5 = gradeStudents.filter((s) => s.englishUnits === 5).length;
                  const eligible = gradeStudents.filter((s) => (s as any).status === "זכאי").length;

                  return (
                    <div
                      key={gradeName}
                      className="bg-white p-6 rounded-2xl border-t-4 border-blue-600 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex justify-between items-center mb-4 border-b pb-2">
                        <h3 className="text-lg font-black text-blue-900">שכבה {gradeName}</h3>
                        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold">
                          {gradeStudents.length} תלמידים
                        </span>
                      </div>

                      <div className="space-y-1">
                        <ReportItem label="זכאות לבגרות" value={eligible} />
                        <ReportItem label='מתמטיקה 5 יח"ל' value={math5} />
                        <ReportItem label='אנגלית 5 יח"ל' value={eng5} />
                        <ReportItem
                          label="אחוז מצוינות (מתמ׳ 5)"
                          value={
                            gradeStudents.length > 0
                              ? `${((math5 / gradeStudents.length) * 100).toFixed(1)}%`
                              : "0%"
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="bg-slate-800 text-white p-6 rounded-2xl shadow-lg">
                <div className="text-md font-bold mb-4 opacity-80 uppercase tracking-wider">סיכום כלל בית ספרי</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center border-l border-slate-700">
                    <div className="text-2xl font-black">{students.length}</div>
                    <div className="text-xs opacity-70">סה"כ תלמידים</div>
                  </div>
                  <div className="text-center border-l border-slate-700">
                    <div className="text-2xl font-black">{students.filter((s) => s.mathUnits === 5).length}</div>
                    <div className="text-xs opacity-70">סה"כ מתמטיקה 5</div>
                  </div>
                  <div className="text-center border-l border-slate-700">
                    <div className="text-2xl font-black">{students.filter((s) => (s as any).status === "זכאי").length}</div>
                    <div className="text-xs opacity-70">סה"כ זכאים</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-black">
                      {students.length > 0
                        ? (
                            (students.filter((s) => (s as any).status === "זכאי").length / students.length) * 100
                          ).toFixed(0)
                        : 0}
                      %
                    </div>
                    <div className="text-xs opacity-70">אחוז זכאות כללי</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL (Add/Edit) */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div className="font-extrabold text-slate-800">
                {editing ? "עריכת תלמיד" : "הוספת תלמיד חדש"}
              </div>
              <button
                className="p-2 rounded-lg hover:bg-slate-100"
                onClick={() => {
                  setModalOpen(false);
                  setEditing(null);
                  setForm(emptyForm);
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="ת״ז">
                <input
                  className="w-full p-2 border rounded-xl text-sm"
                  value={form.studentId}
                  onChange={(e) => setForm((p) => ({ ...p, studentId: e.target.value }))}
                  placeholder="לדוגמה: 333074169"
                />
              </Field>

              <Field label="שם">
                <input
                  className="w-full p-2 border rounded-xl text-sm"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="שם מלא"
                />
              </Field>

              <Field label="שכבה">
                <select
                  className="w-full p-2 border rounded-xl text-sm"
                  value={form.grade}
                  onChange={(e) => setForm((p) => ({ ...p, grade: e.target.value as any }))}
                >
                  <option value="">בחר</option>
                  <option value="ט">ט</option>
                  <option value="י">י</option>
                  <option value="יא">יא</option>
                  <option value="יב">יב</option>
                </select>
              </Field>

              <Field label="כיתה (מספר/אות)">
                <input
                  className="w-full p-2 border rounded-xl text-sm"
                  value={form.classNum}
                  onChange={(e) => setForm((p) => ({ ...p, classNum: e.target.value }))}
                  placeholder="1 / א / 2 ..."
                />
              </Field>

              <Field label='מתמטיקה (יח"ל)'>
                <select
                  className="w-full p-2 border rounded-xl text-sm"
                  value={form.mathUnits ?? ""}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      mathUnits: e.target.value ? (Number(e.target.value) as any) : null,
                    }))
                  }
                >
                  <option value="">ללא</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
              </Field>

              <Field label='אנגלית (יח"ל)'>
                <select
                  className="w-full p-2 border rounded-xl text-sm"
                  value={form.englishUnits ?? ""}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      englishUnits: e.target.value ? (Number(e.target.value) as any) : null,
                    }))
                  }
                >
                  <option value="">ללא</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
              </Field>

              <Field label="התמחות 1">
                <select
                  className="w-full p-2 border rounded-xl text-sm"
                  value={form.specialization1}
                  onChange={(e) => setForm((p) => ({ ...p, specialization1: e.target.value as any }))}
                >
                  <option value="">ללא</option>
                  <option value="מדעי המחשב">מדעי המחשב</option>
                  <option value="מידע ונתונים">מידע ונתונים</option>
                </select>
              </Field>

              <Field label="התמחות 2">
                <select
                  className="w-full p-2 border rounded-xl text-sm"
                  value={form.specialization2}
                  onChange={(e) => setForm((p) => ({ ...p, specialization2: e.target.value as any }))}
                >
                  <option value="">ללא</option>
                  <option value="פיזיקה">פיזיקה</option>
                  <option value="כימיה">כימיה</option>
                </select>
              </Field>

              <Field label="סטטוס">
                <select
                  className="w-full p-2 border rounded-xl text-sm"
                  value={form.status}
                  onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as any }))}
                >
                  <option value="">ללא</option>
                  <option value="זכאי">זכאי</option>
                  <option value="חסם 1-2">חסם 1-2</option>
                  <option value="לא זכאי">לא זכאי</option>
                </select>
              </Field>
            </div>

            <div className="px-6 py-4 border-t flex items-center justify-between">
              <button
                className="px-4 py-2 rounded-xl border hover:bg-slate-50 flex items-center gap-2"
                onClick={() => {
                  setModalOpen(false);
                  setEditing(null);
                  setForm(emptyForm);
                }}
              >
                <X size={16} /> ביטול
              </button>

              <button
                disabled={loading}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-2 disabled:opacity-60"
                onClick={saveStudent}
              >
                <Save size={16} /> שמור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------- UI helpers ----------------- */

function SideBtn({ active, icon, label, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-2xl transition ${
        active ? "bg-blue-50 text-blue-700 font-extrabold" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {icon} {label}
    </button>
  );
}

function StatCard({ title, value, icon, badgeBg }: any) {
  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border flex items-center justify-between">
      <div>
        <div className="text-slate-500 text-xs font-bold">{title}</div>
        <div className="text-2xl font-black text-slate-900">{value}</div>
      </div>
      <div className={`${badgeBg} p-2.5 rounded-xl`}>{icon}</div>
    </div>
  );
}

function Field({ label, children }: any) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-extrabold text-slate-500">{label}</div>
      {children}
    </div>
  );
}

function Tag({ kind, children }: any) {
  const cls = kind === "purple" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-700";
  return <span className={`px-2 py-1 rounded-xl text-xs font-extrabold ${cls}`}>{children}</span>;
}

function StatusPill({ status }: any) {
  const cls =
    status === "זכאי"
      ? "bg-green-100 text-green-700"
      : status === "חסם 1-2"
      ? "bg-rose-100 text-rose-700"
      : "bg-amber-100 text-amber-700";
  return <span className={`px-3 py-1 rounded-full text-xs font-extrabold ${cls}`}>{status || "-"}</span>;
}

function ReportItem({ label, value }: any) {
  return (
    <div className="flex justify-between items-center p-2.5 border-b text-sm">
      <span>{label}:</span>
      <span className="font-black text-blue-900">{value}</span>
    </div>
  );
}

function ChartWithFilter({ title, data, currentGrade, setGrade }: any) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
      <div className="text-md font-extrabold mb-3 text-slate-800">{title}</div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {["All", "ט", "י", "יא", "יב"].map((g) => (
          <button
            key={g}
            onClick={() => setGrade(g as any)}
            className={`px-3 py-1 text-xs font-bold rounded-full border transition-all ${
              currentGrade === g
                ? "bg-blue-600 text-white border-blue-600 shadow-md scale-105"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {g === "All" ? "הכל" : `שכבה ${g}`}
          </button>
        ))}
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={62} outerRadius={86} paddingAngle={6}>
              {data.map((_: any, idx: number) => (
                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend verticalAlign="bottom" height={34} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
