import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Shared constants for server configuration
export const DOMAIN = 'elements.hypernote.dev';
export const PORT = 31234;
