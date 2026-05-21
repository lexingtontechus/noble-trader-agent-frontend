#!/usr/bin/env python3
"""
Noble Trader — Supabase Migration Runner
Executes all 18 consolidated migration files against a Supabase PostgreSQL database.

Usage:
  # With DATABASE_URL:
  DATABASE_URL="postgresql://postgres.PASSWORD@aws-0-us-west-1.pooler.supabase.com:6543/postgres" python3 scripts/run_migrations.py

  # With individual params:
  DB_HOST=aws-0-us-west-1.pooler.supabase.com DB_PORT=6543 DB_USER=postgres.pcvscowltlrxzgxjurcr DB_PASSWORD=xxx python3 scripts/run_migrations.py
"""

import os
import sys
import glob
import re
import time
from pathlib import Path

try:
    import psycopg2
    from psycopg2 import sql as pgsql
except ImportError:
    print("Installing psycopg2-binary...")
    os.system("pip3 install psycopg2-binary -q")
    import psycopg2
    from psycopg2 import sql as pgsql


# ── Configuration ──────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://pcvscowltlrxzgxjurcr.supabase.co")
PROJECT_REF = SUPABASE_URL.replace("https://", "").replace(".supabase.co", "")

MIGRATIONS_DIR = Path(__file__).parent.parent / "supabase" / "migrations"

# ── Connection helpers ─────────────────────────────────────────────────────
def get_connection():
    """Build a psycopg2 connection from environment variables or DATABASE_URL."""
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        print(f"  Using DATABASE_URL from environment")
        return psycopg2.connect(database_url)

    # Construct from individual params
    host = os.environ.get("DB_HOST", f"aws-0-us-west-1.pooler.supabase.com")
    port = int(os.environ.get("DB_PORT", "6543"))
    user = os.environ.get("DB_USER", f"postgres.{PROJECT_REF}")
    password = os.environ.get("DB_PASSWORD", "")
    dbname = os.environ.get("DB_NAME", "postgres")

    if not password:
        raise ValueError(
            "No database password provided. Set DATABASE_URL or DB_PASSWORD.\n"
            f"Try: DATABASE_URL='postgresql://postgres.{PROJECT_REF}:<PASSWORD>@{host}:{port}/{dbname}' python3 scripts/run_migrations.py"
        )

    return psycopg2.connect(
        host=host, port=port, user=user, password=password, dbname=dbname,
        connect_timeout=10, sslmode="require"
    )


def get_migration_files():
    """Return migration files sorted by their numeric prefix."""
    pattern = str(MIGRATIONS_DIR / "*.sql")
    files = sorted(glob.glob(pattern))
    if not files:
        print(f"ERROR: No migration files found in {MIGRATIONS_DIR}")
        sys.exit(1)
    return files


def ensure_migration_table(cur):
    """Create the migration tracking table if it doesn't exist."""
    cur.execute("""
        CREATE SCHEMA IF NOT EXISTS supabase_migrations;
        CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
            version TEXT PRIMARY KEY,
            name TEXT,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            execution_ms INTEGER,
            success BOOLEAN NOT NULL DEFAULT true
        );
    """)


def get_applied_migrations(cur):
    """Return set of already-applied migration versions."""
    cur.execute("SELECT version FROM supabase_migrations.schema_migrations WHERE success = true")
    return {row[0] for row in cur.fetchall()}


def extract_version(filepath):
    """Extract the numeric version prefix from a migration filename."""
    basename = os.path.basename(filepath)
    match = re.match(r"^(\d+)_", basename)
    return match.group(1) if match else basename


def extract_name(filepath):
    """Extract the human-readable name from a migration filename."""
    basename = os.path.basename(filepath)
    match = re.match(r"^\d+_(.+)\.sql$", basename)
    return match.group(1) if match else basename


def run_migration(cur, filepath, version, name):
    """Execute a single migration file and record the result."""
    sql_content = Path(filepath).read_text()
    start = time.time()
    try:
        # Execute the entire migration as a single transaction
        cur.execute(sql_content)
        elapsed_ms = int((time.time() - start) * 1000)
        # Record success
        cur.execute(
            """INSERT INTO supabase_migrations.schema_migrations (version, name, execution_ms, success)
               VALUES (%s, %s, %s, true)
               ON CONFLICT (version) DO UPDATE SET
                 applied_at = NOW(), execution_ms = %s, success = true, name = %s""",
            (version, name, elapsed_ms, elapsed_ms, name)
        )
        return True, elapsed_ms
    except Exception as e:
        elapsed_ms = int((time.time() - start) * 1000)
        # Record failure
        try:
            cur.execute(
                """INSERT INTO supabase_migrations.schema_migrations (version, name, execution_ms, success)
                   VALUES (%s, %s, %s, false)
                   ON CONFLICT (version) DO UPDATE SET
                     applied_at = NOW(), execution_ms = %s, success = false, name = %s""",
                (version, name, elapsed_ms, elapsed_ms, name)
            )
        except Exception:
            pass
        return False, str(e)


def main():
    print("=" * 70)
    print("  Noble Trader — Supabase Migration Runner")
    print("=" * 70)
    print(f"  Project ref:  {PROJECT_REF}")
    print(f"  Migrations:   {MIGRATIONS_DIR}")
    print()

    # Get migration files
    migration_files = get_migration_files()
    print(f"  Found {len(migration_files)} migration files")
    print()

    # Connect
    print("  Connecting to database...")
    try:
        conn = get_connection()
        conn.autocommit = True
        print("  Connected successfully!")
    except Exception as e:
        print(f"\n  ERROR: Could not connect to database: {e}")
        print()
        print("  To run migrations, you need the database password.")
        print("  You can find it in: Supabase Dashboard → Settings → Database")
        print()
        print("  Then run:")
        print(f'    DATABASE_URL="postgresql://postgres.{PROJECT_REF}:<PASSWORD>@aws-0-us-west-1.pooler.supabase.com:6543/postgres" \\')
        print(f"    python3 scripts/run_migrations.py")
        print()
        print("  OR paste the consolidated SQL into the Supabase Dashboard SQL Editor:")
        print("    https://supabase.com/dashboard/project/{}/sql".format(PROJECT_REF))
        print()
        print("  A consolidated SQL file has been generated at:")
        print("    supabase/migrations/00000000000000_consolidated.sql")
        sys.exit(1)

    cur = conn.cursor()

    # Ensure migration tracking table
    ensure_migration_table(cur)

    # Get already-applied migrations
    applied = get_applied_migrations(cur)
    print(f"  Already applied: {len(applied)} migrations")
    if applied:
        for v in sorted(applied):
            print(f"    - {v}")
    print()

    # Run pending migrations
    pending = []
    for filepath in migration_files:
        version = extract_version(filepath)
        name = extract_name(filepath)
        if version not in applied:
            pending.append((filepath, version, name))

    if not pending:
        print("  All migrations already applied! Nothing to do.")
        cur.close()
        conn.close()
        return

    print(f"  Pending migrations: {len(pending)}")
    for filepath, version, name in pending:
        print(f"    - {version}: {name}")
    print()

    # Execute each pending migration
    success_count = 0
    fail_count = 0
    for filepath, version, name in pending:
        print(f"  Running {version}: {name}...", end=" ", flush=True)
        success, result = run_migration(cur, filepath, version, name)
        if success:
            print(f"OK ({result}ms)")
            success_count += 1
        else:
            print(f"FAILED")
            print(f"    Error: {result}")
            fail_count += 1
            # Continue with remaining migrations (some might succeed independently)

    print()
    print("=" * 70)
    print(f"  Results: {success_count} succeeded, {fail_count} failed")
    print("=" * 70)

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
