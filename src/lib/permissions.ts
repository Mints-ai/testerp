export const ROLES = {
  FOUNDER: "founder",
  SYSTEM_ADMIN: "system_admin",
  C_SUITE: "c_suite",
  MANAGER: "manager",
  SENIOR_EMPLOYEE: "senior_employee",
  EMPLOYEE: "employee",
  INTERN: "intern",
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

export const PERMISSIONS = {
  VIEW_ALL_EMPLOYEES:   ["founder", "system_admin", "c_suite", "manager"],
  MANAGE_USERS:         ["founder", "system_admin", "c_suite"],
  VIEW_ALL_FINANCE:     ["founder", "system_admin", "c_suite"],
  VIEW_DEPT_FINANCE:    ["founder", "system_admin", "c_suite", "manager"],
  MANAGE_FINANCE:       ["founder", "system_admin", "c_suite", "manager"],
  CREATE_INVOICE:       ["founder", "system_admin", "c_suite", "manager"],
  SUBMIT_EXPENSE:       ["founder", "system_admin", "c_suite", "manager", "senior_employee", "employee"],
  APPROVE_EXPENSE:      ["founder", "system_admin", "c_suite", "manager"],
  CREATE_PROJECT:       ["founder", "system_admin", "c_suite", "manager", "senior_employee"],
  APPROVE_LEAVE:        ["founder", "system_admin", "c_suite", "manager"],
  EDIT_LEAVE:           ["founder", "system_admin", "c_suite", "manager"],
  POST_ANNOUNCEMENT:    ["founder", "system_admin", "c_suite", "manager"],
  VIEW_REPORTS:         ["founder", "system_admin", "c_suite", "manager"],
  SYSTEM_SETTINGS:      ["founder", "system_admin", "c_suite"],
  VIEW_AUDIT_LOG:       ["founder", "system_admin"],
  DELETE_DATA:          ["founder", "system_admin", "c_suite"],
} as const;

export function canAccess(role: string | null | undefined, permission: keyof typeof PERMISSIONS): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}

// Role display names and badge colors
export const ROLE_META: Record<string, { label: string; color: string }> = {
  founder:         { label: "Founder",         color: "bg-blue-500/10 text-blue-300 border border-blue-500/20" },
  system_admin:    { label: "System Admin",    color: "bg-red-500/10 text-red-300 border border-red-500/20" },
  c_suite:         { label: "C-Suite",          color: "bg-purple-500/10 text-purple-300 border border-purple-500/20" },
  manager:         { label: "Manager",          color: "bg-indigo-500/10 text-indigo-300 border border-indigo-500/20" },
  senior_employee: { label: "Senior Employee",  color: "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20" },
  employee:        { label: "Employee",         color: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20" },
  intern:          { label: "Intern",           color: "bg-slate-500/10 text-slate-300 border border-slate-500/20" },
};
