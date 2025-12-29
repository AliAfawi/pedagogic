import * as XLSX from "xlsx";
import { computeStudent, type RawExcelRow } from "./rules";
import type { Specialization1, Specialization2 } from "./types";

const toNum = (v: any) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
};

const toUnits345Nullable = (v: any): 3 | 4 | 5 | null => {
  const s = String(v ?? "").trim();
  if (!s) return null;

  const n = Number(s);
  return n === 3 || n === 4 || n === 5 ? (n as 3 | 4 | 5) : null;
};


const toSpec1 = (v: any): Specialization1 => {
  const s = String(v ?? "").trim();
  return s === "מדעי המחשב" || s === "מידע ונתונים" ? (s as Specialization1) : "";
};

const toSpec2 = (v: any): Specialization2 => {
  const s = String(v ?? "").trim();
  return s === "פיזיקה" || s === "כימיה" ? (s as Specialization2) : "";
};

export function parseStudentsFromExcel(file: File) {
  return new Promise<ReturnType<typeof computeStudent>[]>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("קריאת הקובץ נכשלה"));
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });

        const out = rows
          .map((r): RawExcelRow => ({
            studentId: String(r.studentId || "").trim() || undefined,
            name: String(r.name).trim(),
            grade: String(r.grade).trim() as any,
            classNum: String(r.classNum).trim(),

          englishUnits: toUnits345Nullable(r.englishUnits),
          mathUnits: toUnits345Nullable(r.mathUnits),



            specialization1: toSpec1(r.specialization1),
            specialization2: toSpec2(r.specialization2),

            socialUnits: toNum(r.socialUnits),
          }))
          .filter((s) => s.name && s.grade && s.classNum)
          .map(computeStudent);

        resolve(out);
      } catch (e: any) {
        reject(new Error(e?.message ?? "שגיאה בניתוח אקסל"));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}
