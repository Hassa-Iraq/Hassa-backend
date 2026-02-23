# Food Delivery Platform – 7–8 Week Milestone Plan  
## Backend APIs & Admin Dashboard

This document outlines the **7–8 week delivery plan** for completing the **backend APIs** and **Admin Web Dashboard** for the Food Delivery platform (Middle East market). It is aligned with the **Food Delivery App – Project Summary** (client PDF) and the existing microservices codebase.

---

## 1. Scope Summary

| Area | In scope | Out of scope (for this plan) |
|------|----------|------------------------------|
| **Backend** | All 7 microservices – APIs completed, tested, and documented | Mobile apps (Customer / Restaurant / Driver) |
| **Admin Dashboard** | Full web app (React + TypeScript) for platform control, analytics, and operations | Flutter mobile apps, driver/customer apps |
| **Infrastructure** | Existing Docker, Nginx, PostgreSQL, Redis, Elasticsearch | New cloud/DevOps beyond current setup |

### 1.1 Backend (Existing Services)

- **auth-service** – Authentication, users, roles, profile, OTP, password flows  
- **restaurant-service** – Restaurants, menus, categories, discovery, search, banners  
- **order-service** – Orders, cart, status lifecycle  
- **delivery-service** – Delivery assignments, driver availability, tracking  
- **payment-service** – Payments, wallet, refunds  
- **notification-service** – Email/SMS, templates, in-app notifications  
- **admin-analytics-service** – Coupons, banners, analytics, audit, platform config  

### 1.2 Admin Dashboard (To Be Built)

- **Tech:** React.js + TypeScript (per project summary)  
- **Responsibilities:** Users, restaurants, drivers, orders, finances (commissions, settlements), analytics & reporting, platform configuration, support & monitoring  

---

## 2. Current State vs Target

| Service | Current state | Target (end of 7–8 weeks) |
|---------|----------------|----------------------------|
| Auth | Registration, login, profile, OTP, admin create | Complete; RBAC and admin user management fully used by dashboard |
| Restaurant | CRUD, menus, categories, discovery, search, banners | Complete; approval/workflow and reporting APIs needed by admin |
| Order | Health only / minimal | Full order lifecycle, status updates, history, filters for admin |
| Delivery | Health only / minimal | Assign driver, status, tracking, driver availability for admin |
| Payment | Health only / minimal | Payments, wallet, commissions, settlements for admin |
| Notification | Send email/SMS | Templates, audit, and triggers aligned with admin actions |
| Admin-analytics | Coupons, banners, health | Analytics, audit logs, platform config, reporting APIs |

---

## 3. Execution Approach: Parallel Backend & Frontend

**Backend** and **Admin Dashboard (frontend)** run **in parallel** from Week 1. Each week has both tracks so the team can progress on APIs and UI together. We **start with Authentication APIs and Order APIs** so the dashboard can log in and manage users/orders early.

| Week | Backend | Frontend (Admin Dashboard) |
|------|--------|----------------------------|
| **1** | **Auth APIs** (complete); **Order APIs** (CRUD, status, list) | Project setup, login, layout, user list |
| **2** | Delivery APIs; Restaurant approval/list-for-admin | User detail/edit; Restaurant list, detail, approval |
| **3** | Payment, wallet, notifications | Orders list/detail/status; Delivery list |
| **4** | Admin-analytics: analytics, audit, config, reporting | Drivers; Delivery view; Payments list |
| **5** | RBAC consistency; report export; any gaps | Commissions & settlements; Analytics views |
| **6** | Security pass; API docs; validation | Platform config UI; Reports; Support/monitoring |
| **7** | Integration fixes; stability | E2E tests; UX polish; empty states |
| **8** | Final API docs; deployment notes | Staging deploy; handover; client UAT |

---

## 4. Week-by-Week Breakdown

### Week 1 – Auth APIs + Order APIs (Backend) | Foundation & Auth (Frontend)

**Goal:** Backend leads with **authentication** and **orders**. Frontend goes live with login and user management so both tracks integrate from day one.

**Backend**

- **Auth service (priority)**
  - [ ] Admin list users (with filters: role, status, search)
  - [ ] User detail by id; update user (role, status, profile) for admin
  - [ ] RBAC: admin-only routes protected; consistent role checks
  - [ ] Optional: first-admin / invite-admin flow documented
- **Order service**
  - [ ] Order model and DB migrations (order items, status enum)
  - [ ] APIs: create order, get by id, list (filters: user, restaurant, status, date range)
  - [ ] Update order status (e.g. pending → confirmed → preparing → ready_for_pickup)
  - [ ] Integration with auth (user) and restaurant (menu items, pricing); validation and errors

**Frontend (Admin Dashboard)**

- [ ] Project setup: React (Vite/CRA), TypeScript, React Router, API client (base URL, JWT, 401 → login)
- [ ] Auth: login (JWT), logout, token refresh, protected routes
- [ ] Layout: sidebar/nav (Users, Restaurants, Orders, Drivers, Payments, Analytics, Settings)
- [ ] User list (table + filters) and user detail – consuming auth APIs
- [ ] RTL/i18n placeholder if required

**Deliverables**

- Auth and order APIs usable from Postman/dashboard; migrations and health checks green
- Admin app builds and runs; admin can log in and list/view users

**Acceptance criteria**

- Admin can log in via dashboard, see user list from auth-service, and create/list/update order status via Order APIs (Postman or a minimal order screen).

---

### Week 2 – Delivery APIs + Restaurant Admin (Backend) | Users & Restaurants (Frontend)

**Goal:** Delivery service supports assignments and driver status; restaurant APIs ready for admin. Dashboard completes user management and adds restaurants.

**Backend**

- **Delivery service**
  - [ ] Delivery/assignment model and migrations (order, driver, status)
  - [ ] APIs: assign driver to order, update delivery status, list deliveries (filters)
  - [ ] Driver availability/status endpoint for admin
- **Restaurant service**
  - [ ] List restaurants for admin (filters); approve/reject or status update endpoint if not present
- **Auth**
  - [ ] Any missing “list users for admin” filters or fields

**Frontend**

- [ ] User detail: view and edit (role, status)
- [ ] Restaurants: list (table + search/filters), view detail, approve/reject or status change
- [ ] Use restaurant and auth APIs; loading and error states

**Deliverables**

- Delivery and restaurant admin APIs documented and working
- Dashboard: full user management; restaurant list and approval flow

**Acceptance criteria**

- Admin can list and approve restaurants in the dashboard; can assign a driver to an order and list deliveries via API.

---

### Week 3 – Payment, Wallet & Notifications (Backend) | Orders & Delivery (Frontend)

**Goal:** Payments and notifications support orders and admin. Dashboard shows orders and delivery status.

**Backend**

- **Payment service**
  - [ ] Payment and wallet models and migrations
  - [ ] APIs: create payment (link to order), refund, payment history; wallet balance, top-up, deduct
  - [ ] Commission/settlement model and at least one admin endpoint
- **Notification service**
  - [ ] Templates and send-by-template API; optional triggers (e.g. order confirmed)

**Frontend**

- [ ] Orders: list with filters (status, date, restaurant, user), order detail, update status
- [ ] Delivery: list assignments and status, link to order
- [ ] Use order and delivery APIs from Weeks 1–2

**Deliverables**

- Payment and notification APIs working; commission/settlement endpoint available
- Dashboard: order list/detail/status and delivery list working

**Acceptance criteria**

- Admin can view and update orders and delivery status in the dashboard; can record/view payments via API.

---

### Week 4 – Admin APIs & Analytics (Backend) | Drivers, Delivery & Payments (Frontend)

**Goal:** Admin-analytics exposes analytics, audit, config, and reporting. Dashboard adds drivers, delivery view, and payments.

**Backend**

- **Admin-analytics service**
  - [ ] Analytics APIs: KPIs (orders, revenue, top restaurants, etc.)
  - [ ] Audit logging API (list/filter); platform config get/update (auth)
  - [ ] Reporting: CSV/JSON export for orders/payments/settlements (date range)
- **Cross-service**
  - [ ] List drivers for admin (auth or delivery-service); RBAC consistent

**Frontend**

- [ ] Drivers: list, view detail, availability/status, optional block/enable
- [ ] Delivery: list and detail view; link to order
- [ ] Payments: list (order, amount, status); refund if supported
- [ ] Commissions & settlements: view list and details

**Deliverables**

- Analytics, audit, config, and report export working
- Dashboard: drivers, delivery, and payments/commissions screens

**Acceptance criteria**

- Admin can call analytics and config APIs and export a report; dashboard shows drivers, deliveries, and payments.

---

### Week 5 – RBAC & Gaps (Backend) | Analytics & Settlements (Frontend)

**Goal:** Backend gaps closed and RBAC solid; dashboard shows analytics and settlements.

**Backend**

- [ ] Any missing “list for admin” or role-guarded endpoints
- [ ] Report export polished (filters, format)
- [ ] RBAC and validation pass across admin routes

**Frontend**

- [ ] Analytics: dashboards (e.g. orders over time, revenue, top restaurants)
- [ ] Commissions & settlements: full flow; optional “mark as paid” or export
- [ ] Error handling and empty states on main screens

**Deliverables**

- Backend admin surface complete and consistent
- Dashboard: at least two analytics views; settlements usable

**Acceptance criteria**

- Admin can view analytics and manage settlements from the dashboard; all admin APIs respect roles.

---

### Week 6 – Security & API Docs (Backend) | Config, Reports & Support (Frontend)

**Goal:** Backend secure and documented; dashboard has config, reports, and support/monitoring.

**Backend**

- [ ] Security pass: auth on every admin endpoint; validation and error messages
- [ ] API summary or Postman collection for all admin-used endpoints
- [ ] Environment and deployment notes in `docs/`

**Frontend**

- [ ] Platform configuration: form to view/edit config (commission %, limits, feature flags)
- [ ] Reports: trigger export and download (orders, payments)
- [ ] Support/monitoring: recent orders or issues; link to health dashboard if available
- [ ] No critical console or API errors on main flows

**Deliverables**

- API docs and deployment notes; backend security signed off
- Dashboard: config screen, report download, support/monitoring view

**Acceptance criteria**

- Admin can change platform config and download reports from the dashboard; backend docs and env guide are in place.

---

### Week 7 – Integration & Polish (Backend + Frontend)

**Goal:** End-to-end flows stable; bugs fixed; ready for UAT.

**Backend**

- [ ] Integration fixes; stability; any failing flows resolved

**Frontend**

- [ ] E2E or critical-path tests (e.g. login → list orders → change status)
- [ ] Responsive layout; accessibility and RTL if in scope
- [ ] UX polish and loading/error consistency

**Deliverables**

- Stable backend + dashboard; E2E tests passing; known issues documented

**Acceptance criteria**

- Full flow (login → users → restaurants → orders → payments → analytics → config) works without blocking bugs.

---

### Week 8 – Documentation, Handover & UAT

**Goal:** Documentation complete; staging deploy; client UAT and handover.

**Backend**

- [ ] Final API summary or Postman collection; deployment and env notes in `docs/`

**Frontend**

- [ ] Build and deploy to staging/preview URL
- [ ] Demo script and short “how to run admin” in `docs/`

**Documentation & handover**

- [ ] Single place in `docs/`: how to run backend + admin, env vars, main APIs
- [ ] Handover: demo script, known limitations, suggested next steps (e.g. mobile apps)

**Acceptance criteria**

- Client can run backend + admin (or use staging), complete main flows, and have one reference (docs + API list) for handover.

---

## 5. Dependencies & Risks

| Dependency | Mitigation |
|------------|------------|
| **Auth first** | Week 1 backend completes auth (list users, RBAC) so frontend can log in and show user list from day one |
| **Orders early** | Week 1 backend delivers order APIs so order screens (Week 3 frontend) have a stable API |
| **Parallel work** | Frontend uses mock or “coming soon” for features whose APIs land in a later week (e.g. payments in Week 3) |
| Payment model (commission/settlement) | Agree with client in Week 1–2 on rules and data shape |
| RTL / i18n for admin | If required, add structure in Week 1–2 frontend and fill in Week 6–7 |

---

## 6. Success Criteria (End of Week 8)

- [ ] All 7 backend services expose the APIs needed for the admin dashboard and documented flows.
- [ ] Admin dashboard (React + TypeScript) allows an admin to: manage users, restaurants, orders, drivers, deliveries, payments/commissions, analytics, platform config, and a basic support/monitoring view.
- [ ] Backend and admin can be run locally and (where applicable) on a staging environment.
- [ ] Documentation in `docs/` covers setup, main APIs, and handover; client can perform UAT on scope above.

---

## 7. Document Control

| Version | Date | Changes |
|---------|------|--------|
| 1.0 | 2026-02-21 | Initial 7–8 week milestone for backend APIs and admin dashboard |
| 1.1 | 2026-02-21 | Parallel backend + frontend; start with Auth APIs and Order APIs |

---

*This milestone plan is based on the Food Delivery App – Project Summary and the current food-app-main codebase. Backend and frontend run in parallel; Week 1 leads with Authentication and Order APIs. Adjust week boundaries or scope with the client as needed.*
