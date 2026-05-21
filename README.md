# 🏢 Mints Global ERP | Premium Command Center

Welcome to the **Mints Global ERP**, a state-of-the-art enterprise resource planning system designed to centralize and automate core business operations. Built with modern web technologies, this platform offers a sleek, high-performance interface for Human Resources, Client Relationship Management (CRM), Project Management, Financial Tracking, and Automated Workflows.

![Mints Global ERP](public/brandlogo/logo.png)

---

## 🌟 Product Overview

Mints Global ERP is designed as a secure "Command Center" for the executive and operational teams. It replaces disjointed spreadsheets and isolated SaaS tools by bringing everything under one unified roof. 

### Key Capabilities:
- **Centralized Data Hub**: Synchronized data across HR, Finance, and CRM, utilizing real-time Firebase Firestore databases.
- **Role-Based Access Control (RBAC)**: Secure access gating based on hierarchy (Founders, C-Suite, Managers, Employees, Interns).
- **Discord Automations**: Real-time push notifications for logins, logouts, and leave applications directly to your corporate Discord server.
- **Global Base Architecture**: Built to scale globally without hardcoded regional constraints.

---

## 🛠 Core Modules

1. **HR Hub**: Manage the entire employee lifecycle. Onboard new hires with auto-generated secure credentials, assign multiple departments to cross-functional employees, and track intern progress.
2. **Leave Management & Team Calendar**: Employees can apply for leave while managers review and approve requests. The visual Team Calendar automatically plots absences to prevent under-staffing.
3. **CRM & Sales Pipeline**: Track leads and clients through a visual, drag-and-drop Kanban pipeline.
4. **Projects & Capacity Planning**: Create active project scopes, assign team members dynamically, and monitor team workload capacity in real-time.
5. **Finance & Invoicing**: Track revenue streams and generate dynamic PDF invoices/proposals directly from the browser.
6. **Command Palette**: A globally accessible search bar (accessed via `Ctrl+K` or `Cmd+K`) to jump instantly to any page or tool.

---

## 💻 Technical Stack

- **Frontend**: Next.js 14 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS v4, Framer Motion, shadcn/ui (Radix UI)
- **Backend/Database**: Firebase Authentication, Cloud Firestore
- **Integrations**: Discord Webhooks API, jsPDF (for document generation)

---

## 📖 User Manual: How to Use the ERP

### 1. Initial Setup & Environment Variables
Before running the application, ensure your `.env.local` file is populated with your Firebase configuration and Discord webhook url:
```env
NEXT_PUBLIC_FIREBASE_API_KEY="your-api-key"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="your-project"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="your-bucket"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
NEXT_PUBLIC_FIREBASE_APP_ID="your-app-id"
DISCORD_WEBHOOK_URL="your-discord-webhook"
```

### 2. Logging In
- Navigate to `http://localhost:3000/login`.
- You can authenticate securely via your **Google Workspace Account** or by using an auto-generated internal static email (`username@mintsglobal.ae`) and temporary password provided by HR.
- **Super Admins**: Pre-configured super admin emails will automatically be granted "Founder" level access upon first login to bypass manual permission gating.

### 3. Navigating the Command Center
- Use the left-hand sidebar to switch between modules.
- **Pro-Tip**: Press `Ctrl + K` (or `Cmd + K` on Mac) from anywhere in the application to open the **Command Palette**. Type "Leaves", "Settings", or "Finance" to instantly jump to that module.

### 4. Onboarding a New Employee (HR Hub)
1. Go to **HR Hub** and click **+ Add Employee**.
2. Enter their name. Click the "Static internal mail" button to auto-generate an internal email handle.
3. Select their Role and check multiple **Departments** if they span across operations.
4. Provide the employee with their auto-generated temporary password.
5. Click **Onboard Employee**. The system securely registers their credentials in Firebase in the background without logging you out!

### 5. Managing Leave Requests & Team Calendar
- **Employees**: Go to **Leaves**, click **Apply for Leave**, select the dates, reason, and type. A Discord notification will instantly alert management.
- **Managers**: Review the pending requests on the dashboard and click Approve/Reject.
- **Team Calendar**: Switch to the "Calendar" tab to see a visual grid of who is absent on which days to aid in capacity planning.

### 6. Managing the CRM Pipeline
1. Navigate to **CRM**.
2. Click **+ Add Lead** to create a new prospect.
3. Drag and drop the lead card across the pipeline stages ("Pitch", "Negotiation", "Won", "Lost").
4. If a deal is won, you can navigate to the **Clients** database to formalize their onboarding and generate contracts.

### 7. Tracking Projects & Team Assignment
1. Go to **Projects**.
2. Click into a specific project to view its details.
3. Use the **Manage Team** button to search for employees and assign them to the project. Their avatars will instantly appear on the project card.
4. Monitor the **Capacity Planning** tab to see how many active projects each team member is currently juggling.

### 8. Generating PDF Invoices (Finance)
1. Navigate to **Finance**.
2. In the Accounts Receivable section, you can initiate a new invoice.
3. The system automatically fetches your "Global HQ" settings and branding.
4. Click **Download PDF** to export a professional, client-ready invoice generated dynamically in the browser.

---

## 🚀 Deployment

The Mints Global ERP is optimized for immediate deployment on **Vercel**.
1. Push your code to GitHub.
2. Import the repository into Vercel.
3. Add the Environment Variables (`NEXT_PUBLIC_FIREBASE_...` and `DISCORD_WEBHOOK_URL`) into the Vercel project settings.
4. Click Deploy. 

The build step `npm run build` will automatically type-check, compile, and statically generate the optimal pages.

---
*Built securely for the Mints Global Corporate Operating Center.*
