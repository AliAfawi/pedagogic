import type { Student } from "./types";

export const mockStudents: Student[] = [
  {
    id: "mock-1",
    studentId: "ID200000",
    name: "אחמד",
    grade: "יב",
    classNum: "1",
    englishUnits: 5,
    mathUnits: 5,
    specialization1: "מדעי המחשב",
    specialization2: "פיזיקה",
    socialUnits: 2,

    csUnits: 5,
    dataUnits: 0,
    physicsUnits: 5,
    chemistryUnits: 0,

    techEligible: true,
    eliteTech: true,
    scienceElite: true,
    totalUnits: 5 + 5 + 5 + 0 + 5 + 0 + 2,
    status: "זכאי",
    createdAt: Date.now(),
  },
];
