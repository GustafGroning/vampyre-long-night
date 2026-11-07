# Vampire: The Long Night — Client Prototype

Functional prototype for testing the game flow: auth, map, action submission, round history.

## Quick Start

### 1. Set up Supabase

Create a Supabase project and run all the migration files from the `supabase/migrations/` directory in order (via the SQL editor or `supabase db reset`).

### 2. Configure env

```bash
cp .env.example .env
# Edit .env with your Supabase project URL and anon key
```

### 3. Seed test data

```bash
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SERVICE_KEY=your-service-role-key \
node scripts/seed.js
```

This creates 4 cities (London, Edinburgh, Birmingham, Dublin), 3 test players (password: `testpassword123`), minions, disciplines, artifacts, and city specials/problems.

### 4. Run

```bash
npm install
npm run dev
```

Sign in with `player1@test.com`, `player2@test.com`, or `player3@test.com`.
