import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Default user ID for local/guest users in open-sourced version
export const DEFAULT_LOCAL_USER_ID = 'local-user-guest';
