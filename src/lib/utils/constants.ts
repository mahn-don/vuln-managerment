// Application-wide constants

export const APP_NAME = "SecPlatform";
export const APP_DESCRIPTION = "Security Asset Inventory & Vulnerability Management Platform";

// Sequence key prefixes
export const KEY_PREFIX = {
  ASSESSMENT: "ASM",
  VULNERABILITY: "VUL",
  APPLICATION: "APP",
} as const;

// Default pagination
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

// SLA defaults
export const SLA_WARNING_DAYS = 3;

// File upload
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const ALLOWED_IMPORT_EXTENSIONS = [".xlsx"] as const;
