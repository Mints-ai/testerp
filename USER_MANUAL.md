# Mints Global ERP - Custom Features User Manual

Welcome to the custom modules user manual for the **Mints Global ERP**. This guide outlines how to operate, manage, and coordinate projects and secure internal communications.

---

## 📬 Module 1: Secure Internal Mail Room
The secure internal communication suite provides end-to-end internal memo exchanges, real-time counters, document attachments, and interactive priority filtering.

### 1. Navigating the Mail Dashboard
*   Access the mail room via the **Mail** icon in the main left sidebar navigation.
*   The dashboard is divided into three responsive columns:
    1.  **Left Sidebar:** Compose action button and dynamic folder navigation.
    2.  **Middle List Pane:** Real-time searchable list of corporate internal memos.
    3.  **Right Detail Pane:** Content inspector and secure action panel.

### 2. Composing Memos with Recipient Autocomplete
To author a new secure memo:
1.  Click **Compose Mail** at the top of the mail navigation sidebar.
2.  In the **Secure Recipient** input field, start typing the name or email of any corporate employee.
3.  The live search dropdown will filter matching employees. Click on a matching result.
4.  Once selected, a verified recipient profile card will lock in. Click **Change** to select a different user.
5.  Specify the **Subject**, select a **Priority level** (Urgent, Normal, Low), and write your secure message details.
6.  Click **Send Memo** to securely deliver the message.

### 3. Attaching Vault Documents
You can securely link corporate vault folders, spreadsheets, or items to your memo during composition:
1.  In the **Secure Document Attachments** section of the composition dialog, type a descriptive **Doc Name** (e.g., *Q3 Financial Sheet*).
2.  Input the corresponding vault URL or file path.
3.  Click **Add**. The attachment tag will render inline (e.g., `📄 Q3 Financial Sheet ×`).
4.  You can attach multiple document links. Click `×` next to any tag to remove it.
5.  Sent attachments will render as premium click-to-open asset cards in the recipient's preview panel.

### 4. Smart Priority Pills & Search
*   Use the **Search Bar** in the middle list pane to find memos by subject line.
*   Directly under the search bar, click on **All**, **Urgent**, **Normal**, or **Low** pills to filter memos instantly. Urgent filters will render high-contrast rose colored alerts.

### 5. Managing Starred & Trash Memos
*   **Starring:** Click the **Star** icon on any mail list card or inside the detail header to star a memo. The folder badge updates instantly.
*   **Trash & Purges:** Click **Delete** to move a memo to the Trash folder. 
*   **Permanent Purging:** Navigate to the **Trash** folder and click **Purge Permanently** to wipe the memo from the database entirely.

---

## 📁 Module 2: Project Lifecycle & Milestones
The project details workspace features interactive progress tracking, stage management, task linking, and team member assignments.

### 1. Interactive Milestones Builder
Milestones capture key delivery phases (e.g., *Phase 1: Brand Discovery*, *Phase 2: Wireframes*).
*   **Toggling Completion:** Check/uncheck the circular radio button next to any milestone inside the **Overview** tab.
*   **Adding Milestones:** Fill out the title and select an optional target completion date in the form, then click **Add Milestone**.
*   **Deleting Milestones:** Authorized managers can delete redundant phases by clicking the delete options next to the milestone items.

### 2. Real-Time Project Health Ring
*   The circular progress ring automatically recalculates project status based on completed milestones.
*   Every checkbox toggle immediately re-animates the radial ring and calculates the new percentage to keep all stakeholders aligned in real-time.

### 3. Integrated Project Task Linker
Create sprint tasks directly connected to the project:
1.  Navigate to the **Tasks** tab inside the project detail dashboard.
2.  Add task titles, set priority rankings, and submit to attach them automatically to the active project ID.
3.  Tasks will sync instantly with the global kanban board.

### 4. Global Stage Dropdown & Roles Gating
*   Managers can transition projects through their lifecycles by changing the status dropdown selector (e.g., **Pitch**, **Active**, **On Hold**, **Completed**, **Cancelled**).
*   **Roles Gating:**
    *   **All Assigned Members:** Can view the overview, milestones, linked tasks, and files.
    *   **Founders & Admins:** Have exclusive rights to add/remove members, update global project stages, add/remove milestones, and permanently delete projects.

---

## 🛡️ Administrative Telemetry Feed
For organizational safety, all actions taken inside secure memos are securely logged in the Founders live telemetry feed:
*   `SEND_SECURE_MAIL` logs the date, sender, recipient, and subject of sent internal memos.
*   `PURGE_SECURE_MAIL` logs audit events when items are permanently deleted from Trash bins.
