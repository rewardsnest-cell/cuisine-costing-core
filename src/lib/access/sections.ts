export const SECTION_KEYS = [
  "quotes",
  "hosting_events",
  "assigned_events",
  "receipts",
  "profile",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  quotes: "Recent Quotes",
  hosting_events: "My Upcoming Events (Hosting)",
  assigned_events: "Assigned Events (Staff)",
  receipts: "Scan Receipts",
  profile: "Profile & Account",
};

export const ROLE_KEYS = ["user", "employee", "social_media", "sales", "admin"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_LABELS: Record<RoleKey, string> = {
  user: "User",
  employee: "Employee",
  social_media: "Social Media",
  sales: "Sales",
  admin: "Admin",
};
