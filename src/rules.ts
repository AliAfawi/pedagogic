import type { Student, StudentStatus, Specialization1, Specialization2 } from "./types";

export type RawExcelRow = {
  studentId?: string;
  name: string;
  grade: Student["grade"];
  classNum: string;

  englishUnits: Student["englishUnits"]; // 3|4|5|null
  mathUnits: Student["mathUnits"];       // 3|4|5|null

  specialization1: Specialization1; // "מדעי המחשב" | "מידע ונתונים" | ""
  specialization2: Specialization2; // "פיזיקה" | "כימיה" | ""

  socialUnits: number; // מקצועות הומניים/חברה וכו'
};

export type ComputedStudent = Omit<Student, "id">;

function norm(s: any) {
  return String(s ?? "").trim();
}

function spec1ToUnits(s1: Specialization1) {
  const s = norm(s1);
  if (s === "מדעי המחשב") return { csUnits: 5 as const, dataUnits: 0 as const };
  if (s === "מידע ונתונים") return { csUnits: 0 as const, dataUnits: 5 as const };
  return { csUnits: 0 as const, dataUnits: 0 as const };
}

function spec2ToUnits(s2: Specialization2) {
  const s = norm(s2);
  if (s === "פיזיקה") return { physicsUnits: 5 as const, chemistryUnits: 0 as const };
  if (s === "כימיה") return { physicsUnits: 0 as const, chemistryUnits: 5 as const };
  return { physicsUnits: 0 as const, chemistryUnits: 0 as const };
}

function toN(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function computeStudent(row: RawExcelRow): ComputedStudent {
  const { csUnits, dataUnits } = spec1ToUnits(row.specialization1);
  const { physicsUnits, chemistryUnits } = spec2ToUnits(row.specialization2);

  // יחידות מתמטיקה/אנגלית (אם null => 0 לחישוב)
  const m = toN(row.mathUnits);
  const e = toN(row.englishUnits);
  const soc = toN(row.socialUnits);

  // ✅ Tech eligibility / elite tech
  const techEligible = e === 5 && m === 5;
  const eliteTech = techEligible && (csUnits === 5 || dataUnits === 5);

  // ✅ דגלים נוספים (אופציונלי)
  const scienceElite = m === 5 && (physicsUnits === 5 || chemistryUnits === 5);
  const elite555 = m === 5 && e === 5 && (physicsUnits === 5 || csUnits === 5);

  // סה"כ יח"ל
  const totalUnits = e + m + csUnits + dataUnits + physicsUnits + chemistryUnits + soc;

  /**
   * ✅ סטטוס (יותר הגיוני):
   * - זכאי: totalUnits >= 21 וגם אנגלית >= 4 וגם מתמטיקה >= 3
   * - חסם 1-2: totalUnits בין 19-20 וגם אנגלית >= 4 וגם מתמטיקה >= 3
   * - אחרת: בתהליך
   */
  let status: StudentStatus = "בתהליך";

  const coreOk = e >= 4 && m >= 3;
  if (coreOk && totalUnits >= 21) status = "זכאי";
  else if (coreOk && totalUnits >= 19) status = "חסם 1-2";

  return {
    ...row,

    // יחידות נגזרות
    csUnits,
    dataUnits,
    physicsUnits,
    chemistryUnits,

    // דגלים
    techEligible,
    eliteTech,
    scienceElite,
    elite555,

    totalUnits,
    status,

    // ⚠️ לא לשים createdAt כאן — תן ל-App לשים serverTimestamp()
    // createdAt: Date.now(),
  } as ComputedStudent;
}
