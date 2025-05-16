import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Shared constants for server configuration
export const DOMAIN = 'hypernote.dev';
export const SUBDOMAIN = 'elements';
export const FULL_DOMAIN = `${SUBDOMAIN}.${DOMAIN}`;
export const PORT = 31234;
