import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Convert a 10-digit Indian phone + PIN into the email/password the auth
// service expects. Internal only — never exposed to the user.
export function phoneToEmail(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `bap-${digits}@bharatautoparts.app`;
}
