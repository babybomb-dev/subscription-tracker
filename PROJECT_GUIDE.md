# SubTracker — Complete Code Map

> เอกสารนี้อ้างอิง working tree ของ `D:\subscription-tracker-github-sync` ณ วันที่ 18 กันยายน 2026 และใช้สำหรับช่วยแก้โค้ดด้วยมือ ชื่อ identifier คงรูปตามโค้ดจริง ห้ามนำค่า config ลับจากไฟล์ไปเผยแพร่

## Quick Lookup Index

| ถ้าต้องแก้ | เริ่มที่ไฟล์ / ฟังก์ชัน |
|---|---|
| เพิ่ม Subscription | `index.html` `#form-sub` → `setupEventListeners()` → `addSubscription()` |
| แก้ Subscription | `openEditModal()` → submit handler ใน `setupEventListeners()` → `updateSubscription()` |
| ลบ Subscription | `#btn-confirm-delete` handler ใน `setupEventListeners()` → `deleteSubscription()` |
| Dashboard | `updateUI()`, `renderSmartGreeting()`, `renderUpcomingList()`, `renderActiveSubsList()` |
| Calendar | `renderMonthlyCalendar()`, `renderFullCalendar()`, `initFullCalendarControls()` |
| CSV | `handleExportCSV` ภายใน `setupEventListeners()`; ปุ่ม `#btn-export-csv`, `#btn-export-csv-desktop` อยู่หน้า List |
| Split Bill / PromptPay | `openSplitBillModal()`, `initSplitBill()`, `generatePromptPayPayload()` |
| Categories | หน้า List `#list-category-management`; `addCustomCategory()`, `deleteCustomCategory()`, `populateCategoryDropdowns()` |
| Settings | `initSettings()`; Theme/Currency/Notifications ใน `#view-settings` |
| Notifications | `initNotifications()`, `requestNotificationPermission()`, `checkUpcomingNotifications()` |
| User Support | `renderMySupportPage()`, `submitMySupportCase()`, `listenMySupportCases()` |
| Staff Support | `ensureSupportCaseListener()`, `renderSupportOverview()`, `handleSupportCaseAction()` |
| Admin Support | `renderAdminSupportCases()`, `openSupportUserCases()`, `renderSupportCaseDetail()` |
| เปลี่ยน Role | `renderManagementUsers('admin')` → `changeRole()` → `updateUserRole()` |
| Admin User Management | `loadManagementUsers('admin')`, `renderManagementUsers('admin')` |
| Staff Overview | `loadManagementUsers('staff')`, `renderStaffBackOffice()` |
| Admin Report | `renderAdminBackOffice()`, `renderSupportReports()` |
| Login/Auth | `initAuthListener()` → `handleAuthStateChange()` → `showAppScreen()` |
| สิทธิ์จริงของฐานข้อมูล | `firestore.rules` เสมอ |
| PWA/cache ค้าง | `sw.js` (`CACHE_NAME = subtracker-v36`) และ `initPWA()` |

## 1. Project Overview

SubTracker เป็นเว็บ PWA ภาษาไทยสำหรับติดตามค่าสมาชิกรายเดือน/รายปี งบประมาณ ประวัติการจ่าย ปฏิทิน รายงาน การแบ่งบิล และเคส Support มีพื้นที่ทำงาน 3 บทบาทที่แสดงใน UI: `user`, `staff`, `admin` (ข้อความบนจอ: User, Staff, Admin)

### Tech stack

- HTML เดี่ยว (`index.html`) + ES modules; ไม่มี build step
- Tailwind CSS ผ่าน CDN + CSS เพิ่มเติมใน `style.css`
- Firebase JS SDK 10.12.2 ผ่าน CDN: Authentication และ Cloud Firestore
- Chart.js, QRCode.js, Font Awesome และ Google Fonts ผ่าน CDN
- Service Worker + Web App Manifest สำหรับ PWA
- Tests ใช้ Node test runner; Firestore rules tests ใช้ Firebase emulator

### สถาปัตยกรรมและ runtime flow

```text
index.html
  → <script type="module" src="js/main.js">
  → DOMContentLoaded
  → initTheme / initSplitBill / initPWA / initNotifications / event wiring
  → initAuthListener (Firebase Auth)
  → handleAuthStateChange
  → users/{uid} profile ผ่าน getUserSettings
  → resolveUserAccess / role resolution
  → navigateToView + แสดง User/Staff/Admin workspace
  → services/database.js และ services/support.js
  → Firestore listeners/CRUD
  → updateUI และ render functions
```

`main.js` เป็น composition root: เก็บ state, เชื่อม DOM, auth, routing, renderer และ service ส่วน modules ใต้ `components/` เน้นแสดงผล/interaction, `services/` ติดต่อ Firebase, `utils/` เป็น pure helpers และ access normalization

## 2. Complete File Map

### `index.html`

**Purpose:** shell ทั้งแอป รวม auth/register, nav ตาม role, views, forms และ modals. **Used by:** browser; `main.js` query DOM. **Depends on:** Tailwind CDN, Font Awesome, Chart.js, QRCode.js, `style.css`, `manifest.json`, `js/main.js`. **Important DOM:** ดูหัวข้อ DOM Map. **Firestore:** ไม่มี direct access. **Notes:** Tailwind theme ถูกตั้งจาก `localStorage.subtracker_theme` ก่อนโหลด CSS; เปลี่ยน ID ต้องตามแก้ JS.

### `style.css`

**Purpose:** animation, responsive layout, modal, Support/Admin components และ overrides เสริม Tailwind. **Used by:** `index.html`. **Depends on:** class names ใน HTML และ markup ที่ JS render. **DOM:** `.view-section`, `.nav-item`, `.modal-*`, `.support-*`, `.admin-*` และ responsive/mobile rules. **Firestore:** ไม่มี. **Notes:** หลาย class ถูกสร้างใน template string ของ `main.js`/`ui.js`; ค้นทั้ง repo ก่อน rename.

### `firebase-config.js`

**Purpose:** initialize Firebase app และ export `app`, `auth`, `db`, `provider`. **Used by:** `services/auth.js`, `services/database.js`, `services/support.js`. **Depends on:** Firebase CDN. **Firestore:** จุดเริ่ม client. **Notes:** มี project config จริงอยู่ในไฟล์ จึงไม่บันทึกค่าลงคู่มือนี้; config client Firebase ไม่แทน security rules.

### `js/main.js`

**Purpose:** entry point, global state, auth lifecycle, role routing, User/Staff/Admin/Support orchestration และ event handlers. **Used by:** `index.html`. **Depends on:** ทุก service/component/utility ที่ active. **DOM:** เกือบทุก view/form/modal. **Firestore:** ผ่าน services. **Notes:** ไฟล์ศูนย์กลางและเสี่ยงสูง; async auth ใช้ `authResolutionId` กันผล lookup เก่าทับ session ใหม่.

### `js/services/auth.js`

**Purpose:** wrapper ของ Firebase Auth. **Used by:** `main.js`. **Depends on:** `firebase-config.js`, Firebase Auth CDN. **DOM:** ไม่มี. **Firestore:** ไม่มี; `register()` อัปเดต Auth display name แต่ user document ถูกสร้างใน flow ของ `main.js`. **Functions:** `login`, `register`, `loginWithGoogle`, `logout`, `initAuthListener`, `updateUserProfile`.

### `js/services/database.js`

**Purpose:** CRUD/listeners ของ subscriptions, users/settings, history, admin data และ Premium compatibility. **Used by:** `main.js`. **Depends on:** `db`, `auth`, `calculateNextBillingDate`, `calculatePremiumUntil`. **Firestore:** `subscriptions`, `canceled_subs`, `users`, `payment_history`, `premium_purchases`, `admin_audit_logs`. **Notes:** `recordSubscriptionPayment()` และ Premium operations เป็น transaction/batch; ห้ามแยก write โดยไม่ตรวจ rules.

### `js/services/support.js`

**Purpose:** data layer ของ Support ทั้ง user owner scope และ staff/admin system scope. **Used by:** `main.js`. **Depends on:** Firebase Firestore, `auth`, `db`. **Firestore:** `support_cases`, `support_cases/{caseId}/notes`. **Notes:** user initial note ต้องใช้ document ID `initial` และสร้าง atomically กับ case ตาม rules.

### `js/components/ui.js`

**Purpose:** theme, view switching, modal/toast และ Subscription list renderers. **Used by:** `main.js`. **Depends on:** helpers (`formatMoney`, dates, logo/calendar URL). **DOM:** `#modal-sub`, `#modal-confirm`, `#modal-split-bill`, `#modal-backdrop`, list containers. **Firestore:** ไม่มี. **Notes:** renderer รับ callbacks จาก `main.js`; HTML ถูกสร้างด้วย template strings.

### `js/components/chart.js`

**Purpose:** donut chart แยกตามแอปหรือ category. **Used by:** `updateUI()` และ chart toggle handlers. **Depends on:** global `Chart`, money/category helpers. **DOM:** `#donut-chart`, `#chart-legend`, center labels. **Firestore:** ไม่มี.

### `js/components/history.js`

**Purpose:** ประวัติการจ่ายและรายการล่าสุด. **Used by:** `updateUI()`. **DOM:** `#history-list-container`, `#latest-transactions-container`. **Firestore:** รับข้อมูลจาก `payment_history` listener.

### `js/components/calendar.js`

**Purpose:** ปฏิทินย่อและเต็ม พร้อม previous/next. **Used by:** `main.js`. **DOM:** `#full-calendar-grid`, `#full-calendar-agenda`, `#full-cal-month-year`, navigation buttons. **Firestore:** ไม่มี; รับ subscriptions.

### `js/components/analytics.js`

**Purpose:** analytics bar chart, insight และ Year in Review modal. **Used by:** `updateUI()`/button handler. **DOM:** `#analytics-*`, `#modal-year-in-review`, `#yir-*`. **Firestore:** ไม่มี.

### `js/components/settings.js`

**Purpose:** UI Settings สำหรับ theme mode, base currency, notification days/enabled. มี category hooks เก่าแต่ current category UI อยู่หน้า List. **Used by:** `main.js`. **DOM:** `#settings-*`, `#btn-save-settings`; `#settings-cat-list` ถ้ามี. **Firestore:** callback save ผ่าน `saveUserSettings()`. **Notes:** `initSettings(options)` รับ dependency callbacks ป้องกัน circular import.

### `js/components/notifications.js`

**Purpose:** browser permission, UI status และ notification ของรายการใกล้ถึงกำหนด. **Used by:** `main.js`. **DOM:** `#settings-noti-enabled`, `#noti-list`. **Firestore:** ไม่มี direct; อ่าน settings จาก localStorage/DOM และ subscriptions ที่ส่งเข้าไป.

### `js/components/splitBill.js`

**Purpose:** คำนวณหารจำนวนคนและสร้าง PromptPay QR. **Used by:** delegated `.btn-split-bill` handler. **Depends on:** `generatePromptPayPayload`, global `QRCode`. **DOM:** `#split-*`, `#qrcode`, `#qr-container`. **Firestore:** ไม่มี.

### `js/utils/helpers.js`

**Purpose:** money/date/category/logo, PromptPay payload, Google Calendar URL. **Used by:** renderers และ main. **Firestore:** ไม่มี. **Notes:** date calculation รักษาวันที่ตั้งใจและ clamp ตามจำนวนวันของเดือน.

### `js/utils/access.js`

**Purpose:** normalize identity/role/plan/Premium timestamps และ view access. **Used by:** main/database. **Firestore:** ไม่มี direct; ตีความ fields จาก user documents. **Notes:** รองรับ legacy role `premium` โดยแปลงใน memory เป็น role `user` + plan `premium`.

### `js/utils/presets.js`

**Purpose:** export `subscriptionPresets` สำหรับ quick-fill form. **Used by:** `renderPresets()`. **Firestore/DOM:** ไม่มี direct.

### `js/pwa.js`

**Purpose:** register service worker และจัดการ install prompt. **Used by:** `main.js`. **DOM:** install UI ถ้ามี. **Notes:** cache/debug PWA ต้องตรวจทั้งไฟล์นี้และ `sw.js`.

### `sw.js`

**Purpose:** precache app shell, ลบ cache รุ่นเก่า, fetch cache strategy. **Used by:** browser Service Worker ผ่าน `initPWA()`. **Version:** `subtracker-v36`. **Notes:** เปลี่ยน source โดยไม่ bump cache อาจทำ browser ใช้ไฟล์เก่า; task นี้ห้ามแก้.

### `manifest.json`, `icon.svg`, `firebase.json`, `.firebaserc`

Manifest กำหนดชื่อ/start URL/theme/icon; SVG เป็นไอคอน; `firebase.json` ชี้ Firestore rules; `.firebaserc` ระบุ Firebase project alias. ไม่มี application function.

### `firestore.rules`

**Purpose:** authorization จริงฝั่งฐานข้อมูล. **Used by:** Firebase deployment/emulator. **Collections:** ดู Firestore Map. **Notes:** มีทั้ง root `subscriptions/{id}` (ตรงกับ active service) และ nested `users/{uid}/subscriptions/{id}` (compatibility/unused by current service).

### Tests

- `tests/support-submit.test.js`: submit สำเร็จ/ล้มเหลว, cleanup หลัง commit, double-submit guard และ owner listener replacement.
- `tests/admin-user-support.test.js`: Admin/Staff user-row Support actions, indicators, filters, modal reuse และ live refresh.
- `tests/firestore/support.rules.test.js`: atomic user create, owner reads/query, Staff/Admin workflow, spoof/invalid transitions และ system-wide queries.
- `tests/firestore/package.json`, `package-lock.json`: test dependencies/scripts; ไม่ใช่ runtime source.

## 3. Function Map

รูปแบบย่อในตาราง: **Role** คือผู้ใช้ของ behavior; Firestore ระบุเฉพาะเมื่อมี direct/indirect data action.

### Auth / database services

| Function | Purpose / Called by / Calls | Firestore | Role / safe notes / danger |
|---|---|---|---|
| `login()` | email/password sign-in; login form เรียก | — | Shared; เปลี่ยนข้อความ error ที่ `getLoginErrorMessage()`, อย่าเปลี่ยน auth provider flow ง่าย ๆ |
| `register()` | สร้าง Auth user + display name | — | User; user doc สร้างภายหลังใน `showAppScreen()` |
| `loginWithGoogle()` / `logout()` | popup login / sign out | — | Shared |
| `initAuthListener()` | ผูก `onAuthStateChanged`; DOMContentLoaded เรียก | — | Shared; จุดเริ่ม auth สำคัญ |
| `updateUserProfile()` | แก้ Auth `displayName/photoURL` | — | User; Firestore identity sync เป็นอีกขั้น |
| `listenSubscriptions()` | realtime query `userId` | `subscriptions` read | User; callback ต้องรับ error |
| `addSubscription()` / `updateSubscription()` / `deleteSubscription()` | CRUD active row | `subscriptions` C/U/D | User; payload owner/validation ต้องตรง rules |
| `archiveSubscription()` | compatibility helper สำหรับ batch สร้าง canceled record แล้วลบ active; ไม่พบ caller ใน current UI | `canceled_subs` + `subscriptions` | Legacy/unused; atomic ห้ามแยก |
| `listenCanceledSubscriptions()` / `hardDeleteCanceledSubscription()` | history ของรายการยกเลิก / ลบถาวร | `canceled_subs` | User |
| `createUserAccountDocument()` | transaction สร้าง default `role:user`, `plan:free`; เติม email/name ที่ขาด | `users/{uid}` | Shared; ห้าม reset role/createdAt เดิม |
| `saveUserSettings()` / `getUserSettings()` | merge/read profile/settings | `users/{uid}` | User; fields role/plan ถูก rules ป้องกัน |
| `syncAuthenticatedUserEmailIfMissing()` / `syncAuthenticatedUserDisplayNameIfMissing()` | เติม identity จาก Auth เฉพาะเมื่อว่าง | `users/{uid}` | Shared; rules จำกัด field diff |
| `recordSubscriptionPayment()` | transaction ตรวจ owner/date, เลื่อน billing date, บันทึก payment | `subscriptions`, `payment_history` | User; logic วันที่และ transaction เสี่ยงสูง |
| `listenPaymentHistory()` | realtime owner history | `payment_history` | User |
| `getAllUsers()` / `getAllSubscriptionsForSupport()` | โหลด back office data | `users`, `subscriptions` | Staff/Admin; permission อยู่ rules |
| `getAdminAuditLogs()` | audit ล่าสุด 50 รายการ | `admin_audit_logs` | Admin |
| `updateUserRole()` | เปลี่ยน role; รักษา legacy plan เมื่อร้องขอ | `users` | Admin; rules ห้าม self/admin target |
| `migrateLegacyPremiumUser()` | `premium` role → `user` + Premium lifetime | `users` | Legacy; อย่าลบจนข้อมูลเก่าหมด |
| `purchasePremiumPlan()` | simulated approved purchase + user access batch | `premium_purchases`, `users` | Legacy/hidden; prices/rules ต้องตรงกัน |
| `overrideUserPremium()` | Admin batch user state + immutable audit | `users`, `admin_audit_logs` | Legacy/hidden Admin; batch/audit coupling ห้ามแยก |

### Support service

| Function | Purpose / chain | Firestore | Role / danger |
|---|---|---|---|
| `listenSupportCases()` | system-wide ordered listener → `ensureSupportCaseListener()` | `support_cases` | Staff/Admin only by rules |
| `listenMySupportCases()` | owner query → `ensureMySupportCaseListener()` | `support_cases` | User |
| `getMySupportDescription()` | อ่าน case แล้วอ่านเฉพาะ `notes/initial` | case + initial note | User; internal notes ไม่เปิดให้ user |
| `createOwnSupportCase()` | validate auth แล้ว delegate `createSupportCase()` | case + note | User |
| `listenSupportCaseNotes()` | ordered notes listener | notes | Staff/Admin; User UI ไม่ใช้สำหรับ internal notes |
| `createSupportCase()` | batch case + optional initial note | case + notes | Shared; user note ID ต้อง `initial` |
| `startSupportCase()` | open → in_progress, assign actor | case update | Staff/Admin; Staff ต้อง claim ให้ตัวเอง |
| `resolveSupportCase()` | in_progress → resolved | case update | Staff/Admin; Staff ต้องเป็น assignee |
| `reopenSupportCase()` | resolved → open และ clear assignee | case update | Admin ตาม rules |
| `addSupportCaseNote()` | append immutable note | notes create | Staff/Admin |

### Components / utilities

| Function | Purpose / DOM | Called by / notes |
|---|---|---|
| `initTheme()`, `changeTheme()`, `applyTheme()` | load/apply light/dark/system/accent classes | startup / Settings; accent reload behaviorต้องตรวจก่อนเปลี่ยน |
| `switchView()` | hide `.view-section`, show `#view-${viewId}` | `navigateToView()` |
| `openModal()`, `closeModal()`, `closeAllModals()` | modal/backdrop transitions | handlers ทั่วแอป |
| `showToast()` | render toast ใน `#toast-container` | Shared |
| `renderSubscriptionList()` | cards/list, edit/QR/delete/pay callbacks | User List |
| `renderUpcomingList()` / `renderActiveSubsList()` | dashboard upcoming/active/paused | `updateUI()` |
| `renderDonutChart()` | Chart.js donut/legend | `updateUI()`, chart mode handlers |
| `renderHistoryList()` / `renderLatestTransactions()` | history views | `updateUI()` |
| `renderMonthlyCalendar()` / `renderFullCalendar()` / `initFullCalendarControls()` | compact/full calendar | `updateUI()` / startup |
| `renderAnalyticsChart()` / `openYearInReview()` | report and annual modal | `updateUI()` / year button |
| `initSettings()` / `refreshSettingsCategories()` / `renderSettingsCategories()` | bind/save Settings and optional categories | startup; category current UI is List |
| `initNotifications()` / `requestNotificationPermission()` / `updateNotificationUI()` / `checkUpcomingNotifications()` | browser notification + modal list | startup/noti buttons/`updateUI()` |
| `initSplitBill()` / `openSplitBillModal()` | split amount, PromptPay QR | startup/delegated click |
| `formatMoney()` | localized currency | renderers |
| `parseCalendarDate()` / `createClampedDate()` / `calculateNextBillingDate()` / `getDaysUntil()` | safe recurring dates/countdown | database/renderers; billing logicเสี่ยง |
| `updateCustomCategories()` / `getCategoryName()` / `getCategoryIcon()` / `getLogoHTML()` | category registry and presentation | main/renderers |
| `CRC16_CCITT()` / `generatePromptPayPayload()` | EMV PromptPay payload checksum | Split Bill; format-sensitive |
| `generateGoogleCalendarUrl()` | calendar event URL | subscription renderer |
| `resolveUserIdentity()` / `resolveCurrentUserIdentity()` | เลือก display name/email/uid พร้อม quality flags | management/profile |
| `firestoreValueToDate()` / `resolveUserCreatedAt()` | normalize Timestamp/date | management UI |
| `calculatePremiumUntil()` / `resolveUserAccess()` / `hasPremiumPlan()` | normalize role/plan/expiry/legacy | auth and management |
| `canAccessView()` | allowlist User/Staff/Admin route | `navigateToView()`, initial route |
| `initPWA()` | SW registration/install prompt | startup |

## 4. `main.js` Deep Map

### Initialization and state — approx. lines 1–177

Imports, exported state, role helpers, Premium expiry timer, runtime subscription normalization, DOM roots และ `DOMContentLoaded`. Functions: `isUser`, `isStaff`, `isAdmin`, `isPremium`, `hasPremiumAccess`, `schedulePremiumExpirationRefresh`, `normalizeSubscriptionForRuntime`.

### Authentication and identity — approx. lines 178–542

`handleAuthStateChange()` resets/listener cleanup on logout; `showAppScreen()` loads `users/{uid}`, syncs missing identity, resolves role/access, migrates legacy Premium best effort, loads settings, starts Support listeners, chooses route. Helpers: `showAuthScreen`, `resetLoginControls`, `showRegisterScreen`, `showLoadingScreen`, `showRoleResolutionError`, `getLoginErrorMessage`, password validation functions, `getCurrentUserIdentity`, `renderCurrentUserIdentity`, `fetchExchangeRate`.

### User realtime data and dashboard — approx. lines 543–760

`loadUserData()` owns subscription/payment unsubscriptions. `renderSmartGreeting()` and `updateUI()` calculate active totals/budget, then invoke list/chart/history/calendar/analytics/notifications renderers. `updateManagementUI()` controls role-specific nav. `updateRoleBadges()` renders only current 3-role badge. `updatePremiumUpgradeUI()` currently hides upgrade.

### Support — approx. lines 797–1332, 1806–1945

Constants map statuses/priorities/categories. User chain: `ensureMySupportCaseListener` → `renderMySupportPage` → `openMySupportComposer` → `submitMySupportCase` → `createOwnSupportCase`; detail uses `openMySupportDetail` → `getMySupportDescription`. Staff/Admin chain: `ensureSupportCaseListener` → metrics/list/report renderers → `openSupportCaseDetail` → note listener → `submitSupportNote`/`handleSupportCaseAction`. User-account modal functions connect users, subscriptions, and cases.

### Staff/Admin back office — approx. lines 1333–1805

`renderManagementUsers(panel)` renders search/filter/table/actions. `renderSupportSubscriptions`, `renderStaffBackOffice`, `renderAdminBackOffice`, metrics/popular service/report helpers update dashboards. `loadManagementUsers()` loads users/subscriptions and Admin audits, then renders. `changeRole()` is Admin action chain. Premium functions remain compatibility code.

### Routing and rendering — approx. lines 1946–2207

`navigateToView()` checks `canAccessView()`, updates hash/view, loads back-office data when needed, and renders Support surfaces. `updateWorkspaceWidth()` adjusts layout. `updateUI()` is the main User renderer.

### Event wiring — approx. lines 2208–2930

`setupEventListeners()` binds auth/register/logout, nav/hash, profile, Support forms/actions, management filters/actions, subscription form/edit/archive/pay/pause-resume, CSV, budget, chart/tabs/search/sort/category, notifications, Split Bill และ Year in Review. Anonymous callbacks อยู่ใน function นี้; เมื่อแก้ปุ่มให้ค้น ID และ `addEventListener` ภายในช่วงนี้.

### Subscription modal/categories — approx. lines 2931–end

`openAddModal`, `openEditModal`, `renderPresets`, `addCustomCategory`, `deleteCustomCategory`, `populateCategoryDropdowns`. Category ถูกเก็บใน `users/{uid}.customCategories`; ป้องกันการลบ category ที่ subscription ใช้อยู่.

## 5. HTML / DOM Map

| Area | IDs สำคัญ | Handled by |
|---|---|---|
| Auth/Register | `#auth-screen`, `#register-screen`, `#form-login`, `#form-register`, password toggles | auth handlers, password helpers |
| App gate | `#app-loading-screen`, `#app-screen` | auth lifecycle |
| User nav/views | `#user-desktop-nav`, `#user-bottom-nav`, `#view-dashboard`, `#view-list`, `#view-history`, `#view-analytics`, `#view-calendar`, `#view-support`, `#view-settings` | `navigateToView`, `switchView` |
| Subscription form | `#modal-sub`, `#form-sub`, `#sub-name`, `#sub-price`, `#sub-currency`, `#sub-cycle`, `#sub-category`, `#sub-date`, `#sub-note`, `#sub-status`, `#sub-is-free-trial`, `#sub-excess-cost` | modal helpers + submit handler |
| Lists/dashboard | `#subs-grid`, `#upcoming-container`, `#active-subs-list`, `#search-input`, `#sort-select`, `#filter-category` | `updateUI`, UI renderers |
| Settings | `#settings-theme-mode`, `#settings-base-currency`, `#settings-noti-enabled`, `#settings-noti-days`, `#btn-save-settings` | `initSettings` |
| Categories | `#list-category-management`, `#modal-category`, `#custom-category-name`, `#btn-save-category` | category functions |
| Split Bill | `#modal-split-bill`, `#split-people`, `#split-promptpay`, `#qrcode` | Split Bill component |
| User Support | `#user-support-list`, counters, `#modal-user-support-create`, `#form-user-support-create`, detail modal | User Support functions |
| Staff | `#staff-desktop-nav`, `#view-staff-*`, `#staff-user-list`, `#staff-subscription-list`, `#staff-support-*` | Staff back office renderers |
| Admin | `#admin-desktop-nav`, `#view-admin-*`, `#admin-user-list`, `#admin-subscription-list`, `#admin-support-*`, `#admin-audit-log-list` | Admin renderers |
| Support operator modals | `#modal-support-user`, `#modal-support-case`, `#form-support-case`, `#form-support-note`, `#support-case-actions` | Support detail/action functions |

## 6. User Workspace Map

- **Dashboard:** `#view-dashboard`; `updateUI()` → totals, `renderSmartGreeting`, `renderUpcomingList`, `renderActiveSubsList`, `renderDonutChart`, `renderMonthlyCalendar`, latest transactions. Source `currentSubs`/`currentHistory` listeners.
- **Service/Subscription List:** `#view-list`, `#subs-grid`; renderer `renderSubscriptionList`; search/sort/category state. Add/edit form calls database CRUD. Pause/Resume updates `status`; current delete calls `deleteSubscription()` directly. `archiveSubscription()` exists but is not called from current UI.
- **History:** `#view-history`; `listenPaymentHistory` → `renderHistoryList`. Mark paid uses `recordSubscriptionPayment` and advances next billing date.
- **Analytics/Report:** `#view-analytics`; `renderAnalyticsChart`, `openYearInReview`; calculated client-side from subscriptions/rates.
- **Calendar:** `#view-calendar`; full/compact renderer; Google Calendar URL is external link only.
- **Support:** `#view-support`; owner-scoped listener and create/detail modals. User sees own case metadata and own initial description, not internal operator notes.
- **Settings:** Theme, accent/theme mode, base currency, notifications. Category Management และ CSV Export ปัจจุบันอยู่หน้า **Service List**, ไม่ใช่ Settings.
- **CSV Export:** generated in browser from `currentSubs`; no Firestore write.
- **Split Bill:** calculates THB equivalent and QR locally; PromptPay ID is entered by user and not persisted.

## 7. Staff Workspace Map

- **Overview:** `renderStaffBackOffice()` → user/subscription counts, active/paused ratios, new users, popular services, Support queue/activity.
- **Users:** `renderManagementUsers('staff')`; read all users, show account quality and details. Staff ไม่มี role-change button.
- **Subscription/member records:** `renderSupportSubscriptions('staff')`; reads all root subscriptions for support visibility; no write UI.
- **Report:** account/service/support summaries built client-side.
- **Support:** system listener; create case on behalf, claim open case, resolve own assigned in-progress case, add internal notes.
- **Can:** read users/subscriptions, work Support within rule transitions, sync own missing email/display name.
- **Cannot:** change roles, alter Premium, edit/delete user subscriptions, reopen resolved case, resolve case assigned to another Staff, read Admin audit logs.

## 8. Admin Workspace Map

- **Overview/Reports:** `renderAdminBackOffice()` and `renderSupportReports()` aggregate management arrays and support cases.
- **User Management:** `renderManagementUsers('admin')`. User → Staff chain: row `data-change-role="staff"` → delegated handler → `changeRole(uid,'staff',legacyFlag)` → `updateUserRole` → reload. Staff → User เหมือนกันด้วย `user`.
- **View Details:** `data-open-support-user` → `openSupportUserDetail` → `renderSupportUserDetail`; combines identity, subscription summary, Premium compatibility and cases.
- **Open/View Support:** existing case count uses `data-open-support-user-cases` → modal + scroll to cases; zero cases uses `data-create-support-case` → composer → `submitSupportCase` → `createSupportCase`.
- **Indicators:** `getSupportCaseSummariesByUser()` determines total, pending, and user-created open hints; live Support listener rerenders surfaces.
- **Protected behavior:** cannot change own role, cannot demote another Admin, protected badge appears when action unavailable. Rules enforce target restrictions independently from UI.

## 9. Support System Map

### Schema verified in code

`support_cases/{caseId}` fields: `userId`, `subject`, `category`, `status`, `priority`, `createdBy`, `createdByRole`, `assignedTo`, `createdAt`, `updatedAt`, `resolvedAt`.

`support_cases/{caseId}/notes/{noteId}` fields: `authorId`, `authorRole`, `message`, `createdAt`. User-created description uses `{noteId} = initial`.

Statuses: `open`, `in_progress`, `resolved`. Priorities: `low`, `normal`, `high`. Categories: `account`, `subscription`, `premium`, `billing`, `other` (`premium` retained as schema compatibility label).

### Flow

```text
USER submitMySupportCase
→ createOwnSupportCase/createSupportCase batch
→ support_cases + notes/initial
→ User owner listener + Staff/Admin system listener
→ operator opens detail, claims/resolves/adds note
→ support_cases status/assignment timestamps update
→ listeners rerender User and operator UI
```

UI visibility is convenience. Authorization is enforced by `firestore.rules`: User ownership/query constraints, Staff transition constraints, Admin broader workflow, immutable cases/notes deletion policy.

## 10. Firestore Map

| Collection | Purpose / verified fields | Created/read/updated/deleted by | Relevant functions/rules |
|---|---|---|---|
| `subscriptions` | active items: code uses `userId`, `name`, `price`, `currency`, `cycle`, `category`, `date`, `note`, `status`, `isFreeTrial`, `excessCost`, `createdAt` | User C/R/U/D owner; Staff/Admin read | CRUD/listener, payment transaction; root rules lines 5+ |
| `canceled_subs` | archived subscription + `canceledAt`, `originalDocId`; compatibility code, no current UI caller verified | User create/read/delete owner when invoked | archive/listen/hard delete |
| `users/{uid}` | identity, `role`, `plan`, settings (`budget`, `customCategories`), Premium compatibility fields, timestamps | owner limited writes; Support reads; Admin limited management | account/settings/access functions |
| `payment_history` | `userId`, `subId`, `name`, `price`, `currency`, `paidAt` | User owner | record/listen rules |
| `support_cases` | case workflow fields listed above | User atomic own create/read; Staff/Admin read/create/workflow update; no delete | support service + rules |
| `support_cases/{caseId}/notes` | immutable messages | User creates/reads own `initial`; Staff/Admin create/read all; no update/delete | support service + nested rules |
| `premium_purchases/{uid}` | `userId`, `plan`, `amount`, `currency`, `status`, `createdAt`, `premiumUntil` | compatibility self batch; owner/Admin read | hidden Premium flow |
| `admin_audit_logs/{id}` | Premium override before/after values, reason, admin/target, timestamp | Admin create/read; immutable | hidden Admin Premium flow |
| `users/{uid}/subscriptions/{id}` | nested compatibility rule exists | ไม่มี active JS service ใช้ | rules only; confirmed unused by current source |

## 11. Firestore Rules อธิบายแบบง่าย

- **subscriptions:** User อ่าน/เพิ่ม/แก้/ลบรายการของตัวเองได้. Staff/Admin อ่านรายการเพื่อ Support ได้. Staff ถูกห้ามแก้และลบ. `userId` ต้องคงเจ้าของเดิม.
- **users:** เจ้าของอ่านของตัวเองได้; Staff/Admin อ่านผู้ใช้ได้. เจ้าของสร้าง document ของตัวเองเป็น `role=user`, `plan=free`. เจ้าของแก้ setting ทั่วไปได้แต่แก้ role/plan/Premium ไม่ได้. Staff เติม email ของตัวเองได้เฉพาะตอนว่าง. Admin เปลี่ยน User↔Staff ได้ภายใต้ข้อจำกัด แต่ห้ามเปลี่ยนตัวเองหรือ Admin อื่น.
- **support_cases:** User สร้างเคสตนเองพร้อม note แรกแบบ atomic และอ่านเฉพาะของตน. Staff/Admin อ่านทั้งหมด. Staff claim เคส open ให้ตนเองและ resolve เคสที่ตนรับเท่านั้น. Admin ทำ workflow ได้กว้างกว่าและ reopen ได้. ไม่มีใครลบเคส.
- **notes:** User เห็นเฉพาะ `initial` ที่ตนเขียน; ไม่เห็น internal notes. Staff/Admin อ่าน/เพิ่ม note ได้. ห้ามแก้หรือลบ note.
- **payment_history/canceled_subs:** เจ้าของเท่านั้น; Staff ห้ามเขียน/ลบ.
- **Premium/audit:** batch ต้องมีค่าราคา, ระยะเวลา, user update และ audit ที่สัมพันธ์กัน; audit แก้/ลบไม่ได้.

ข้อสำคัญ: การซ่อนปุ่มด้วย JavaScript **ไม่ใช่** security. UI authorization อยู่ `canAccessView()`/renderers; database authorization อยู่ `firestore.rules`.

## 12. Role and Access Map

Role เก็บที่ `users/{uid}.role`. ค่า active คือ `user|staff|admin`; `resolveUserAccess()` รับ legacy `premium` เพื่อ migration. หลัง Firebase Auth สำเร็จ `showAppScreen()` อ่าน user document, resolve role/plan, ตั้ง `currentUserRole`, เรียก `updateManagementUI()`, แล้ว route ไป `dashboard`, `staff-overview` หรือ `admin-overview`. `canAccessView()` เป็น client allowlist. Firestore ใช้ `requesterRole()` อ่าน role จาก `/users/{request.auth.uid}` อีกครั้ง จึงเป็น source of truth สำหรับสิทธิ์ข้อมูล.

## 13. Settings Map

- **Theme/accent:** `index.html` boot theme + `components/ui.js`; storage key `subtracker_theme` และ theme mode controls.
- **Currency:** `#settings-base-currency` is disabled and fixed to THB in current UI; conversion of subscription currencies uses exchange rates in `state`.
- **Notifications:** enabled/days controls + browser permission in notifications component.
- **Category Management:** current location `#list-category-management` ใน Service/Subscription List. Data lives in `users/{uid}.customCategories`.
- **CSV Export:** current location List (`#btn-export-csv`, desktop variant), local browser download.

## 14. Common Teacher Change Scenarios

| Scenario | START HERE / SEARCH FOR | LIKELY FILE | THEN CHECK | HOW TO TEST |
|---|---|---|---|---|
| เปลี่ยนข้อความปุ่ม | ข้อความปัจจุบันและ ID | HTML หรือ render template | handler ยังชี้ ID เดิม | click ทั้ง desktop/mobile |
| เปลี่ยนสีปุ่ม | ID/class string | `index.html`, `style.css`, renderer | dark/hover/disabled | light/dark + mobile |
| เพิ่มช่อง form | `#form-*` | HTML + submit handler | payload, renderer, rules fields | create/reload/edit |
| ลบช่อง form | field ID | HTML/main | references ที่ `getElementById` | console ไม่มี null error |
| เพิ่ม Subscription field | `form-sub` | HTML → submit → database → render | delete/CSV/history implications; archive helper if reused | add/edit/reload/delete |
| validation | submit handler | `main.js` | required/min/max + rules | valid/invalid/boundary |
| dashboard card | card ID | HTML + `updateUI` | monthly/yearly/rates | empty + sample data |
| Staff dashboard | `staff-stat-` | HTML + `renderStaffBackOffice` | management load permission | Staff login |
| Admin dashboard | `admin-stat-` | HTML + `renderAdminBackOffice` | audits/support listener | Admin login |
| Role behavior | role string/function | `access.js`, `main.js` | rules ต้องอนุญาตจริง | test all 3 roles |
| Support behavior | status/action name | `main.js`, `support.js` | rules + rules tests | owner/Staff/Admin cases |
| category behavior | `customCategories` | main/settings/helpers | dropdown + used-category guard | add/use/delete/reload |
| notification | `settings-noti` | notifications/settings | browser permission | granted/denied |
| add/remove menu | `data-view`/view ID | HTML + `canAccessView` | route and role nav variants | direct hash + clicks |
| data not saving | submit handler/function | main → service | Network/console/rules payload | reload and inspect Firestore |
| data returns after refresh | `deleteSubscription` path | main/database | listener collection and SW cache | hard reload + Firestore |
| permission error | failed collection | `firestore.rules` + service | auth uid/role/fields/query shape | emulator/rules test |
| UI element not found | exact ID | HTML + JS | optional `?.` vs required reference | console + relevant route |
| ReferenceError | symbol name | import/export/declaration | module path/name/case | reload with DevTools |

## 15. Error Survival Guide

- **ReferenceError:** ชื่อ function/ตัวแปรไม่มีใน scope. ดูบรรทัดแรกของ stack และ import/export. อย่าแก้ด้วย global ชั่วคราว. ตรวจด้วย reload แบบเปิด Console.
- **TypeError:** ค่าเป็น `null/undefined` หรือชนิดไม่ตรง. ตรวจ DOM ID, callback payload, Firestore field. อย่าครอบ `try/catch` เพื่อซ่อน. ทดสอบ empty data ด้วย.
- **Firebase `permission-denied`:** request ไม่ตรง rules. ตรวจ uid, role document, collection path, fields/diff และ query. อย่าเปิด rules เป็น `allow read, write: if true`. ใช้ emulator test.
- **Firestore write failure:** ดู error code และ payload; transaction/batch ต้องครบคู่. อย่าแยก atomic operation. ตรวจว่า UI ไม่รายงาน success ก่อน commit.
- **Missing DOM element:** ID เปลี่ยน/element ไม่มีใน route. ค้นทั้ง HTML/JS. อย่าเติม optional chaining ถ้า element จำเป็น; แก้ mapping.
- **Import/export error:** path, extension, exact export name หรือ syntax module ผิด. ดู Network 404 และ Console. อย่า copy function ซ้ำ.
- **Service Worker stale cache:** source ถูกแต่ browser เห็นเก่า. ตรวจ `CACHE_NAME`, unregister/clear site data ใน dev, hard reload. อย่าปรับ cache ระหว่างแก้ featureโดยไม่วางแผน.

## 16. Search Cheat Sheet

ใช้ Ctrl+Shift+F: `form-sub`, `addSubscription`, `recordSubscriptionPayment`, `archiveSubscription`, `customCategories`, `handleExportCSV`, `btn-split-bill`, `generatePromptPayPayload`, `support_cases`, `notes/initial`, `handleSupportCaseAction`, `data-change-role`, `updateUserRole`, `resolveUserAccess`, `canAccessView`, `premiumUntil`, `legacyPremium`, `onSnapshot`, `runTransaction`, `writeBatch`, `permission-denied`, `data-view`, `addEventListener`, `CACHE_NAME`.

## 17. Dangerous Areas

- `initAuthListener` → `handleAuthStateChange` → `showAppScreen`: race guard, cleanup และ role resolution เชื่อมกัน.
- `resolveUserAccess` และ `canAccessView`: กระทบทุก workspace และ legacy records.
- `recordSubscriptionPayment`: transaction ตรวจ expected billing date กัน double/stale payment.
- `archiveSubscription` (compatibility), Premium batches, Support atomic create: rules คาดว่าหลาย writes มาพร้อมกัน.
- Support listeners: ต้อง unsubscribe/replace; ซ้ำแล้ว UI และ reads เพิ่ม.
- `firestore.rules`: เป็น security boundary; query ต้องสอดคล้อง rules.
- `sw.js`: cache version/list อาจทำให้แก้แล้วเหมือนไม่เปลี่ยน.
- role/account protection: ห้ามลดสิทธิ์ตัวเองหรือแก้ Admin อื่นตาม rules.
- migration/legacy Premium: ลบก่อนข้อมูลเก่าถูกแปลงครบจะทำ access ผิด.

## 18. Current Legacy / Hidden Code

**LEGACY / HIDDEN — DO NOT USE FOR CURRENT 3-ROLE PRESENTATION**

Premium ยังอยู่ใน data/access/rules/back-office compatibility: `VALID_PLANS`, `resolveUserAccess`, `migrateLegacyPremiumUser`, purchase/override functions, `premium_purchases`, `admin_audit_logs`, Premium views/modals และ fields `plan`, `premiumPlan`, `premiumSince`, `premiumUntil`. Current UI hides upgrade (`updatePremiumUpgradeUI`) และ role badgeแสดงเพียง User/Staff/Admin. รักษาโค้ดนี้เพื่ออ่าน/migrate record เก่าและไม่ควรนำเสนอเป็น role ที่สี่.

Nested rule `users/{uid}/subscriptions/{id}` เป็น compatibility path; active database service ใช้ root `subscriptions`.

`archiveSubscription()`, `listenCanceledSubscriptions()`, `hardDeleteCanceledSubscription()` ยังอยู่ใน database service แต่ไม่มี current UI caller ที่ตรวจพบ; การลบรายการปัจจุบันเป็น `deleteSubscription()`.

## 19. Verification Checklist for Manual Changes

1. เปิด DevTools Console/Network ก่อนทดสอบ.
2. ทดสอบ role ที่เกี่ยวข้องและ direct URL hash.
3. ทำ create → reload → edit → reload → delete/archive เมื่อแตะ data flow.
4. ทดสอบ empty state และข้อมูลเก่า field ขาด.
5. ถ้าแตะ Support/rules ให้รัน Node tests และ Firestore emulator rules tests.
6. ถ้า browser แสดงของเก่า ตรวจ Service Worker/cache ก่อนสรุปว่าโค้ดผิด.

## Project Snapshot

- **Current HEAD:** `d7111bd3d65c63a730876ee53cc3d34bac41f856`
- **Branch:** `main` tracking `origin/main`
- **Current uncommitted files:** `index.html`, `js/main.js`, `style.css`, `sw.js`, `tests/admin-user-support.test.js`
- **Active role list:** `user`, `staff`, `admin`
- **JavaScript source files:** `js/main.js`, `js/pwa.js`, 8 filesใน `js/components/`, 3 filesใน `js/services/`, 3 filesใน `js/utils/`
- **Service Worker version:** `subtracker-v36`
- **Known legacy/hidden systems:** Premium plan/purchase/override/audit/migration; nested user subscription rule compatibility
- **Confirmed vs assumption:** collection/field/function/DOM/role statements above are confirmed from code. External exchange-rate availability, production-deployed rules, existing Firestore data quality และ whether all legacy records migrated cannot be determined from repository alone.

## Delivery Summary

- **A. Result:** สร้าง complete code map ภาษาไทยจาก current working tree โดยไม่แก้ application behavior
- **B. Guide Path:** `D:\subscription-tracker-github-sync\PROJECT_GUIDE.md`
- **C. Files Analyzed:** runtime/config/rules/manifests ทั้งหมดและ tests ที่เกี่ยวข้อง (ไม่รวม dependencies/generated log)
- **D. Functions Indexed:** service/component/utility functions ทั้งหมดและ named orchestration functions ใน `main.js`; anonymous handlers mapped under `setupEventListeners()`
- **E. Firestore Collections Indexed:** 8 active/compatibility collection paths รวม notes subcollection
- **F. DOM IDs Indexed:** views/forms/modals/control IDs สำคัญจัดกลุ่มใน DOM Map; full literal ID inventory ค้นได้โดย `id="` ใน `index.html`
- **G. Current Git State:** branch/HEAD/modified files ตาม Project Snapshot; ไม่ commit/push/deploy
- **H. Areas Codex Could Not Determine Reliably:** production rules deployment state, live Firestore documents/indexes, external API uptime, notification permission ของเครื่องผู้ใช้ และจำนวน legacy records ที่ยังไม่ migrate

