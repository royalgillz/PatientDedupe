import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Standard class-name combiner: merge conditional classes and resolve Tailwind
// conflicts (the last utility wins).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
