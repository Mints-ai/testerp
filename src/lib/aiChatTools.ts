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
    {
        type: "function",
        function: {
            name: "getProjectDetails",
            description:
                "Get complete details about a project: name, description, status, service type, client, start/end dates, budget, milestones, and team members. Defaults to the requester's own project(s) if no project name or employee name is given.",
            parameters: {
                type: "object",
                properties: {
                    projectName: {
                        type: "string",
                        description: "Full/partial project name. Omit to mean 'the project(s) I'm on'.",
                    },
                    employeeName: {
                        type: "string",
                        description:
                            "Full/partial name, email, or employee ID of the person whose projects you want (e.g. 'Alex's projects', 'what is Alex working on'). Omit to mean the requester themselves.",
                    },
                    listAll: {
                        type: "boolean",
                        description: "Set to true if the user is asking for a list of ALL projects, not one specific project or person.",
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
function findEmployee<T extends Record<string, unknown>>(items: T[], search: string): T | null {
    const lower = search.toLowerCase();
    const normalized = lower.replace(/\s+/g, "");

    const fields = ["fullName", "employeeId", "email"];

    for (const field of fields) {
        const exact = items.find((i) => {
            const v = i[field] as unknown;
            return typeof v === 'string' && v.toLowerCase() === lower;
        });
        if (exact) return exact;
    }
    for (const field of fields) {
        const partial = items.find((i) => {
            const v = i[field] as unknown;
            return typeof v === 'string' && v.toLowerCase().includes(lower);
        });
        if (partial) return partial;
    }
    // New: normalized fallback -- handles "thelhappi" matching "Thel Happi"
    for (const field of fields) {
        const normMatch = items.find((i) => {
            const v = i[field] as unknown;
            return typeof v === 'string' && v.toLowerCase().replace(/\s+/g, "").includes(normalized);
        });
        if (normMatch) return normMatch;
    }
    return null;
}

function findProject<T extends Record<string, unknown>>(items: T[], search: string): T | null {
    const lower = search.toLowerCase();
    const normalized = lower.replace(/\s+/g, "");

    const exact = items.find((i) => {
        const v = i['name'] as unknown;
        return typeof v === 'string' && v.toLowerCase() === lower;
    });
    if (exact) return exact;

    const partial = items.find((i) => {
        const v = i['name'] as unknown;
        return typeof v === 'string' && v.toLowerCase().includes(lower);
    });
    if (partial) return partial;

    const normMatch = items.find((i) => {
        const v = i['name'] as unknown;
        return typeof v === 'string' && v.toLowerCase().replace(/\s+/g, "").includes(normalized);
    });
    if (normMatch) return normMatch;

    return null;
}

// Helper to extract department info consistently
function formatDepartmentInfo(data: Record<string, unknown> | { department?: string; departments?: string[] }) {
    const raw = data as Record<string, unknown>;
    const departmentsRaw = raw['departments'];
    let deptList: string[] = [];
    if (Array.isArray(departmentsRaw) && departmentsRaw.length > 0) {
        deptList = departmentsRaw.map(d => String(d));
    } else if (raw['department']) {
        deptList = [String(raw['department'])];
    }

    const departmentString = raw['department'] ? String(raw['department']) : (deptList.length > 0 ? deptList.join(", ") : "Unassigned");

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

    const employees = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as Record<string, unknown>[];
    const match = findEmployee(employees, employeeName);
    if (!match) return { error: "not_found" };
    const matchId = (match as Record<string, unknown>).id as string;
    const currentProjects = await getCurrentProjectsForEmployee(matchId);
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

interface ProjectDoc {
    id?: string;
    memberIds?: string[];
    clientId?: string;
    milestones?: unknown[];
    name?: string;
    startDate?: string;
    endDate?: string;
    description?: string;
    status?: string;
    serviceType?: string;
    budget?: number;
}

async function buildFullProjectDetails(project: ProjectDoc, role: string) {
    const memberIds: string[] = Array.isArray(project.memberIds) ? (project.memberIds as string[]) : [];

    let team: { fullName: string; jobTitle: string }[] = [];
    if (memberIds.length > 0) {
        const empSnap = await adminDb.collection("employees").get();
        const empMap = new Map(empSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));
        team = memberIds
            .map((id) => empMap.get(id))
            .filter(Boolean)
            .map((e) => ({ fullName: (e as Record<string, unknown>).fullName as string, jobTitle: (e as Record<string, unknown>).jobTitle as string }));
    }

    let clientName: string | null = null;
    if (project.clientId) {
        const clientDoc = await adminDb.collection("clients").doc(project.clientId).get();
        if (clientDoc.exists) clientName = clientDoc.data()!.companyName || null;
    }

    const milestones = Array.isArray(project.milestones) ? (project.milestones as unknown[]) : [];
    const progress = milestones.length > 0
        ? Math.round((milestones.filter((m) => ((m as Record<string, unknown>).completed as boolean)).length / milestones.length) * 100)
        : 0;

    const baseDetails = {
        projectId: project.id,
        name: project.name,
        startDate: project.startDate || null,
        endDate: project.endDate || null,
        progress,
        milestones: milestones.map((m) => ({
            title: (m as Record<string, unknown>).title as string | undefined,
            dueDate: (m as Record<string, unknown>).dueDate as string | undefined || null,
            completed: !!((m as Record<string, unknown>).completed),
        })),
    };

    // founder, system_admin, c_suite, manager -> full details (description, status, client, team)
    if (canAccess(role, "VIEW_ALL_PROJECTS")) {
        return {
            ...baseDetails,
            description: project.description || null,
            status: project.status,
            serviceType: project.serviceType || null,
            client: clientName,
            team,
            // Budget stays restricted to founder/system_admin/c_suite -- managers don't get it,
            // matching VIEW_ALL_FINANCE elsewhere in the app (e.g. the "new project" budget field).
            ...(canAccess(role, "VIEW_ALL_FINANCE") ? { budget: project.budget ?? null } : {}),
        };
    }

    // senior_employee, employee, intern (must still be a member -- gated in getProjectDetails)
    // -> progress, dates, milestones only. No budget, client, or team roster.
    return baseDetails;
}


// ---------------------------------------------------------------------------
// Tool: project details
// - Full access (VIEW_ALL_PROJECTS role) -> can view/list any project.
// - Everyone else -> can ONLY view projects where their uid is in memberIds.
//   Asking about a project they're not assigned to returns not_authorized,
//   even if they know the project's name.
// ---------------------------------------------------------------------------
export async function getProjectDetails(
    session: ChatSession,
    projectName?: string,
    listAll?: boolean,
    employeeName?: string
) {
    const hasFullAccess = canAccess(session.role, "VIEW_ALL_PROJECTS");

    if (listAll) {
        if (!hasFullAccess) return { error: "not_authorized" };
        const snap = await adminDb.collection("projects").get();
        return Promise.all(snap.docs.map((d) => buildFullProjectDetails({ id: d.id, ...(d.data() as Record<string, unknown>) } as ProjectDoc, session.role)));
    }

    // NEW: "Alex's projects" -- resolve the named employee to a uid, then
    // list the projects THEY belong to (not the caller's).
    if (employeeName) {
        if (!hasFullAccess) return { error: "not_authorized" };

        const empSnap = await adminDb.collection("employees").where("isActive", "==", true).get();
        const employees = empSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as Record<string, unknown>[];
        const match = findEmployee(employees, employeeName);
        if (!match) return { error: "not_found" };

        const snap = await adminDb
            .collection("projects")
            .where("memberIds", "array-contains", match.id)
            .get();
        if (snap.empty) return { error: "not_found" };

        return Promise.all(snap.docs.map((d) => buildFullProjectDetails({ id: d.id, ...(d.data() as Record<string, unknown>) } as ProjectDoc, session.role)));
    }

    if (!projectName) {
        // "my project(s)" -- always the CALLER's own projects, regardless of role.
        const snap = await adminDb
            .collection("projects")
            .where("memberIds", "array-contains", session.uid)
            .get();
        if (snap.empty) return { error: "not_found" };
        return Promise.all(snap.docs.map((d) => buildFullProjectDetails({ id: d.id, ...(d.data() as Record<string, unknown>) } as ProjectDoc, session.role)));
    }

    // A specific project was named -- resolve it, then gate access.
    const allSnap = await adminDb.collection("projects").get();
    const projects = allSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as ProjectDoc[];
    const match = findProject(projects as unknown as Record<string, unknown>[], projectName);
    if (!match) return { error: "not_found" };

    const isMember = Array.isArray(match.memberIds) && match.memberIds.includes(session.uid);
    if (!hasFullAccess && !isMember) {
        return { error: "not_authorized" };
    }

    return buildFullProjectDetails(match, session.role);
}