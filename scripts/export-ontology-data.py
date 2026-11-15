#!/usr/bin/env python3
"""Export the read-only data the bible-mcp server serves into ./ontology-data.

This script is NOT the server. It runs once, against the bibleontology-main
checkout, and uses the site's own functions (app2/server.py) as the oracle, so
the snapshot says exactly what the site says: the same entity groups, the same
hop rules' inputs, the same word cards' fields. The TypeScript server then
serves the snapshot, read-only, with no Python at run time.

    python3 scripts/export-ontology-data.py [--out ontology-data]

The export is deterministic apart from `generated_at` in meta.json.
"""

from __future__ import annotations

import argparse
import collections
import gzip
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent                       # loklok/bible-mcp
SITE_ROOT = PROJECT.parents[1]              # bibleontology-main

sys.path.insert(0, str(SITE_ROOT / "app2"))
sys.path.insert(0, str(SITE_ROOT / "src"))

import server  # noqa: E402
import mcp_backend as B  # noqa: E402

SITE = "https://bibleontology.org"
REF = re.compile(r"^\s*(\d?[A-Za-z]+)\s+(\d+):(\d+)")
MACULA_REF = re.compile(r"^(\w+)\.(\d+)\.(\d+)$")


def log(msg: str) -> None:
    print(msg, flush=True)


def write_json(path: Path, obj, *, gz: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if gz:
        with gzip.open(path, "wb", compresslevel=9) as f:
            f.write(raw)
    else:
        path.write_bytes(raw)
    log(f"  {path.name}: {len(raw) / 1e6:.1f} MB raw")


# --------------------------------------------------------------------- helpers
def verse_id(ref: str):
    m = REF.match(ref or "")
    return (m.group(1), int(m.group(2)), int(m.group(3))) if m else None


def target_of(d, ref: str):
    """A MACULA address ('Mat.4.4') as the site's verse key ('Matt.4.4'), or None.

    This is mcp_backend.Backend._from_macula, done once here so the TS server
    never needs the versification map.
    """
    try:
        got = server.bsb_ref(d, ref)
    except Exception:  # noqa: BLE001
        return None
    m = MACULA_REF.match(got or "")
    if not m:
        return None
    v = (server.MACULA_BACK.get(m.group(1), m.group(1)), int(m.group(2)), int(m.group(3)))
    return "%s.%d.%d" % v if v in d["verses"] else None


def later_manuscripts(d, key):
    """mcp_backend.Backend._later_manuscripts: a verse the Berean leaves empty."""
    try:
        ylt = json.loads((SITE_ROOT / "data" / "bible" / "later-manuscripts.ylt.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        ylt = {"note": "Not in the Berean text: the earliest manuscripts lack this verse.", "verses": {}}
    note = ylt.get("note") or ""
    got = (ylt.get("verses") or {}).get("%s.%d.%d" % key)
    return note + ((" Later manuscripts read (Young's Literal Translation, 1898): \"%s\"" % got) if got else "")


def verse_text(d, key):
    text = d["verses"].get(key) or ""
    return text if text.strip() else later_manuscripts(d, key)


# --------------------------------------------------------------- the entity card
def build_groups(d, eid, e):
    """The group block of api_entity, reduced to what mcp_backend._card reads.

    Kept in the same order and under the same category names: the MCP hop rules
    depend on "Story echoes", "Story told this way", "Role pattern", "Language"
    and on every other group's category not being one of those.
    """
    groups = collections.defaultdict(list)
    for r in d["rels"].get(eid, []):
        spec = d["cats"].get(r["type"], {})
        other = d["ents"].get(r["other"])
        label = r.get("label_out" if r["dir"] == "out" else "label_in") or server._rel_label(
            d, spec, r["type"], r["other"] if r["dir"] == "out" else eid, r["dir"] == "out")
        if r["type"] == "issues_from" and r["dir"] == "in" and e.get("type") == "place" \
                and other and other.get("type") in ("person", "group"):
            label = "is where they came from:"
        cat = spec.get("catlabel", "Other")
        ends = (eid, r["other"])
        if r["type"] == "spoken_in":
            cat = "Spoken in" if r["dir"] == "out" else (
                "Speech acts spoken in it" if r["other"].startswith("sact_") else "Messages spoken in it")
        elif r["type"] == "specializes" and any(x.startswith("msggroup_") for x in ends):
            cat = "Message group"
        elif r["type"] == "specializes" and any(x.startswith("sact") for x in ends):
            cat = "Speech act"
        elif any(x.startswith(("rolepat_", "rrow_", "rcell_")) for x in ends) \
                and r["type"] in ("instance_of", "part_of"):
            cat = "Role pattern"
        elif r["type"] == "specializes" and any(x.startswith("tpl_") for x in ends):
            cat = "Story told this way"
        elif r["type"] == "instance_of":
            if any(x.startswith("tpl_") for x in ends):
                cat = "Story told this way"
            elif any(x.startswith("tplstage_") for x in ends):
                cat = "Story stage"
        elif r["type"] == "part_of" and any(x.startswith("stage_") for x in ends):
            cat = "Story stage"
        claim = r.get("claimed_by")
        cby = d["ents"].get(claim) if claim else None
        doer = eid if r["dir"] == "out" else r["other"]
        if claim and cat not in server.CLAIM_STAYS and not (r["type"] in server.PERFORMATIVE and claim == doer):
            cat = "In someone's words"
        s_name, s_scope = server._scope_item(d, r, eid)
        item = {
            "label": label,
            "type": r["type"],
            "dir": r["dir"],
            "other": r["other"],
            "name": s_name or server._theme_merged_name(r, other) or (other["name"] if other else r["other"]),
            "otype": other["type"] if other else None,
            "refs": r["refs"][:4],
            "certainty": r.get("certainty"),
        }
        if claim:
            item["claimed_by_name"] = cby["name"] if cby else claim
        groups[cat].append(item)
    # a stage reaches its pattern through its story; a person reaches their role
    # patterns through their rows (api_entity, verbatim)
    ts = server.template_stage(d, eid)
    if ts:
        role = ts["pattern_kind"] == "Role pattern"
        groups["Role pattern" if role else "Story told this way"].append({
            "label": "a cell of the pattern" if role else "a stage of the pattern",
            "type": "instance_of", "dir": "out", "other": ts["pattern_id"],
            "name": f"{ts['pattern_kind']}: {ts['family_name']}", "otype": "pattern",
            "refs": [], "certainty": "implied"})
    for x in server.roles_for(d, eid):
        groups["Role pattern"].append({
            "label": "has a row in", "type": "instance_of", "dir": "out",
            "other": x["pattern_id"], "name": "Role pattern: " + x["pattern_name"],
            "otype": "pattern", "refs": [], "certainty": "implied" if x["given"] else "conjectured"})
    ordered = sorted(groups.items(), key=lambda kv: -len(kv[1]))
    return [{"category": k, "items": v} for k, v in ordered]


def export_entities(d, out: Path):
    log("entities …")
    tm = server._theme_map()
    by_node = tm.get("by_node") or {}
    by_theme = tm.get("_by") or {}
    events = server._events(d)["events"]
    ents = d["ents"]
    result = {}
    t0 = time.time()
    for n, (eid, e) in enumerate(ents.items(), 1):
        rec = {
            "name": e.get("name") or eid,
            "type": e.get("type"),
            "desc": e.get("desc"),
            "refs": (e.get("refs") or [])[:12],
            "aka": e.get("aka") or [],
        }
        if e.get("alias_of"):
            rec["alias_of"] = e["alias_of"]
            result[eid] = rec
            continue
        rec["groups"] = build_groups(d, eid, e)
        # person_card (and the deity plates, on the same path) sorts each row's
        # verses into the canon's order in place; mcp_backend reads refs[0], so
        # the snapshot must hold the sorted order.
        if e.get("type") == "person" or eid in server.DEITY_PLATES:
            for g in rec["groups"]:
                for it in g["items"]:
                    it["refs"] = sorted(
                        it.get("refs") or [],
                        key=lambda r: server._canon(server._site_span(d, r)),
                    )
        rec["mthemes"] = [
            {"theme": x["theme"], "title": server._title(by_theme[x["theme"]]["title"])}
            for x in by_node.get(eid, []) if x.get("theme") in by_theme
        ]
        if e.get("type") == "event":
            ev = events.get(eid)
            if ev:
                rec["event"] = {"within": ev.get("within") or [], "tellings": ev.get("tellings") or []}
                if not server.parable_card(d, eid):
                    card = server.event_card(d, eid, e, {})
                    if card:
                        rec["evcard"] = {
                            "cast": [{
                                "subjects": [{"id": s.get("id"), "name": s.get("name")}
                                             for s in (row.get("subjects") or []) if isinstance(s, dict)],
                                "verb": row.get("verb"),
                                "kind": row.get("kind"),
                                "object": {"id": (row.get("object") or {}).get("id"),
                                           "name": (row.get("object") or {}).get("name"),
                                           "type": (row.get("object") or {}).get("type")},
                                "cites": [{"go": c.get("go")} for c in (row.get("cites") or [])],
                                "certainty": row.get("certainty"),
                                "claimed_by": {"name": row["claimed_by"].get("name")}
                                if isinstance(row.get("claimed_by"), dict) else None,
                            } for row in (card.get("cast") or [])],
                            "quotes": [{
                                "from_go": q.get("from_go"), "to_go": q.get("to_go"),
                                "to_ref": q.get("to_ref"), "verb": q.get("verb"),
                                "speaker": q.get("speaker"),
                            } for q in (card.get("quotes") or [])],
                        }
        result[eid] = rec
        if n % 2000 == 0:
            log(f"    {n:,} / {len(ents):,}  ({time.time() - t0:.1f}s)")
    write_json(out / "entities.json", result)
    log(f"  entities done in {time.time() - t0:.1f}s")


# -------------------------------------------------------------- the verse links
def export_verse_links(d, out: Path):
    """Per verse: exactly the inputs mcp_backend._verse_hops reads, converted.

    editors / earlier / later / aligned (judged 'same' only) / allusions (the
    five kinds the MCP reads). Each target is already the site's verse key;
    an allusion carries `before` (canon order) so the label needs no canon map.
    """
    log("verse links …")
    pj = server._pair_judgments() or {}
    canons = server._MCANON
    links = {}
    t0 = time.time()
    all_refs = set(d["echoes"]) | set(d.get("aligned") or {})
    # editor notes and allusions can exist for verses with no echo row
    for ref in sorted(all_refs):
        site_ref = target_of(d, ref)          # the key the MCP's verse items use
        if not site_ref:
            continue
        got = d["echoes"].get(ref) or {}
        rec = {}
        notes = server.editor_notes(d, ref) or []
        eds = []
        for it in notes:
            tgt = target_of(d, it.get("eref") or it.get("ref") or "")
            if tgt:
                eds.append({"kind": it.get("kind"), "target": tgt})
        if eds:
            rec["editors"] = eds
        for bucket in ("earlier", "later"):
            rows = []
            for other, score, _shared in sorted(got.get(bucket) or [], key=lambda x: -x[1]):
                band, note = next((n, t) for lo, n, t in server.ECHO_BANDS if score >= lo)
                if band in ("possible", "faint"):
                    continue
                # _verse_hops reads `eref or ref` and _from_macula runs bsb_ref
                # on it: an already-BSB address is shifted a second time. Mirror
                # it exactly so the hop lands where the reference lands.
                try:
                    eref = server.bsb_ref(d, other)
                except Exception:  # noqa: BLE001
                    eref = other
                tgt = target_of(d, eref)
                if tgt:
                    rows.append({"target": tgt, "band": band, "band_note": note})
            if rows:
                rec[bucket] = rows
        judged = []
        seen_j = set()
        for other, r in (d.get("aligned") or {}).get(ref, {}).items():
            if r.get("score", 0) < server.ALIGN_MIN:
                continue
            # api_echoes marks a pair `judged` only inside `tier == "same"`; a
            # contrast is read as one promise said twice, never as "the same".
            if r.get("tier") != "same":
                continue
            if (r.get("force") or [None, None])[0] != (r.get("force") or [None, None])[1]:
                continue
            j = pj.get(tuple(sorted((ref, other))))
            if not j or j.get("verdict") != "same":
                continue
            tgt = target_of(d, other)
            if tgt and tgt not in seen_j:
                seen_j.add(tgt)
                judged.append({"target": tgt})
        if judged:
            rec["aligned"] = judged
        al = server.allusions_for(d, ref) or {}
        # Where the editors already link the two verses, api_echoes removes the
        # word allusion (its explanation joins their note instead). The MCP reads
        # only the allusion lists, so the removal is done here.
        if isinstance(al, dict) and al.get("words") and notes:
            def covered(xref):
                try:
                    k = server._vkey_macula(xref)
                    for e in notes:
                        lo = server._vkey_macula(e["ref"])
                        hi = server._vkey_macula(e["eend"]) if e.get("eend") else lo
                        if lo <= k <= hi:
                            return True
                except (KeyError, TypeError, ValueError):
                    pass
                return False
            al = dict(al, words=[x for x in al["words"] if not covered(x.get("ref") or "")])
        here = ref.split(".")
        try:
            mine = (canons.get(here[0], 99), int(here[1]), int(here[2]))
        except (IndexError, ValueError):
            mine = None
        allu = {}
        for kind in B.Backend.ALLUSION_KINDS:
            rows = []
            for it in (al.get(kind) or []) if isinstance(al, dict) else []:
                # `eref or ref`, as _verse_hops reads it: the BSB address first
                tgt = target_of(d, it.get("eref") or it.get("ref") or "")
                if not tgt:
                    continue
                p = tgt.split(".")
                try:
                    theirs = (canons.get(server.MACULA_BACK.get(it["ref"].split(".")[0], it["ref"].split(".")[0]), 99),
                              int(p[1]), int(p[2]))
                except (IndexError, ValueError, KeyError):
                    theirs = None
                rows.append({"target": tgt, "reader": it.get("reader"),
                             "before": bool(mine and theirs and theirs < mine)})
            if rows:
                allu[kind] = rows
        if allu:
            rec["allusions"] = allu
        if rec:
            links[site_ref] = rec
        if len(links) % 4000 == 0 and links:
            log(f"    {len(links):,} verses with links  ({time.time() - t0:.1f}s)")
    write_json(out / "verse-links.json", links)
    log(f"  verse links done in {time.time() - t0:.1f}s ({len(links):,} verses)")


# -------------------------------------------------------------------- the words
def export_words(d, out: Path):
    log("words …")
    keys = sorted(set(d["occ"]) | set(d["profiles"]))
    words = {}
    t0 = time.time()
    for n, key in enumerate(keys, 1):
        if not key or key[0] not in "hg":
            continue
        try:
            s = server._api_sense(d, {"key": [key]})
        except Exception as exc:  # noqa: BLE001
            log(f"    ! {key}: {exc!r}")
            continue
        if not s.get("found"):
            continue
        lx = d["lex"].get(key) or {}
        definition = s.get("definition") or lx.get("definition") or None
        short = s.get("short") or lx.get("gloss") or None
        src = "strongs" if lx.get("source") == "strongs" else ("hebrew" if key[0] == "h" else "greek")
        rows = []
        for r in ((s.get("occurrences") or {}).get("rows") or [])[:6]:
            tgt = target_of(d, r.get("ref") or "")
            if tgt:
                rows.append(tgt)
        u = None
        try:
            raw = server.ubs_senses(d, key)
        except Exception:  # noqa: BLE001
            raw = None
        if raw and raw.get("senses"):
            u = {
                "credit": raw.get("credit"), "licence": raw.get("licence"),
                "licence_url": raw.get("licence_url"), "edited": raw.get("edited"),
                "url": raw.get("url"),
                "senses": [{
                    "glosses": x.get("glosses") or [], "short": x.get("short"),
                    "domains": [{"label": dm.get("label")} for dm in (x.get("domains") or [])],
                    "refs": x.get("refs") or [],
                } for x in (raw.get("senses") or [])],
            }
        words[s.get("key") or key] = {
            "lemma": s.get("lemma") or "",
            "translit": s.get("translit") or "",
            "lang": s.get("lang") or ("Hebrew" if key[0] == "h" else "Greek"),
            "short": short, "gloss": s.get("gloss"),
            "definition": definition,
            "definition_credit": server.LEXICON_CREDIT[src] if definition else None,
            "occurrences": rows,
            "ubs": u,
        }
        if n % 3000 == 0:
            log(f"    {n:,} / {len(keys):,}  ({time.time() - t0:.1f}s)")
    write_json(out / "words.json", words)
    log(f"  words done in {time.time() - t0:.1f}s ({len(words):,})")


# ------------------------------------------------------------ themes & questions
def export_themes(d, out: Path):
    log("themes …")
    tm = server._theme_map()
    themes = {}
    for t in tm.get("themes") or []:
        got = server.api_majortheme(d, {"id": [t["id"]], "lite": ["1"]})
        if not got.get("found"):
            continue
        themes[t["id"]] = {
            "title": got.get("title") or t["id"],
            "subtitle": got.get("subtitle") or "",
            "path": got.get("path") or ("/themes/" + t["id"]),
            "events": [{"title": x.get("title"), "listed": bool(x.get("listed"))}
                       for x in (got.get("events") or [])],
        }
    write_json(out / "themes.json", themes)


def export_questions(d, out: Path):
    log("questions …")
    qs = {}
    for qid, q in (server._questions() or {}).items():
        if q.get("shown") is False:
            continue
        qs[qid] = {
            "question": q.get("question") or qid,
            "intro": q.get("intro") or "",
            "path": q.get("path") or ("/questions/" + qid),
            "readings": [{"label": r.get("label"), "summary": r.get("summary")}
                         for r in (q.get("readings") or [])],
        }
    write_json(out / "questions.json", qs)


# ------------------------------------------------------- the schema as items
def export_schema(d, out: Path):
    log("schema …")
    backend = B.Backend(server, d)
    vocab = backend._vocab()
    kinds = sorted(backend._kinds())
    relations = {}
    for key in sorted(vocab["types"]):
        try:
            got = backend._relation(key)
        except Exception as exc:  # noqa: BLE001
            log(f"    ! relation {key}: {exc!r}")
            continue
        if got:
            relations[key] = got
    kind_items = {}
    for key in kinds:
        try:
            got = backend._kind(key)
        except Exception as exc:  # noqa: BLE001
            log(f"    ! kind {key}: {exc!r}")
            continue
        if got:
            kind_items[key] = got
    write_json(out / "schema.json", {
        "types": vocab["types"],
        "defs": vocab["defs"],
        "kinds": kinds,
        "relations": relations,
        "kind_items": kind_items,
    })


# --------------------------------------------------------------- search & verses
def export_search(d, out: Path):
    log("search …")
    tm = server._theme_map()
    ents = []
    for eid, e in d["ents"].items():
        if e.get("alias_of"):
            continue
        # The event this record is a part of, for api_search's "a part after
        # its whole" sweep: only rows whose search sub-line says "part of the
        # event …" or "said in the event …" take part.
        whole = None
        try:
            lab = server.speech_label(d, e)
            if lab or e.get("type") == "passage":
                ev = server.events_at(d, (e.get("refs") or [""])[0])
                if ev:
                    whole = ev[0].get("title")
        except Exception:  # noqa: BLE001
            whole = None
        ents.append({
            "id": eid, "name": e.get("name") or eid,
            "aka": e.get("aka") or [], "type": e.get("type"),
            "nrels": len(d["rels"].get(eid, [])),
            **({"whole": whole} if whole else {}),
        })
    themes = [{
        "id": t["id"], "title": server._title(t["title"]),
        "subtitle": t.get("subtitle") or "",
        "concepts": [c.get("name") for c in (t.get("concepts") or []) if c.get("name")],
    } for t in (tm.get("themes") or [])]
    books = []
    for b, title in server.TITLE.items():
        chapters = d["chapters"].get(b) or ()
        if chapters:
            books.append({"code": b, "title": title, "chapters": max(chapters)})
    write_json(out / "search.json", {"entities": ents, "themes": themes, "books": books,
                                     "book_aliases": server.ALIAS})


def export_verses(d, out: Path):
    log("verses …")
    verses = {}
    for key, text in d["verses"].items():
        verses["%s.%d.%d" % key] = verse_text(d, key)
    write_json(out / "verses.json", verses)


def export_addrs(out: Path):
    """The name-made card addresses (/e/rahab_job_26_12 where the id misleads)."""
    src = SITE_ROOT / "out" / "card-slugs.json"
    if src.exists():
        (out / "card-slugs.json").write_bytes(src.read_bytes())
        log(f"  card-slugs.json: {len(json.loads(src.read_text(encoding='utf-8')))} addresses")


def export_meta(d, out: Path):
    log("meta …")
    try:
        v = json.loads((SITE_ROOT / "ontology" / "ns-version.json").read_text(encoding="utf-8"))
        data_version = "%s+%s" % (v.get("version"), v.get("date"))
    except (OSError, ValueError):
        data_version = "unknown"
    write_json(out / "meta.json", {
        "site": SITE,
        "data_version": data_version,
        "sources": B.SOURCES,
        "credit": "Bible Ontology (bibleontology.org), CC BY 4.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_from": str(SITE_ROOT),
    })


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(PROJECT / "ontology-data"))
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    log(f"loading the site's data from {SITE_ROOT} …")
    d = server.load()
    t0 = time.time()
    export_meta(d, out)
    export_addrs(out)
    export_verses(d, out)
    export_questions(d, out)
    export_themes(d, out)
    export_search(d, out)
    export_schema(d, out)
    export_words(d, out)
    export_verse_links(d, out)
    export_entities(d, out)
    log(f"done in {time.time() - t0:.1f}s → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
