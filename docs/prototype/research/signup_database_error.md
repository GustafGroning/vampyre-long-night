# Research: Signup "Database error saving new user"

## Problem
Calling `supabase.auth.signUp()` returned HTTP 500 with:
```json
{"code":500,"error_code":"unexpected_failure","msg":"Database error saving new user"}
```

## Root Cause
The `handle_new_user()` trigger function lacked an explicit `SET search_path`.

When Supabase GoTrue inserts into `auth.users`, the trigger fires in the context of `supabase_auth_admin`. Even though the function is `SECURITY DEFINER` (runs as `postgres`), the **search_path** is inherited from the calling context, not the function owner. In the GoTrue/auth context, `public` was not reliably on the search_path, so `INSERT INTO profiles` failed with a "relation not found" error — which GoTrue wraps as the generic "Database error saving new user".

## Fix Applied
Added `SET search_path = public` to the function definition:

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public    -- THIS LINE WAS MISSING
AS $$
BEGIN
  INSERT INTO profiles (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$;
```

This was applied both to the live database and to the migration file `supabase/migrations/20260321000003_profiles_table.sql`.

## Verification
After the fix, signup via the API returned 200 and a profile row was auto-created in `profiles`.

## Other SECURITY DEFINER functions at risk
The same `SET search_path` is missing from several other SECURITY DEFINER functions in the codebase. These may not cause issues today (they're called from authenticated user context where search_path includes `public`), but it's best practice to add it. Affected files:

- `20260321000000_chat_system.sql` — 4 functions
- `20260321000001_chat_rls_patch.sql` — 1 function
- `20260321000002_chat_rls_recursion_fix.sql` — 1 function
- `20260321000004_chat_members_insert_fix.sql` — 1 function
- `20260322000000_campaign_setup_rls.sql` — 1 function
- `20260322000001_gm_flag_trigger.sql` — `set_gm_on_campaign_create()`
- `20260322000002_campaign_invites.sql` — 1 function
