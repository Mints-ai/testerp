# Mints Global ERP - Enterprise Master User Manual

Welcome to the official **Master User Manual** for the **Mints Global ERP**. This comprehensive reference guide provides end-to-end operational instructions for all fifteen integrated modules within our premium enterprise command center.

---

## 🛠️ Global Role-Based Permissions Matrix

The ERP features dynamic, automated role enforcement to maintain absolute operational safety across all functional areas:

| Module / Feature | Employee (Standard) | Manager | Admin | Founder (Owner) |
| :--- | :---: | :---: | :---: | :---: |
| **Secure Mail Room** | View / Send / Star | View / Send / Star | View / Send / Star | View / Send / Star |
| **Audit Activity Logs**| Read Own | Read Own | Read All / Track | Read All / Track |
| **CRM Leads** | View / Update Deal | Add Leads / Delete | Add Leads / Delete | Add Leads / Delete |
| **Project Lifecycles** | View / Add Tasks | Add Milestones / Edit | Add Milestones / Edit | Full Access / Delete |
| **Finance Treasury** | View Budgets | Add Transactions | Full Access / Invoice | Full Access / Invoice |
| **HR Directory** | View Contacts | View Directory | Edit Profile / Roles | Edit Profile / Roles |
| **Leaves & Time Off** | Submit Requests | Approve Department | Approve Global | Approve Global |
| **Attendance Punch** | Check In & Out | View Reports | Edit Logs | Edit Logs |
| **System Settings** | View Settings | Read Settings | Change Currency | Change Currency |

---

## 📬 Module 1: Secure Internal Mail Room

The secure internal communication suite provides end-to-end internal memo exchanges, real-time counters, document attachments, and interactive priority filtering.

### 1. Navigating the Mail Dashboard

* Access the mail room via the **Mail** icon in the main left sidebar navigation.
* The dashboard is divided into three responsive columns:
    1. **Left Sidebar:** Compose action button and dynamic folder navigation.
    2. **Middle List Pane:** Real-time searchable list of corporate internal memos.
    3. **Right Detail Pane:** Content inspector and secure action panel.

### 2. Composing Memos with Recipient Autocomplete

To author a new secure memo:

1. Click **Compose Mail** at the top of the mail navigation sidebar.
2. In the **Secure Recipient** input field, start typing the name or email of any corporate employee.
3. The live search dropdown will filter matching employees. Click on a matching result.
4. Once selected, a verified recipient profile card will lock in. Click **Change** to select a different user.
5. Specify the **Subject**, select a **Priority level** (Urgent, Normal, Low), and write your secure message details.
6. Click **Send Memo** to securely deliver the message.

### 3. Attaching Vault Documents

You can securely link corporate vault folders, spreadsheets, or items to your memo during composition:

1. In the **Secure Document Attachments** section of the composition dialog, type a descriptive **Doc Name** (e.g., *Q3 Financial Sheet*).
2. Input the corresponding vault URL or file path.
3. Click **Add**. The attachment tag will render inline (e.g., `📄 Q3 Financial Sheet ×`).
4. You can attach multiple document links. Click `×` next to any tag to remove it.
5. Sent attachments will render as premium click-to-open asset cards in the recipient's preview panel.

### 4. Smart Priority Pills & Search

* Use the **Search Bar** in the middle list pane to find memos by subject line.
* Directly under the search bar, click on **All**, **Urgent**, **Normal**, or **Low** pills to filter memos instantly. Urgent filters will render high-contrast rose colored alerts.

### 5. Managing Starred & Trash Memos

* **Starring:** Click the **Star** icon on any mail list card or inside the detail header to star a memo. The folder badge updates instantly.
* **Trash & Purges:** Click **Delete** to move a memo to the Trash folder.
* **Permanent Purging:** Navigate to the **Trash** folder and click **Purge Permanently** to wipe the memo from the database entirely.

---

## 📁 Module 2: Project Lifecycle, Gantt Charts & Timesheets

The project details and capacity workspace features interactive progress tracking, Gantt timelines, resource workloads, and dynamic weekly timesheet logging.

### 1. Interactive Gantt Timeline
* Track key delivery phases and milestones dynamically on a timeline visualizer.
* Renders calculated horizontal offset bars based on project start and end dates relative to the active timeline bounds, showing inline progress ratios dynamically.

### 2. Resource Capacity Heatmap
* Access the **Resource Capacity Heatmap** via `/dashboard/projects/capacity`.
* Compares assigned task loads and active estimated hours against a standard weekly limit of **40 hours** to visually flag over-allocated employees (Red for >85% Overbooked, Green for Healthy, Indigo for Available bandwidth).

### 3. Unified Weekly Timesheet Matrix Spreadsheet
* Click the **Timesheet Matrix** tab to log weekly operational hours across clients and projects:
  1. Select the relevant employee contact and target active week.
  2. Click **+ Add Project Row** to add client projects to the matrix.
  3. Enter hours worked across daily columns (Monday through Sunday). Row and daily column totals will calculate dynamically as you type.
  4. Click **Submit Weekly Timesheet** to safely commit hours to the Firestore database for executive approval.

### 4. Visual Verification (Timesheet Matrix)
![Weekly Timesheet Grid Matrix](public/timesheet_matrix.png)

### 5. Interactive Milestones Builder
* **Toggling Completion:** Check/uncheck the circular radio button next to any milestone inside the **Overview** tab.
* **Adding Milestones:** Fill out the title and select an optional target completion date in the form, then click **Add Milestone**.
* **Deleting Milestones:** Authorized managers can delete redundant phases by clicking the delete options next to the milestone items.

### 6. Real-Time Project Health Ring
* The circular progress ring automatically recalculates project status based on completed milestones.
* Every checkbox toggle immediately re-animates the radial ring and calculates the new percentage to keep all stakeholders aligned in real-time.

### 7. Integrated Project Task Linker
Create sprint tasks directly connected to the project:
1. Navigate to the **Tasks** tab inside the project detail dashboard.
2. Add task titles, set priority rankings, and submit to attach them automatically to the active project ID.
3. Tasks will sync instantly with the global kanban board.

### 8. Global Stage Dropdown & Roles Gating

* Managers can transition projects through their lifecycles by changing the status dropdown selector (e.g., **Pitch**, **Active**, **On Hold**, **Completed**, **Cancelled**).
* **Roles Gating:**
  * **All Assigned Members:** Can view the overview, milestones, linked tasks, and files.
  * **Founders & Admins:** Have exclusive rights to add/remove members, update global project stages, add/remove milestones, and permanently delete projects.

---

## 💬 Module 3: Corporate Chat & Collaborations

The corporate chat system provides continuous, real-time messaging, split into three specific categories:

1. **P2P Direct Messaging:** Click on any employee name in the side panel to start a secure 1-on-1 text conversation.
2. **Custom Group Channels:** Create multi-member threads for custom projects or cross-functional groups by clicking **New Group**.
3. **Department Channels:** Built-in dedicated rooms for departments (e.g., `#engineering`, `#marketing`, `#hr`, `#sales`) automatically mapping employees based on their system directory profiles.

---

## 📊 Module 4: CRM Leads Kanban Board

The CRM (Customer Relationship Management) pipeline manages customer acquisitions:

* **Lead Columns:** Track opportunities through stages: *New*, *Contacted*, *Proposal Sent*, *Negotiation*, *Closed Won*, *Closed Lost*.
* **Lead Cards:** Details include client name, deal value ($), priority level, and assigned sales lead.
* **Drag & Drop:** Move deal cards across columns to update pipeline statistics instantly.
* **Pipeline Metrics:** Visual aggregates at the top display total pipeline value, average deal size, and sales conversion rates.

---

## 💼 Module 5: Clients & CRM Profiles

Maintain structural business directories for active clients:

* **Client Profiles:** Record primary corporate contacts, emails, phone directories, contract values, and historical engagement details.
* **Active Project Linking:** Bind active software/consulting projects to client records to track billing cycles and milestones directly.

---

## 📈 Module 6: Tasks & Sprint Kanban Board

A centralized task manager driving corporate sprints:

* **Kanban Workflow:** Manage items through *Backlog*, *To Do*, *In Progress*, and *Done* cards.
* **Interactive Modals:** Click on any card to update descriptions, assignees, priorities, or toggle blockers.
* **Filtering:** Instantly sort task workloads by project, assignee, or priority index.

---

## 💸 Module 7: Finance & Corporate Treasury

Manages invoices, track operating budgets, and monitor cash reserves:

* **Financial Dashboard:** Visually track revenue, overhead costs, and monthly margins with dynamic charts.
* **Invoice Generator:** Create new professional invoices specifying clients, line items, VAT rates, and payment due dates. Exporters enable printing or PDF compilation with a single click.
* **Operating Ledger:** Log company incomes and operational expenses directly into Firestore.

---

## 👥 Module 8: HR Directory & Employee DB

The employee database holds active records:

* **Employee Cards:** View names, job titles, department assignments, contact numbers, and corporate emails.
* **Role Modifications:** Admins and Founders can promote/demote user clearance levels, edit profile data, and update department rosters.

---

## 📅 Module 9: Leaves & Time Off Planner

Automates paid time off (PTO) and sick leave management:

* **Leave Requests:** Employees submit requests stating date ranges, leave type (PTO, Sick, Personal), and reasons.
* **Approval Console:** Managers receive live notifications and can **Approve** or **Reject** leaves with automated reason cards.
* **Leave Calendars:** Displays system-wide calendars of scheduled absences to plan team capacities.

---

## ⏱️ Module 10: Attendance & Location Timecard

The attendance module logs work hours:

* **Punch In / Out:** Log daily clock-in/clock-out events.
* **Geolocation Telemetry:** Logs IP geolocation data during punch actions to assure absolute security compliance.
* **Time Logs:** View a grid of clock hours, overtime periods, and punctuality logs.

---

## 📢 Module 11: Announcements Hub

The announcements board broadcasts information:

* **Broadcasts:** Send company-wide announcements instantly to the home dashboard.
* **Importance Levels:** Mark news as *Urgent*, *Normal*, or *Update* to apply high-visibility banner warnings.

---

## 📁 Module 12: File Vault & Cloud Storage

The secure corporate repository featuring subdirectory structures, dynamic tags, global search, and granular access control:

* **Subdirectory Navigation:** Traverse folders dynamically using interactive breadcrumb trails.
* **Granular Access (RBAC Folder Lock):** Restricted folders like `founding-directors-only` are dynamically locked behind Founder/C-Suite permissions. Accessing them redirects standard employees or interns to a secure glass padlock warning window.
* **Intern Read-Only Restriction:** Intern accounts are blocked from file deletions or modifications, enforcing strict read-only parameters.
* **Client Handover Publication:** Upload assets directly into Client Handover Vault folders to automatically sync files with the Client Portal invoice and assets screen.

![Secure Folder explorer interface](public/cloud_drive.png)

---

## 📊 Module 13: Reports & Intelligence Analytics

Interactive corporate dashboards tracking ERP KPIs:

* **Task Performance:** Charts tracking task completion velocities and team cycle rates.
* **CRM Performance:** Leads conversion analysis, pipeline velocities, and agent performance maps.
* **Treasury Performance:** Monthly revenue margins, net cash flow charts, and cash reserve runway tracking.

---

## ⚙️ Module 14: System Settings

Configure international settings:

* **Currency Switcher:** Toggle the workspace currency between **USD**, **EUR**, **GBP**, **AED**, **INR**, etc. All invoicing and project budgeting tables will adjust automatically.
* **Branding Preferences:** Configure dashboard logos, metadata, and company information templates.

---

## 🛡️ Module 15: Admin Live Telemetry & Integrations

Founder dashboard tracking company security events, real-time active users, and external telemetry tools:

* **Real-time Live Presence Map:** Visible inside the core Command Center, tracks every user's last Firestore activity heartbeat to display:
  - **Online (Active now):** Heartbeat recorded within the last 5 minutes.
  - **Idle:** Heartbeat recorded within the last 15 minutes.
  - **Offline:** Renders last active relative dates and gray indicators.
* **Dynamic Discord Telemetry Router:** In settings, select your Webhook URL destination and configure active event toggles (Authentication, Financial, HR/Leaves) to filter Discord notifications.
* **Auditor CSV Exporter:** Exporters compile and download the full compliance spreadsheet audit logs instantly in CSV format with a single click.

![Live Presence Map Home](public/live_presence_map.png)
![Discord integrations panel](public/discord_settings.png)
