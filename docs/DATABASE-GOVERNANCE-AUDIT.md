# Database Governance Audit

Scope: Supabase PostgreSQL for `ai-essay-editor` / `shenxiang.school`.

Audit date: 2026-05-14.

This document is an operational map for keeping the database orderly, secure, and maintainable. It intentionally separates observed facts from recommended changes. Do not run hardening SQL directly in production without checking the matching application code paths first.

## Current Inventory

Public schema contains 23 tables and 1 view.

### Core Product Data

| Area | Tables | Notes |
|---|---|---|
| Chat history | `chat_sessions`, `chat_messages` | Largest user-facing dataset. Current RLS policies are broad and should be tightened with application compatibility checks. |
| AI task tracing | `ai_task_runs` | Used by Dify/OpenClaw/image task tracking. RLS allows users to select own rows. |
| Credits and billing | `user_credits`, `credit_transactions`, `orders`, `credit_adjustments` | Business critical. Do not mutate without ledger reconciliation. |
| Referrals and sharing | `referral_codes`, `referrals`, `shared_content`, `share_reward_claims` | Contains deliberately public share/read flows, but update/write policies need staged review. |
| Profiles | `user_profiles` | Currently broad read/write. Needs stricter owner/service-role split. |
| Legacy essay data | `essay_reviews`, `submissions` | Currently permissive policies. Confirm whether still used before changing or archiving. |
| Admin audit/auth | `admin_tokens`, `admin_actions`, `admin_users_view` | Server-only intent. RLS/policies should be service-role only. |
| Learning system | `user_files`, `user_progress`, `learning_sessions`, `flashcards`, `mistake_book`, `teacher_agents`, `teacher_students` | Created/verified on 2026-05-14. RLS is enabled with owner/teacher policies. |

### Table Size Snapshot

Largest tables by total size:

| Table | Approx rows | Total size | RLS |
|---|---:|---:|---|
| `chat_messages` | 8452 | 16 MB | on |
| `ai_task_runs` | 1365 | 5704 kB | on |
| `shared_content` | 164 | 1720 kB | on |
| `credit_transactions` | 2875 | 744 kB | on |
| `chat_sessions` | 3311 | 712 kB | on |

The database is not large. Current risk is governance/security drift, not storage pressure.

## Security Findings

### High Priority

1. Database password was pasted into chat during operations.
   - Treat it as exposed.
   - Reset the Supabase database password after completing any immediate migration work.
   - Store future DB URLs only in a local secret file such as `~/.shenxiang-secrets/supabase-database-url` with `chmod 600`, or in a password manager.

2. Several public policies are too broad for enterprise posture:
   - `chat_sessions`: policy `Allow all access` uses `USING (true)` for all commands.
   - `chat_messages`: policy `Allow all access` uses `USING (true)` for all commands.
   - `user_credits`: policy `Allow public read/write credits` allows all commands with `true`.
   - `user_profiles`: policy `Allow public read/write profiles` allows all commands with `true`.
   - `submissions`: policy `Public Access` allows all commands with `true`.
   - `essay_reviews`: public select/insert policies are broad.
   - `shared_content`: `Anyone can update view count` currently allows public update broadly, not only `view_count`.
   - `referral_codes` and `referrals`: service-role policies are named as service-role but use public role with `true`.

3. Server-only admin tables have RLS disabled:
   - `admin_tokens`
   - `admin_actions`
   - `credit_adjustments`

   The app uses these through the server-side Supabase admin client, so enabling RLS and service-role-only policies should be feasible, but verify admin login and adjustment flows first.

### Medium Priority

1. Foreign-key columns without an obvious leading-column index:
   - `chat_messages.session_id`
   - `credit_transactions.order_id`
   - `flashcards.source_file_id`
   - `teacher_agents.teacher_id`

   Some of these are low-volume now, but adding indexes is safe and improves delete/join behavior.

2. Redundant exact-column indexes:
   - `admin_tokens_token_key` and `idx_admin_tokens_token`
   - `referral_codes_code_key` and `idx_referral_codes_code`
   - `referral_codes_user_id_key` and `idx_referral_codes_user_id`
   - `shared_content_share_id_key` and `idx_shared_content_share_id`
   - `teacher_agents_share_code_key` and `idx_teacher_agents_share`

   Do not drop immediately if query plans depend on partial predicates. Review one by one.

3. Tables that likely mutate but lack `updated_at`:
   - `chat_sessions`
   - `chat_messages`
   - `credit_transactions`
   - `flashcards`
   - `learning_sessions`
   - `mistake_book`
   - `shared_content`
   - `teacher_agents`
   - `teacher_students`
   - `user_profiles`

   This is not urgent. Add `updated_at` only when the code actually updates those rows.

## Recommended Enterprise Grouping

Use these ownership boundaries in docs, migrations, and future code reviews:

| Domain | Tables | Access pattern |
|---|---|---|
| Identity/profile | `user_profiles`, `user_credits` | User can read own; writes through server except safe profile updates. |
| Billing ledger | `orders`, `credit_transactions`, `credit_adjustments` | Server/service-role only for writes; users read own orders/transactions. |
| Chat | `chat_sessions`, `chat_messages` | User owns sessions; messages inherit session ownership. |
| AI operations | `ai_task_runs` | Server writes; users read own traces. |
| Sharing/referral | `shared_content`, `share_reward_claims`, `referral_codes`, `referrals` | Public reads only where product requires; writes should be server-mediated or tightly scoped. |
| Learning | `user_files`, `user_progress`, `learning_sessions`, `flashcards`, `mistake_book` | User owns rows. |
| Teacher classroom | `teacher_agents`, `teacher_students` | Teacher owns, student can read own binding, public can read published agents. |
| Admin | `admin_tokens`, `admin_actions`, `admin_users_view` | Service-role only. |
| Legacy/review | `essay_reviews`, `submissions` | Confirm usage, then harden or quarantine. |

## Execution Plan

### Phase 0: Secret Hygiene

- Reset the exposed database password in Supabase.
- Store future connection strings outside the repo.
- Never commit `.env.production`, database URLs, service role keys, or raw passwords.

### Phase 1: Low-Risk Hardening

Safe candidates after quick smoke tests:

- Enable RLS and service-role-only policies on `admin_tokens`, `admin_actions`, `credit_adjustments`.
- Add missing FK indexes:
  - `idx_chat_messages_session_id`
  - `idx_credit_transactions_order_id`
  - `idx_flashcards_source_file_id`
  - `idx_teacher_agents_teacher`

### Phase 2: App-Compatible RLS Refactor

Requires code review and tests:

- Replace `chat_sessions` broad policy with owner-based policies.
- Replace `chat_messages` broad policy with session-owner checks.
- Replace `user_credits` broad policy with user read only plus service-role writes.
- Replace `user_profiles` broad policy with owner read/update/insert plus service-role access.
- Restrict `shared_content` update to either server-only or view-count-specific RPC.

### Phase 3: Cleanup and Standardization

- Remove redundant indexes after verifying query plans.
- Decide whether `submissions` and `essay_reviews` are active, legacy, or archival.
- Add schema comments to all business-critical tables.
- Add a quarterly `pg_dump --schema-only` snapshot and restore drill SOP.

## Verification Queries

Use these after each phase:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

```sql
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

```sql
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

```sql
SELECT 'user_credits' AS table_name, count(*) AS row_count FROM public.user_credits
UNION ALL
SELECT 'credit_transactions', count(*) FROM public.credit_transactions
UNION ALL
SELECT 'orders', count(*) FROM public.orders
UNION ALL
SELECT 'chat_sessions', count(*) FROM public.chat_sessions
UNION ALL
SELECT 'chat_messages', count(*) FROM public.chat_messages
ORDER BY table_name;
```
