# Xondhan Library Management System

Secure rebuild of the library app. Stack: static frontend on **Netlify** + **Supabase** (Postgres + Auth), all on free tiers.

> Note: Netlify cannot run PHP, so this version uses Supabase for the backend instead of PHP.

## What changed (security fixes)

| Old problem | Fix |
|---|---|
| Admin password `admin123` in JS, stored in localStorage | Real Supabase Auth (hashed passwords), admin-only via `admins` table |
| Fake on-screen OTP "verification" | Removed |
| All data in browser localStorage (editable by anyone) | Postgres database with Row Level Security |
| XSS via `innerHTML` with book/student names | All UI built with safe DOM text nodes; strict CSP |
| Personal phone/email/roll no. hardcoded in page | Removed |
| Stock changes done in browser (race conditions, tampering) | Atomic SQL functions: `issue_book`, `return_book`, `restock_book` |
| CSV/Excel formula injection, no import limits | Cells sanitized on export; import size/row/length limits |
| No session timeout / brute-force protection | 30-min idle logout, login lockout, Supabase rate limits |
| Two different SheetJS versions, no headers | One pinned version + security headers in `netlify.toml` |

## Features kept
Login, dashboard, books (add/edit/delete/search, Excel import/export), issue and return, active borrowers with overdue status, stock (out/low/in + restock + log), history (Excel export), change password.

Removed: fake OTP, team credits/developer card, fake bulk restock, "clear all data", separate members list.

## Setup (free)

1. Create a project at https://supabase.com.
2. SQL Editor → paste and run `supabase/scheme.sql`.
3. Authentication → Users → **Add user** (your admin email + strong password, auto-confirm).
4. SQL Editor → run (use your email):
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'YOUR_ADMIN_EMAIL';
   ```
5. Authentication → Providers → Email → turn **off** "Allow new users to sign up".
6. Project Settings → API → copy **Project URL** and **anon public** key into `public/config.js`. Never use the `service_role` key.
7. Push this folder to GitHub, then Netlify → Add new site → Import from Git (publish directory `public`, no build command). Or drag-drop the folder at https://app.netlify.com/drop.
8. Supabase → Authentication → URL Configuration → set Site URL to your Netlify URL.

## Notes
- Back up regularly with the Export buttons.
- Supabase free projects pause after about a week of inactivity; opening the dashboard resumes them.
