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
                "Get details about an employee: job title, department, email, and the project(s) they are currently working on. Defaults to the requester's own record if no name is given.",
            parameters: {
                type: "object",
                properties: {
                    employeeName: {
                        type: "string",
                        description: "Full or partial name of the employee. Omit to mean 'myself'.",
                    },
                },
            },
        },
    },
] as const;

// ---------------------------------------------------------------------------
// Entity resolution: turns a model-extracted label (e.g. "Sanal") into a real
// Firestore record. This string is untrusted input -- it is used only to
// decide *what* to look up, never *who is asking* or *what is allowed*.
// ---------------------------------------------------------------------------
function fuzzyFind<T extends Record<string, any>>(
    items: T[],
    field: string,
    search: string
): T | null {
    const lower = search.toLowerCase();
    return (
        items.find((i) => i[field]?.toLowerCase() === lower) ||
        items.find((i) => i[field]?.toLowerCase().includes(lower)) ||
        null
    );
}

// ---------------------------------------------------------------------------
// Project membership lives on the PROJECT document, not the employee
// document -- each project has a memberIds array of employee uids.
// So "what is this employee currently working on" means: search the
// projects collection for any project whose memberIds array contains this
// employee's uid, and whose status is "active" (confirm this string matches
// your actual `projects` collection's status values).
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
// - A name given -> looking up someone else requires VIEW_ALL_EMPLOYEES,
//   checked against session.role (server-verified), never against anything
//   the model was told during the conversation.
// ---------------------------------------------------------------------------
export async function getEmployeeDetails(session: ChatSession, employeeName?: string) {
    if (!employeeName) {
        const selfDoc = await adminDb.collection("employees").doc(session.uid).get();
        if (!selfDoc.exists) return { error: "not_found" };
        const d = selfDoc.data()!;
        const currentProjects = await getCurrentProjectsForEmployee(session.uid);
        return {
            fullName: d.fullName,
            jobTitle: d.jobTitle,
            department: d.department,
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
    const match = fuzzyFind(employees, "fullName", employeeName);
    if (!match) return { error: "not_found" };

    const currentProjects = await getCurrentProjectsForEmployee(match.id);
    return {
        fullName: match.fullName,
        jobTitle: match.jobTitle,
        department: match.department,
        email: match.email,
        currentProjects,
    };
}