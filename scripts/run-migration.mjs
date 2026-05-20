/**
 * Run Supabase migration via the pooler connection (IPv4).
 * Usage: node scripts/run-migration.mjs
 */

import { Client } from 'pg';
import fs from 'fs';
import crypto from 'crypto';
import dns from 'dns';

// Force IPv4
dns.setDefaultResultOrder('ipv4first');

// Config
const POOLER_HOST = 'aws-0-us-west-1.pooler.supabase.com';
const POOLER_PORT = 6543;
const DB_USER = 'postgres.pcvscowltlrxzgxjurcr';
const DB_PASS = '5QrrXqRyvXC792V7';
const DB_NAME = 'postgres';

// Generate encryption key
const ENCRYPTION_KEY = crypto.randomBytes(24).toString('base64').slice(0, 32);

async function run() {
  console.log('=== Noble Trader Supabase Migration ===\n');

  // Resolve pooler IP
  const ips = await dns.promises.resolve4(POOLER_HOST);
  const host = ips[0];
  console.log(`Pooler IP: ${host}`);

  const client = new Client({
    host,
    port: POOLER_PORT,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASS,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL!\n');

    // Step 1: Create pgcrypto extension
    console.log('1. Creating pgcrypto extension...');
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public');
      console.log('   ✓ pgcrypto extension ready\n');
    } catch (e) {
      console.log('   ⚠ pgcrypto may already exist:', e.message, '\n');
    }

    // Step 2: Set encryption key
    console.log('2. Setting app.encryption_key...');
    // The pooler uses session mode, so we set it as a session parameter
    await client.query(`SET app.encryption_key = '${ENCRYPTION_KEY}'`);
    // Also set it at the database level for persistent access
    try {
      await client.query(`ALTER DATABASE postgres SET app.encryption_key = '${ENCRYPTION_KEY}'`);
      console.log(`   ✓ Database-level key set: ${ENCRYPTION_KEY.slice(0, 8)}...\n`);
    } catch (e) {
      console.log(`   ⚠ Could not set database-level key (may need superuser): ${e.message}`);
      console.log('   ✓ Session-level key is set for this migration\n');
    }

    // Step 3: Create helper functions
    console.log('3. Creating helper functions...');

    await client.query(`
      CREATE OR REPLACE FUNCTION public.set_updated_at()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$;
    `);
    console.log('   ✓ set_updated_at()');

    await client.query(`
      CREATE OR REPLACE FUNCTION public.encrypt_credential(plain_text TEXT)
      RETURNS BYTEA
      LANGUAGE plpgsql
      STABLE
      AS $$
      DECLARE
        enc_key TEXT;
      BEGIN
        enc_key := current_setting('app.encryption_key', true);
        IF enc_key IS NULL OR enc_key = '' THEN
          RAISE EXCEPTION 'app.encryption_key is not set';
        END IF;
        RETURN pgp_sym_encrypt(plain_text, enc_key);
      END;
      $$;
    `);
    console.log('   ✓ encrypt_credential()');

    await client.query(`
      CREATE OR REPLACE FUNCTION public.decrypt_credential(cipher_text BYTEA)
      RETURNS TEXT
      LANGUAGE plpgsql
      STABLE
      AS $$
      DECLARE
        enc_key TEXT;
      BEGIN
        enc_key := current_setting('app.encryption_key', true);
        IF enc_key IS NULL OR enc_key = '' THEN
          RAISE EXCEPTION 'app.encryption_key is not set';
        END IF;
        RETURN pgp_sym_decrypt(cipher_text, enc_key);
      END;
      $$;
    `);
    console.log('   ✓ decrypt_credential()\n');

    // Step 4: Create user_credentials table
    console.log('4. Creating user_credentials table...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.user_credentials (
          id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          clerk_user_id         TEXT        NOT NULL,
          credential_type       TEXT        NOT NULL CHECK (credential_type IN ('paper', 'live')),
          api_key_encrypted     BYTEA       NOT NULL,
          secret_key_encrypted  BYTEA       NOT NULL,
          is_valid              BOOLEAN     DEFAULT true,
          last_validated_at     TIMESTAMPTZ,
          created_at            TIMESTAMPTZ DEFAULT now(),
          updated_at            TIMESTAMPTZ DEFAULT now(),
          CONSTRAINT uq_user_credential_type UNIQUE (clerk_user_id, credential_type)
        );
      `);
      console.log('   ✓ Table created');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('   ✓ Table already exists');
      } else throw e;
    }

    // Trigger
    await client.query(`
      DROP TRIGGER IF EXISTS trg_user_credentials_updated_at ON public.user_credentials;
      CREATE TRIGGER trg_user_credentials_updated_at
        BEFORE UPDATE ON public.user_credentials
        FOR EACH ROW
        EXECUTE FUNCTION public.set_updated_at();
    `);

    // Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_credentials_clerk_user_id ON public.user_credentials (clerk_user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_credentials_credential_type ON public.user_credentials (credential_type)`);
    console.log('   ✓ Indexes + trigger\n');

    // Enable RLS
    console.log('5. Setting up RLS for user_credentials...');
    await client.query(`ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY`);

    // Drop existing policies (safe to re-run)
    const { rows: existingPolicies } = await client.query(`
      SELECT policyname FROM pg_policies WHERE tablename = 'user_credentials'
    `);
    for (const p of existingPolicies) {
      await client.query(`DROP POLICY IF EXISTS "${p.policyname}" ON public.user_credentials`);
    }

    // Service role full access (our app uses service role key)
    await client.query(`
      CREATE POLICY "Service role full access on user_credentials"
      ON public.user_credentials
      FOR ALL
      USING (true)
      WITH CHECK (true);
    `);
    console.log('   ✓ RLS enabled + service role policy\n');

    // Step 5: Create user_subscriptions table
    console.log('6. Creating user_subscriptions table...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.user_subscriptions (
          id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          clerk_user_id           TEXT        NOT NULL UNIQUE,
          plan                    TEXT        NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium', 'institutional')),
          plan_status             TEXT        NOT NULL DEFAULT 'active' CHECK (plan_status IN ('active', 'past_due', 'cancelled', 'trialing')),
          helio_subscription_id   TEXT,
          current_period_start    TIMESTAMPTZ,
          current_period_end      TIMESTAMPTZ,
          cancel_at_period_end    BOOLEAN     DEFAULT false,
          trial_ends_at           TIMESTAMPTZ,
          created_at              TIMESTAMPTZ DEFAULT now(),
          updated_at              TIMESTAMPTZ DEFAULT now()
        );
      `);
      console.log('   ✓ Table created');
    } catch (e) {
      if (e.message.includes('already exists')) console.log('   ✓ Table already exists');
      else throw e;
    }

    await client.query(`
      DROP TRIGGER IF EXISTS trg_user_subscriptions_updated_at ON public.user_subscriptions;
      CREATE TRIGGER trg_user_subscriptions_updated_at
        BEFORE UPDATE ON public.user_subscriptions
        FOR EACH ROW
        EXECUTE FUNCTION public.set_updated_at();
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_subscriptions_clerk_user_id ON public.user_subscriptions (clerk_user_id)`);

    // RLS for user_subscriptions
    await client.query(`ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY`);
    const { rows: subPolicies } = await client.query(`SELECT policyname FROM pg_policies WHERE tablename = 'user_subscriptions'`);
    for (const p of subPolicies) {
      await client.query(`DROP POLICY IF EXISTS "${p.policyname}" ON public.user_subscriptions`);
    }
    await client.query(`
      CREATE POLICY "Service role full access on user_subscriptions"
      ON public.user_subscriptions
      FOR ALL
      USING (true)
      WITH CHECK (true);
    `);
    console.log('   ✓ Indexes + trigger + RLS\n');

    // Step 6: Create user_onboarding table
    console.log('7. Creating user_onboarding table...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.user_onboarding (
          id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          clerk_user_id           TEXT        NOT NULL UNIQUE,
          onboarding_complete     BOOLEAN     DEFAULT false,
          current_step            INTEGER     DEFAULT 0,
          paper_keys_configured   BOOLEAN     DEFAULT false,
          live_keys_configured    BOOLEAN     DEFAULT false,
          completed_at            TIMESTAMPTZ,
          created_at              TIMESTAMPTZ DEFAULT now(),
          updated_at              TIMESTAMPTZ DEFAULT now()
        );
      `);
      console.log('   ✓ Table created');
    } catch (e) {
      if (e.message.includes('already exists')) console.log('   ✓ Table already exists');
      else throw e;
    }

    await client.query(`
      DROP TRIGGER IF EXISTS trg_user_onboarding_updated_at ON public.user_onboarding;
      CREATE TRIGGER trg_user_onboarding_updated_at
        BEFORE UPDATE ON public.user_onboarding
        FOR EACH ROW
        EXECUTE FUNCTION public.set_updated_at();
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_onboarding_clerk_user_id ON public.user_onboarding (clerk_user_id)`);

    // RLS for user_onboarding
    await client.query(`ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY`);
    const { rows: obPolicies } = await client.query(`SELECT policyname FROM pg_policies WHERE tablename = 'user_onboarding'`);
    for (const p of obPolicies) {
      await client.query(`DROP POLICY IF EXISTS "${p.policyname}" ON public.user_onboarding`);
    }
    await client.query(`
      CREATE POLICY "Service role full access on user_onboarding"
      ON public.user_onboarding
      FOR ALL
      USING (true)
      WITH CHECK (true);
    `);
    console.log('   ✓ Indexes + trigger + RLS\n');

    // Step 7: Verify everything
    console.log('8. Verifying migration...\n');

    const { rows: tables } = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('user_credentials', 'user_subscriptions', 'user_onboarding')
      ORDER BY tablename;
    `);
    console.log('Tables:');
    tables.forEach(r => console.log(`  ✓ ${r.tablename}`));

    const { rows: funcs } = await client.query(`
      SELECT routine_name FROM information_schema.routines
      WHERE routine_schema = 'public'
      AND routine_name IN ('encrypt_credential', 'decrypt_credential', 'set_updated_at')
      ORDER BY routine_name;
    `);
    console.log('\nFunctions:');
    funcs.forEach(r => console.log(`  ✓ ${r.routine_name}`));

    // Test encryption round-trip
    console.log('\n9. Testing encryption round-trip...');
    const { rows: encTest } = await client.query(`SELECT encrypt_credential('test_api_key_PK12345') AS encrypted`);
    const encrypted = encTest[0].encrypted;
    console.log(`   Encrypted: ${Buffer.from(encrypted).toString('base64').slice(0, 30)}...`);

    const { rows: decTest } = await client.query(`SELECT decrypt_credential($1) AS decrypted`, [encrypted]);
    console.log(`   Decrypted: ${decTest[0].decrypted}`);

    if (decTest[0].decrypted === 'test_api_key_PK12345') {
      console.log('   ✓ Encryption round-trip SUCCESS!\n');
    } else {
      console.error('   ✗ Encryption round-trip FAILED!\n');
    }

    await client.end();

    console.log('=== Migration Complete ===\n');
    console.log(`SAVE THIS ENCRYPTION KEY (required for .env.local + Vercel):`);
    console.log(`SUPABASE_ENCRYPTION_KEY=${ENCRYPTION_KEY}\n`);

  } catch (err) {
    console.error('\nMigration failed:', err.message);
    try { await client.end(); } catch {}
    process.exit(1);
  }
}

run();
