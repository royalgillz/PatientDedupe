import type { PatientRecord } from "./lib/matcher";

export interface Preset {
  id: string;
  label: string;
  note: string;
  a: PatientRecord;
  b: PatientRecord;
}

const rec = (
  first_name: string,
  last_name: string,
  dob: string,
  gender: string,
  address: string,
  city: string,
  zip: string,
): PatientRecord => ({ first_name, last_name, dob, gender, address, city, zip });

// A mix of the project's signature story and real pairs drawn from the Synthea
// population (with the kind of clerk-entry errors the duplicate injector applies).
export const PRESETS: Preset[] = [
  {
    id: "robert-bob",
    label: "Robert vs Bob",
    note: "The signature case: a nickname plus a street abbreviation.",
    a: rec("Robert", "Smith", "1984-03-12", "M", "12 Oak Street", "Boston", "02118"),
    b: rec("Bob", "Smith", "1984-03-12", "M", "12 Oak St", "Boston", "02118"),
  },
  {
    id: "marylyn-cole",
    label: "Marylyn Cole",
    note: "Synthea pair: a transposed last name and a swapped birth-date digit.",
    a: rec("Marylyn", "Cole", "1961-01-15", "F", "Murazik Ramp Apt", "Somerville", "02144"),
    b: rec("Marylny", "Cole", "1961-10-15", "F", "Murazik Ramp Apt", "Somerville", "02144"),
  },
  {
    id: "samuel-king",
    label: "Samuel King",
    note: "Synthea pair: typos in both the first and last name.",
    a: rec("Samuel", "King", "1970-04-19", "M", "Morar Rapid", "Lynn", "01940"),
    b: rec("Sameul", "iKng", "1970-04-19", "M", "Morar Rapid", "Lynn", "01940"),
  },
  {
    id: "catharine-turcotte",
    label: "Catharine Turcotte",
    note: "Synthea pair: swapped date digits, a city typo, and a one-off ZIP.",
    a: rec("Catharine", "Turcotte", "1990-08-30", "F", "Hermann Vale Unit", "Oxford", "01540"),
    b: rec("Catharine", "Turcotte", "1990-08-03", "F", "Hermann Vale Unit", "Oxfrod", "01541"),
  },
  {
    id: "different",
    label: "Different people",
    note: "A hard negative: two distinct Synthea patients born the same year.",
    a: rec("Alva", "Leannon", "1953-07-12", "M", "Hilpert Divide Apt", "Boston", "02118"),
    b: rec("Eldridge", "Stracke", "1953-01-29", "M", "Bernier Frontage Rd", "Wenham", "01984"),
  },
];

export const EMPTY: PatientRecord = rec("", "", "", "", "", "", "");
