export type Grade = "ט" | "י" | "יא" | "יב";
export type StudentStatus = "זכאי" | "בתהליך" | "חסם 1-2";

export type Specialization1 = "" | "מדעי המחשב" | "מידע ונתונים";
export type Specialization2 = "" | "פיזיקה" | "כימיה";

export type Student = {
  id: string; 
  studentId?: string;
  name: string;
  grade: Grade;
  classNum: string;
  englishUnits: 3 | 4 | 5 | null;
  mathUnits: 3 | 4 | 5 | null;
  specialization1: Specialization1;
  specialization2: Specialization2;
  socialUnits: number;
  csUnits: 0 | 5;
  dataUnits: 0 | 5;
  physicsUnits: 0 | 5;
  chemistryUnits: 0 | 5;
  techEligible: boolean;     
  eliteTech: boolean;        
  scienceElite: boolean;     
  elite555?: boolean; // הוספתי כדי להתאים לשימוש ב-App.tsx
  totalUnits: number;
  status: StudentStatus;
  createdAt: number;
};