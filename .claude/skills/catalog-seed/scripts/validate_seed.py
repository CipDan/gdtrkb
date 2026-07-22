#!/usr/bin/env python3
"""
validate_seed.py — referential-integrity checks for the GDTRKB catalog seed.

Checks (all offline, no database needed):
  * every slug referenced in a `(SELECT id FROM <table> WHERE slug='…')`
    subquery resolves to a row DEFINED in the same file
    (tool / platform / language / area_of_use / game);
  * no duplicate slug definitions in any reference table;
  * tool_relationship: no self-loops, no duplicate (source, target, type);
  * tool_area_of_use: no tool tagged both a parent area and its child
    (the parent→child map is derived from the file, not hardcoded);
  * tool_platform: no duplicate (tool, platform, role);
  * single quotes are balanced (respecting '' escaping) and BEGIN;/COMMIT; exist.

Usage:
    python3 validate_seed.py [path-to-seed.sql]      # default: db/02_seed.sql

Exit code 0 = clean, 1 = problems found (printed to stdout).
"""

import re
import sys

DEFAULT_PATH = "db/02_seed.sql"


def strip_line_comments(sql: str) -> str:
    """Remove `-- …` comments so apostrophes in comments don't skew parsing."""
    return "\n".join(re.sub(r"--.*$", "", line) for line in sql.splitlines())


def split_statements(sql: str):
    """
    Split SQL text into statements at semicolons outside single-quoted strings.
    
    Parameters:
    	sql (str): SQL text to split, including SQL-style escaped apostrophes.
    
    Returns:
    	list[str]: Statements separated by semicolons, including any trailing non-empty text.
    """
    stmts, buf, in_str, i = [], [], False, 0
    while i < len(sql):
        c = sql[i]
        if c == "'":
            if in_str and i + 1 < len(sql) and sql[i + 1] == "'":
                buf.append("''")          # escaped quote inside a string
                i += 2
                continue
            in_str = not in_str
            buf.append(c)
        elif c == ";" and not in_str:
            stmts.append("".join(buf))
            buf = []
        else:
            buf.append(c)
        i += 1
    tail = "".join(buf)
    if tail.strip():
        stmts.append(tail)
    return stmts


def unescape(s: str) -> str:
    """
    Convert doubled single quotes to single quotes in a SQL string.
    
    Parameters:
    	s (str): The string containing SQL-style escaped apostrophes.
    
    Returns:
    	str: The string with escaped apostrophes converted to single quotes.
    """
    return s.replace("''", "'")


def statements_for(stmts, table: str):
    """Filter SQL statements that contain an INSERT INTO clause for the specified table.
    
    Parameters:
        stmts: SQL statements to search.
        table (str): Table name used in the INSERT INTO clause.
    
    Returns:
        list[str]: Statements containing an INSERT INTO clause for the specified table.
    """
    pat = re.compile(r"INSERT INTO " + re.escape(table) + r"(?![\w_])")
    return [s for s in stmts if pat.search(s)]


def defined_slugs(stmts, table: str):
    """
    Extracts slugs defined by INSERT statements for a table.
    
    Parameters:
        stmts: Parsed SQL statements.
        table (str): Table whose defined slugs should be extracted.
    
    Returns:
        list[str]: Slugs in row order, including duplicates.
    """
    out = []
    for s in statements_for(stmts, table):
        out += [unescape(m) for m in re.findall(r"\('((?:[^']|'')*?)'\s*,", s)]
    return out


def referenced_slugs(sql: str, table: str):
    """
    Extract the slugs referenced by subqueries for a table.
    
    Parameters:
    	sql (str): SQL text to search.
    	table (str): Table whose slug references should be extracted.
    
    Returns:
    	set[str]: Unique referenced slugs.
    """
    pat = r"FROM " + re.escape(table) + r" WHERE slug='((?:[^']|'')*?)'"
    return {unescape(m) for m in re.findall(pat, sql)}


def area_parent_map(stmts):
    """Build child_slug -> parent_slug from the area_of_use INSERT with parent_id."""
    mapping = {}
    row = re.compile(
        r"\('([a-z0-9_]+)'\s*,\s*'[^']*'\s*,\s*"
        r"\(SELECT id FROM area_of_use WHERE slug='([a-z0-9_]+)'\)"
    )
    for s in statements_for(stmts, "area_of_use"):
        for child, parent in row.findall(s):
            mapping[child] = parent
    return mapping


def main() -> int:
    """
    Validate the seed SQL file and report structural or referential-integrity problems.
    
    The file path is read from the first command-line argument, or defaults to
    `DEFAULT_PATH`. Returns an error status if the file cannot be read or any
    validation checks fail.
    
    Returns:
    	int: `0` if all checks pass, `1` otherwise.
    """
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATH
    try:
        raw = open(path, encoding="utf-8").read()
    except OSError as e:
        print(f"Cannot read {path}: {e}")
        return 1

    nocomment = strip_line_comments(raw)
    stmts = split_statements(nocomment)
    errors = []

    # --- defined reference slugs (+ duplicate detection) ---------------------
    defined = {}
    for table in ("tool", "platform", "language", "game"):
        slugs = defined_slugs(stmts, table)
        dups = {s for s in slugs if slugs.count(s) > 1}
        if dups:
            errors.append(f"Duplicate {table} slug(s): {sorted(dups)}")
        defined[table] = set(slugs)

    area_slugs = []
    for s in statements_for(stmts, "area_of_use"):
        area_slugs += re.findall(r"\('([a-z0-9_]+)'\s*,", s)
    area_dups = {s for s in area_slugs if area_slugs.count(s) > 1}
    if area_dups:
        errors.append(f"Duplicate area_of_use slug(s): {sorted(area_dups)}")
    defined["area_of_use"] = set(area_slugs)

    # --- referenced slugs must exist -----------------------------------------
    for table in ("tool", "platform", "language", "area_of_use", "game"):
        missing = referenced_slugs(nocomment, table) - defined[table]
        if missing:
            errors.append(f"Undefined {table} slug(s) referenced: {sorted(missing)}")

    # --- tool_relationship: self-loops + duplicates --------------------------
    rel_rows = []
    for st in statements_for(stmts, "tool_relationship"):
        rel_rows += re.findall(
            r"\(SELECT id FROM tool WHERE slug='((?:[^']|'')*?)'\)\s*,\s*"
            r"\(SELECT id FROM tool WHERE slug='((?:[^']|'')*?)'\)\s*,\s*"
            r"'([A-Z_]+)'",
            st,
        )
    seen = set()
    for s, t, ty in rel_rows:
        s, t = unescape(s), unescape(t)
        if s == t:
            errors.append(f"Self-loop relationship: {s} {ty}")
        if (s, t, ty) in seen:
            errors.append(f"Duplicate relationship: {s} -> {t} {ty}")
        seen.add((s, t, ty))

    # --- tool_area_of_use: no parent + child on the same tool ----------------
    parent = area_parent_map(stmts)
    tau_rows = []
    for st in statements_for(stmts, "tool_area_of_use"):
        tau_rows += re.findall(
            r"\(SELECT id FROM tool WHERE slug='((?:[^']|'')*?)'\)\s*,\s*"
            r"\(SELECT id FROM area_of_use WHERE slug='([a-z0-9_]+)'\)",
            st,
        )
    by_tool = {}
    for tool, area in tau_rows:
        by_tool.setdefault(unescape(tool), set()).add(area)
    for tool, areas in by_tool.items():
        for a in areas:
            if parent.get(a) in areas:
                errors.append(
                    f"Tool '{tool}' tagged parent '{parent[a]}' AND child '{a}'"
                )

    # --- tool_platform: duplicate (tool, platform, role) ---------------------
    tp_rows = []
    for st in statements_for(stmts, "tool_platform"):
        tp_rows += re.findall(
            r"\(SELECT id FROM tool WHERE slug='((?:[^']|'')*?)'\)\s*,\s*"
            r"\(SELECT id FROM platform WHERE slug='([a-z0-9-]+)'\)\s*,\s*"
            r"'([A-Z_]+)'",
            st,
        )
    seen = set()
    for tool, plat, role in tp_rows:
        key = (unescape(tool), plat, role)
        if key in seen:
            errors.append(f"Duplicate tool_platform row: {key}")
        seen.add(key)

    # --- structural sanity ---------------------------------------------------
    if "BEGIN;" not in raw or "COMMIT;" not in raw:
        errors.append("Missing BEGIN; / COMMIT; — the file must be one transaction")
    for i, line in enumerate(nocomment.splitlines(), 1):
        if line.replace("''", "").count("'") % 2:
            errors.append(f"Unbalanced quote on line {i}: {line.strip()[:70]}")

    # --- report --------------------------------------------------------------
    print(
        f"{path}: tools={len(defined['tool'])} platforms={len(defined['platform'])} "
        f"languages={len(defined['language'])} areas={len(defined['area_of_use'])} "
        f"games={len(defined['game'])}"
    )
    if errors:
        print(f"\nFAILED — {len(errors)} problem(s):")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("OK — all referential-integrity checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
