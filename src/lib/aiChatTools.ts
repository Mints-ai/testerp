import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
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
// The model can only ever request these three actions; it never queries
// Firestore directly and never receives more capability than this.
// ---------------------------------------------------------------------------
export const CHAT_TOOLS = [
    {
        type: "function",
        function: {
            name: "getEmployeeDetails",
            description:
                "Get details about an employee: job title, department, email. Defaults to the requester's own record if no name is given.",
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
    {
        type: "function",
        function: {
            name: "getProjectDetails",
            description:
                "Get details about a project: status, service type, client, deadline, progress.",
            parameters: {
                type: "object",
                properties: {
                    projectName: {
                        type: "string",
                        description: "Name of the project to look up.",
                    },
                },
                required: ["projectName"],
            },
        },
    },




    {
        type: "function",
        function: {
            name: "getClientUpdates",
            description:
                "Get information about a client: services subscribed, health score, and recent CRM notes.",
            parameters: {
                type: "object",
                properties: {
                    clientName: {
                        type: "string",
                        description: "Company name of the client.",
                    },
                },
                required: ["clientName"],
            },
        },
    },
] as const;





// ---------------------------------------------------------------------------
// Entity resolution: turns a model-extracted label (e.g. "Acme") into a real
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
// Tool 1: employee details
// - No name given -> defaults to the caller's own record, always allowed.
// - A name given -> looking up someone else requires VIEW_ALL_EMPLOYEES,
//   checked against session.role (server-verified), never against anything
//   the model was told during the conversation.
// ---------------------------------------------------------------------------
export async function getEmployeeDetails(session: ChatSession, employeeName?: string) {
    if (!employeeName) {
        const selfDoc = await getDoc(doc(db, "employees", session.uid));
        if (!selfDoc.exists()) return { error: "not_found" };
        const d = selfDoc.data();
        return {
            fullName: d.fullName,
            jobTitle: d.jobTitle,
            department: d.department,
            email: d.email,
        };
    }

    if (!canAccess(session.role, "VIEW_ALL_EMPLOYEES")) {
        return { error: "not_authorized" };
    }

    const snap = await getDocs(
        query(collection(db, "employees"), where("isActive", "==", true))
    );
    const employees = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
    const match = fuzzyFind(employees, "fullName", employeeName);
    if (!match) return { error: "not_found" };

    return {
        fullName: match.fullName,
        jobTitle: match.jobTitle,
        department: match.department,
        email: match.email,
    };
}

// ---------------------------------------------------------------------------
// Tool 2: project details
// - Visible to anyone with VIEW_ALL_FINANCE (matches the permission your
//   existing projects/page.tsx already uses to gate "see all projects"),
//   or to anyone listed in the project's memberIds array.
// ---------------------------------------------------------------------------
export async function getProjectDetails(session: ChatSession, projectName: string) {
    const canViewAll = canAccess(session.role, "VIEW_ALL_FINANCE");

    const snap = await getDocs(collection(db, "projects"));
    const projects = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
    const match = fuzzyFind(projects, "name", projectName);

    if (!match) return { error: "not_found" };

    const isMember = match.memberIds?.includes(session.uid);
    if (!canViewAll && !isMember) {
        return { error: "not_authorized" };
    }

    return {
        name: match.name,
        status: match.status,
        serviceType: match.serviceType,
        startDate: match.startDate,
        endDate: match.endDate,
        progress: match.progress ?? null,
    };
}

// ---------------------------------------------------------------------------
// Tool 3: client updates
// - Basic info (company, services, health score) visible to any employee.
// - CRM notes are more sensitive and gated behind VIEW_DEPT_FINANCE
//   (manager and above). NOTE: there is no dedicated VIEW_CLIENTS permission
//   in permissions.ts today -- this reuses VIEW_DEPT_FINANCE as the closest
//   fit. Confirm this is the intended gate before relying on it in
//   production; add a dedicated permission if the CRM notes need finer-
//   grained control.
// ---------------------------------------------------------------------------
export async function getClientUpdates(session: ChatSession, clientName: string) {
    const snap = await getDocs(collection(db, "clients"));
    const clients = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
    const match = fuzzyFind(clients, "companyName", clientName);

    if (!match) return { error: "not_found" };

    const basicInfo = {
        companyName: match.companyName,
        servicesSubscribed: match.servicesSubscribed,
        healthScore: match.healthScore,
    };

    if (!canAccess(session.role, "VIEW_DEPT_FINANCE")) {
        return basicInfo;
    }

    return { ...basicInfo, notes: match.notes ?? null };
}