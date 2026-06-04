# Mints Global ERP: Intern Contribution & Role Guide

Welcome to the **Mints Global ERP** engineering and design team. As we prepare to market and scale this product commercially, your contributions will directly influence its security, usability, reliability, and intelligence.

This document outlines the scope of work, technical permissions, and action items for each of the four key intern tracks:
1. **Cybersecurity Engineer**
2. **UI/UX Developer**
3. **Software Developer**
4. **AI Engineer**

---

## 💻 Tech Stack & Product Overview

Mints Global ERP is a premium, real-time command center designed with:
- **Frontend**: Next.js 16.2.6 (Turbopack) & React
- **Styling**: Glassmorphism aesthetic using Vanilla CSS, Tailwind CSS, & Radix UI primitives
- **Database & Auth**: Google Firebase / Firestore (real-time listeners and offline synchronization)
- **Charts & Graphs**: Recharts (interactive vector charts)
- **PDF Engines**: Automated vector-aligned document generators (payslips, quotes)

---

## 🔒 1. Cybersecurity Engineer

As a **Cybersecurity Intern**, your primary mission is to harden the ERP's defense posture, conduct continuous threat modeling, and ensure complete regulatory and data protection compliance.

### What You Can Do (Platform Access)
- **Simulate Roles**: Use the `SIMULATE` dropdown in the top navigation bar to assume any role (`c_suite`, `intern`, `employee`) to test front-end restriction models.
- **Audit Telemetry**: Access the live security logs under **Settings ➔ Audit Log** to inspect user actions, IP records, and access times.
- **Rules Inspection**: Edit and test Firestore security profiles in the `firestore.rules` file.

### What You Need to Do (Key Tasks)
- [ ] **Security Audits**: Perform automated and manual penetration testing on all auth routes (`/login`, `/client-portal`).
- [ ] **Firestore Rule Hardening**: Review `firestore.rules` to ensure no collection permits generic write accesses without validating matching UIDs or roles.
- [ ] **API Security**: Implement rate limiting for serverless routes (such as `/api/discord` and `/api/ocr`).
- [ ] **Environment Protection**: Ensure no developer credentials, service accounts, or private webhook endpoints are committed to version control.
- [ ] **CORS & CSP Configuration**: Implement strict Content Security Policies in the Next.js header outputs.

---

## 🎨 2. UI/UX Developer

As a **UI/UX Intern**, you are responsible for maintaining the ERP's premium, high-end design, polishing interactions, and making the system look extremely premium.

### What You Can Do (Platform Access)
- **Aesthetic Refinement**: Modify theme definitions, layout rules, and components inside `src/app/globals.css` and individual module sheets.
- **Responsive Grids**: Re-architect sidebar layouts, flex panels, and tables.
- **Transitions**: Implement micro-interactions using `framer-motion`.

### What You Need to Do (Key Tasks)
- [ ] **Responsiveness Check**: Verify all dashboards render correctly on viewports ranging from 375px mobile screens up to 4K displays.
- [ ] **Typography & Palette Harmony**: Standardize visual hierarchies (e.g., Outfit/Inter font weights, glass border colors, and consistent hover gradients).
- [ ] **Accessibility Compliance**: Conduct WCAG 2.1 AA audits to ensure appropriate contrast levels, focus indicators, and screen reader labels are configured.
- [ ] **Performance Polish**: Reduce Cumulative Layout Shift (CLS) on dynamic load screens (such as charts).
- [ ] **Animation Optimizations**: Refactor animation triggers to use CSS hardware acceleration where possible.

---

## 🛠️ 3. Software Developer

As a **Software Developer Intern**, you will expand core backend modules, build client features, optimize data streams, and write performant application logic.

### What You Can Do (Platform Access)
- **Feature Extension**: Add tabs, filters, forms, and validation handlers across all 10 ERP modules (CRM, HR, Finance, Projects, Tasks, etc.).
- **Utility Libraries**: Extend system functions in `src/lib/` (e.g., PDF generation, CSV exports, date math).
- **Hooks**: Design custom React hooks to manage shared client states.

### What You Need to Do (Key Tasks)
- [ ] **Firestore Query Optimization**: Restructure queries using appropriate indexing to minimize read operations and billing footprints.
- [ ] **Unit & E2E Testing**: Author automated component tests using Jest/React Testing Library.
- [ ] **Robust Error Boundaries**: Implement graceful fallbacks for database connection failures and offline conditions.
- [ ] **Performance Tuning**: Implement pagination, query caching, and lazy loading for long data lists (e.g., large task boards or employee rosters).
- [ ] **API Standardisation**: Align server route responses to return consistent, standard JSON error/success objects.

---

## 🤖 4. AI Engineer

As an **AI Intern**, your role is to make the ERP intelligent, enabling predictive forecasting, natural language automation, and advanced data extraction.

### What You Can Do (Platform Access)
- **OCR Enhancements**: Access the OCR API module under `/api/ocr` to refine text extraction algorithms.
- **Metadata Analytics**: Leverage stored invoices, leads, and project data to extract actionable operational telemetry.
- **Smart Notification Hubs**: Integrate text summarizers for notification feeds.

### What You Need to Do (Key Tasks)
- [ ] **Lead Scoring Model**: Build a predictive model within the CRM tab to classify and score leads based on company size, engagement patterns, and values.
- [ ] **Workload Forecasting**: Develop algorithms to predict when a department is approaching bottleneck utilization using historical Gantt timelines.
- [ ] **Invoice Parsing**: Improve the OCR pipeline to parse uploaded expense PDFs and extract key fields (merchant name, tax, total, currency) with high accuracy.
- [ ] **Natural Language Interaction**: Design chatbot components for the internally hosted Chat module to answer user queries using context from the organizational directory.

---

## 🏁 Development Rules & Guidelines

To maintain code quality and prevent regressions, all interns must adhere to these policies:
1. **Branch Workflow**: Do not push directly to the `master` branch. Always work on feature branches named `feature/your-role-task` and open a Pull Request.
2. **Review Policy**: Every Pull Request must pass static analysis checks (TypeScript compilation and linting) and be approved by a Senior Engineer.
3. **No Placeholders**: Never commit empty files or draft/placeholder UI elements. Always provide complete, functional implementations.
4. **Environment Integrity**: Maintain local test setups and clean up test data created in the dev database.
