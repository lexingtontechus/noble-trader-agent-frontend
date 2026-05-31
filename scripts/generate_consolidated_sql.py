#!/usr/bin/env python3
"""
Generates a single consolidated SQL file from all 18 migration files.
This file can be pasted directly into the Supabase Dashboard SQL Editor.
"""

import glob
import os
from pathlib import Path

MIGRATIONS_DIR = Path(__file__).parent.parent / "supabase" / "migrations"
OUTPUT_FILE = MIGRATIONS_DIR / "00000000000000_consolidated.sql"

def main():
    pattern = str(MIGRATIONS_DIR / "*.sql")
    files = sorted(f for f in glob.glob(pattern) if "consolidated" not in f)

    lines = []
    lines.append("-- ============================================================")
    lines.append("-- Noble Trader — Consolidated Migration Script")
    lines.append("-- Generated from 18 individual migration files.")
    lines.append("-- Paste this entire script into the Supabase Dashboard SQL Editor:")
    lines.append("--   https://supabase.com/dashboard/project/pcvscowltlrxzgxjurcr/sql")
    lines.append("-- ============================================================")
    lines.append("")

    for filepath in files:
        basename = os.path.basename(filepath)
        content = Path(filepath).read_text()
        lines.append(f"-- {'=' * 60}")
        lines.append(f"-- FILE: {basename}")
        lines.append(f"-- {'=' * 60}")
        lines.append(content)
        lines.append("")

    output = "\n".join(lines)
    OUTPUT_FILE.write_text(output)
    print(f"Generated: {OUTPUT_FILE}")
    print(f"Size: {len(output):,} characters")
    print(f"Files consolidated: {len(files)}")

if __name__ == "__main__":
    main()
