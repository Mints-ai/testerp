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
                },
            },
        },
    },
] as const;

// ---------------------------------------------------------------------------
// Entity resolution: turns a model-extracted label or ID into a real
// Firestore record.
// ---------------------------------------------------------------------------
function findEmployee(items: any[], search: string): any | null {
    const cleanSearch = search.toLowerCase().replace(/\s+/g, ' ').trim();
    return (
        items.find((i) => {
            const name = i.fullName?.toLowerCase().replace(/\s+/g, ' ');
            const empId = i.employeeId?.toLowerCase();
            const email = i.email?.toLowerCase();
            return name === cleanSearch || empId === cleanSearch || email === cleanSearch;
        }) ||
        items.find((i) => {
            const name = i.fullName?.toLowerCase().replace(/\s+/g, ' ');
            const empId = i.employeeId?.toLowerCase();
            const email = i.email?.toLowerCase();
            return (name && name.includes(cleanSearch)) || (empId && empId.includes(cleanSearch)) || (email && email.includes(cleanSearch));
        }) ||
        null
    );
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
export async function getEmployeeDetails(session: ChatSession, employeeName?: string) {
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