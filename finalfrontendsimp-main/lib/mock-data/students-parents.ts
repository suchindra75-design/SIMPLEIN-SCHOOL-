import { Parent, Student } from "../types";
import { initialSections } from "./classes";

const firstNamesMale = [
  "Lucas", "Oliver", "Liam", "Noah", "Ethan", "Leo", "Alexander", "Daniel",
  "James", "Benjamin", "Henry", "Sebastian", "Jack", "Julian", "Aiden", "Samuel",
  "Gabriel", "Mateo", "Theodore", "Owen", "Arthur", "Felix", "Mason", "Zachary"
];

const firstNamesFemale = [
  "Sophia", "Emma", "Olivia", "Ava", "Isabella", "Mia", "Amelia", "Harper",
  "Evelyn", "Abigail", "Emily", "Charlotte", "Maya", "Hannah", "Chloe", "Grace",
  "Zoe", "Nora", "Lily", "Eleanor", "Stella", "Isla", "Elena", "Aria"
];

const lastNames = [
  "Miller", "Anderson", "Chen", "Patel", "Taylor", "Smith", "Johnson", "Williams",
  "Brown", "Garcia", "Martinez", "Davis", "Rodriguez", "Wilson", "Campbell",
  "Stewart", "Wong", "Kowalski", "O'Connor", "Dubois", "Fischer", "Gupta", "Kim", "Tanaka"
];

export function generateStudentsAndParents(): { students: Student[]; parents: Parent[] } {
  const parents: Parent[] = [];
  const students: Student[] = [];

  // Anchor demo parent: David Miller (par-01)
  const demoParent: Parent = {
    id: "par-01",
    name: "David Miller",
    email: "david.miller@example.com",
    phone: "+1 (555) 789-0123",
    relationship: "Father",
    childrenStudentIds: ["stu-sec-5a-01", "stu-sec-2b-01"],
  };
  parents.push(demoParent);

  // Lucas Miller in Grade 5-A (Roll 01)
  students.push({
    id: "stu-sec-5a-01",
    rollNumber: "5A-01",
    firstName: "Lucas",
    lastName: "Miller",
    fullName: "Lucas Miller",
    gender: "Male",
    dob: "2015-05-14",
    sectionId: "sec-5a",
    className: "Grade 5",
    sectionName: "Section A",
    parentId: "par-01",
    parentName: "David Miller",
    parentPhone: "+1 (555) 789-0123",
    status: "Active",
    enrollmentDate: "2021-09-01",
  });

  // Sophia Miller in Grade 2-B (Roll 01)
  students.push({
    id: "stu-sec-2b-01",
    rollNumber: "2B-01",
    firstName: "Sophia",
    lastName: "Miller",
    fullName: "Sophia Miller",
    gender: "Female",
    dob: "2018-09-22",
    sectionId: "sec-2b",
    className: "Grade 2",
    sectionName: "Section B",
    parentId: "par-01",
    parentName: "David Miller",
    parentPhone: "+1 (555) 789-0123",
    status: "Active",
    enrollmentDate: "2024-09-01",
  });

  let parentCounter = 2;

  // Now populate each section to have 10-11 students
  for (const section of initialSections) {
    const existingCount = students.filter((s) => s.sectionId === section.id).length;
    const targetCount = 11; // 14 sections * ~11 = ~152 students total
    
    for (let i = existingCount + 1; i <= targetCount; i++) {
      const rollNum = `${section.className.replace("Grade ", "")}${section.name}-${i < 10 ? "0" + i : i}`;
      const isMale = (i + section.name.charCodeAt(0)) % 2 === 0;
      const fName = isMale
        ? firstNamesMale[(i * 3 + section.name.charCodeAt(0)) % firstNamesMale.length]
        : firstNamesFemale[(i * 5 + section.name.charCodeAt(0)) % firstNamesFemale.length];
      const lName = lastNames[(i * 7 + section.classId.length + section.name.charCodeAt(0)) % lastNames.length];
      const fullName = `${fName} ${lName}`;
      const studentId = `stu-${section.id}-${i < 10 ? "0" + i : i}`;

      // Distribute some multi-child parents
      let parent: Parent;
      if (i === 2 && parentCounter > 3 && parentCounter % 3 === 0) {
        // Link to an earlier parent
        parent = parents[parentCounter - 2];
        parent.childrenStudentIds.push(studentId);
      } else {
        const parId = `par-${parentCounter < 10 ? "0" + parentCounter : parentCounter}`;
        parent = {
          id: parId,
          name: `${isMale ? "Mr." : "Mrs."} ${fName}'s Guardian (${lName})`,
          email: `${lName.toLowerCase()}.${parentCounter}@example.com`,
          phone: `+1 (555) 600-${1000 + parentCounter}`,
          relationship: isMale ? "Father" : "Mother",
          childrenStudentIds: [studentId],
        };
        parents.push(parent);
        parentCounter++;
      }

      // Birth year calculated according to grade (Grade 1 -> 2019, Grade 8 -> 2012)
      const gradeNum = parseInt(section.className.replace("Grade ", ""), 10) || 1;
      const birthYear = 2020 - gradeNum;
      const month = ((i * 2) % 12) + 1;
      const day = ((i * 3) % 27) + 1;
      const dob = `${birthYear}-${month < 10 ? "0" + month : month}-${day < 10 ? "0" + day : day}`;

      students.push({
        id: studentId,
        rollNumber: rollNum,
        firstName: fName,
        lastName: lName,
        fullName,
        gender: isMale ? "Male" : "Female",
        dob,
        sectionId: section.id,
        className: section.className,
        sectionName: `Section ${section.name}`,
        parentId: parent.id,
        parentName: parent.name,
        parentPhone: parent.phone,
        status: "Active",
        enrollmentDate: "2023-09-01",
      });
    }
  }

  return { students, parents };
}

const generated = generateStudentsAndParents();
export const initialStudents = generated.students;
export const initialParents = generated.parents;
