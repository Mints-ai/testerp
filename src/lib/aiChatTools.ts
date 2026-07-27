import { adminDb } from "@/lib/firebaseAdmin";
import { canAccess } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Session type: built server-side in the /api/chat route from a verified
// Firebase ID token. Never trust a session object supplied by the model or
// by anything in the chat message itself.
// ---------------------------------------------------------------------------
export interface ChatSession {
    uid: string;
    role: string;
}

// ---------------------------------------------------------------------------
// Tool schema definitions -- sent to the LLM so it knows what it can call.
// Scope is currently just this one tool. If you add more tools back later,
// add their schema here AND their implementation below -- the model can
// only ever call what's listed in this array.
// ---------------------------------------------------------------------------
export const CHAT_TOOLS = [
    {
        type: "function",
        function: {
            name: "getEmployeeDetails",
            description:
                "Get details about an employee: employee ID, job title, department, sub-departments/departments list, email, and the project(s) they are currently working on. Defaults to the requester's own record if no name or ID is given.",
            parameters: {
                type: "object",
                properties: {
                    employeeName: {
                        type: "string",
                        description: "Full/partial name, email, or employee ID (e.g. MNTSGBL-021-2026). Omit to mean 'myself'.",
                    },
                    listAll: {
                        type: "boolean",
                        description: "Set to true if the user is asking for details of ALL employees, not one specific person.",
                    },
                },
            },
        },
    },
] as const;

// ---------------------------------------------------------------------------
// Entity resolution: turns a model-extracted label or ID into a real
// Firestore record.
// ---------------------------------------------------------------------------
function findEmployee<T extends Record<string, any>>(items: T[], search: string): T | null {
    const lower = search.toLowerCase();
    const normalized = lower.replace(/\s+/g, "");

    const fields = ["fullName", "employeeId", "email"];

    for (const field of fields) {
        const exact = items.find((i) => i[field]?.toLowerCase() === lower);
        if (exact) return exact;
    }
    for (const field of fields) {
        const partial = items.find((i) => i[field]?.toLowerCase().includes(lower));
        if (partial) return partial;
    }
    // New: normalized fallback -- handles "thelhappi" matching "Thel Happi"
    for (const field of fields) {
        const normMatch = items.find((i) => i[field]?.toLowerCase().replace(/\s+/g, "").includes(normalized));
        if (normMatch) return normMatch;
    }
    return null;
}

// Helper to extract department info consistently
function formatDepartmentInfo(data: any) {
    const deptList: string[] = Array.isArray(data.departments) && data.departments.length > 0
        ? data.departments
        : (data.department ? [data.department] : []);

    const departmentString = data.department || (deptList.length > 0 ? deptList.join(", ") : "Unassigned");

    return {
        department: departmentString,
        departments: deptList,
    };
}

// ---------------------------------------------------------------------------
// Project membership lives on the PROJECT document, not the employee
// document -- each project has a memberIds array of employee uids.
// ---------------------------------------------------------------------------
async function getCurrentProjectsForEmployee(employeeId: string) {
    const snap = await adminDb
        .collection("projects")
        .where("memberIds", "array-contains", employeeId)
        .where("status", "==", "active")
        .get();

    return snap.docs.map((d) => d.data().name).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Tool: employee details
// - No name given -> defaults to the caller's own record, always allowed.
// - A name/ID given -> looking up someone else requires VIEW_ALL_EMPLOYEES.
// ---------------------------------------------------------------------------
export async function getEmployeeDetails(session: ChatSession, employeeName?: string, listAll?: boolean) {
    if (listAll) {
        if (!canAccess(session.role, "VIEW_ALL_EMPLOYEES")) {
            return { error: "not_authorized" };
        }
        const snap = await adminDb.collection("employees").where("isActive", "==", true).get();
        return snap.docs.map((d) => ({
            employeeId: d.data().employeeId || d.id,
            fullName: d.data().fullName,
            jobTitle: d.data().jobTitle,
            department: d.data().department,
            departments: d.data().departments,
            email: d.data().email,
        }));
    }
    if (!employeeName) {
        const selfDoc = await adminDb.collection("employees").doc(session.uid).get();
        if (!selfDoc.exists) return { error: "not_found" };
        const d = selfDoc.data()!;
        const currentProjects = await getCurrentProjectsForEmployee(session.uid);
        const deptInfo = formatDepartmentInfo(d);
        return {
            employeeId: d.employeeId || session.uid,
            fullName: d.fullName,
            jobTitle: d.jobTitle,
            department: deptInfo.department,
            departments: deptInfo.departments,
            email: d.email,
            currentProjects,
        };
    }

    if (!canAccess(session.role, "VIEW_ALL_EMPLOYEES")) {
        return { error: "not_authorized" };
    }

    const snap = await adminDb
        .collection("employees")
        .where("isActive", "==", true)
        .get();

    const employees = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
    const match = findEmployee(employees, employeeName);
    if (!match) return { error: "not_found" };

    const currentProjects = await getCurrentProjectsForEmployee(match.id);
    const deptInfo = formatDepartmentInfo(match);
    return {
        employeeId: match.employeeId || match.id,
        fullName: match.fullName,
        jobTitle: match.jobTitle,
        department: deptInfo.department,
        departments: deptInfo.departments,
        email: match.email,
        currentProjects,
    };
}