#!/usr/bin/env python3
"""Diff the running server against app2/mcp.py + mcp_backend.py.

This is the parity check, not part of serving: run it from the project root
while `npm start` is up.

    /Users/loklok/.venvs/bible-mcp/bin/python scripts/reference-diff.py

It loads the site's own data and MCP core, asks both servers the same
questions, and reports the first differing path per call. An answer with
sources/credit/data_version equal is expected to match whole.
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent
SITE_ROOT = PROJECT.parents[1]
sys.path.insert(0, str(SITE_ROOT / "app2"))
sys.path.insert(0, str(SITE_ROOT / "src"))

import server  # noqa: E402
import mcp  # noqa: E402
import mcp_backend  # noqa: E402

URL = "http://127.0.0.1:3000/mcp"

CALLS = [
    ("start", {}),
    ("search", {"query": "David"}),
    ("search", {"query": "temptation"}),
    ("search", {"query": "Matt 4:4"}),
    ("fetch", {"id": "card:david"}),
    ("fetch", {"id": "card:jesus"}),
    ("fetch", {"id": "card:event_jesus_temptation"}),
    ("fetch", {"id": "card:event_creation_of_heavens_and_earth"}),
    ("fetch", {"id": "card:moses"}),
    ("fetch", {"id": "verse:Matt.4.4"}),
    ("fetch", {"id": "verse:John.3.16"}),
    ("fetch", {"id": "verse:Isa.53.7"}),
    ("fetch", {"id": "word:H8322"}),
    ("fetch", {"id": "word:G26"}),
    ("fetch", {"id": "theme:creation"}),
    ("fetch", {"id": "question:baptism"}),
    ("fetch", {"id": "relation:quotes"}),
    ("fetch", {"id": "kind:person"}),
    ("get_verse", {"ref": "Gen 1:1"}),
    ("get_word", {"strong": "H430"}),
    ("get_relations", {"id": "card:god"}),
    ("get_relations", {"id": "card:jesus", "kind": "father_of"}),
]


def post(body):
    req = urllib.request.Request(
        URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": "2025-06-18",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        raw = r.read().decode("utf-8")
    for block in raw.split("\n\n"):
        for line in block.split("\n"):
            if line.startswith("data: "):
                return json.loads(line[6:])
    return json.loads(raw)


def remote(name, args):
    got = post({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                "params": {"name": name, "arguments": args}})
    return got.get("result", {}).get("structuredContent")


def first_diff(a, b, path="$"):
    if type(a) is not type(b):
        return f"{path}: type {type(a).__name__} != {type(b).__name__} ({a!r} != {b!r})"
    if isinstance(a, dict):
        if set(a) != set(b):
            return f"{path}: keys {sorted(set(a) - set(b))} only here, {sorted(set(b) - set(a))} only there"
        for k in a:
            d = first_diff(a[k], b[k], f"{path}.{k}")
            if d:
                return d
        return None
    if isinstance(a, list):
        if len(a) != len(b):
            return f"{path}: length {len(a)} != {len(b)}"
        for i, (x, y) in enumerate(zip(a, b)):
            d = first_diff(x, y, f"{path}[{i}]")
            if d:
                return d
        return None
    if a != b:
        return f"{path}: {a!r} != {b!r}"
    return None


def main():
    d = server.load()
    b = mcp_backend.Backend(server, d)
    bad = 0
    for name, args in CALLS:
        ref = mcp.handle({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                          "params": {"name": name, "arguments": args}}, b)
        ref = (ref or {}).get("result")
        got = remote(name, args)
        label = f"{name} {json.dumps(args, ensure_ascii=False)}"
        if bool((ref or {}).get("isError")) != bool((got or {}).get("isError")):
            print(f"DIFF {label}: isError {ref.get('isError')} != {got.get('isError')}")
            bad += 1
            continue
        diff = first_diff(ref.get("structuredContent"), got)
        if diff:
            print(f"DIFF {label}\n     {diff}")
            bad += 1
        else:
            print(f"ok   {label}")
    print(f"\n{len(CALLS) - bad}/{len(CALLS)} identical")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
