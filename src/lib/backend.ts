/**
 * The read-only backend: a TypeScript port of app2/mcp_backend.py.
 *
 * The snapshot (ontology-data/) already holds the site's own answers reduced to
 * what the hop rules read. This module applies the rules: a hop names a
 * relation and hands over a verse that makes it; a relation with no verse is
 * not a hop; themes stay in the body; readings are marked; two original-language
 * words at most; the top links go to as many different places as there are.
 */
import { loadSnapshot, type Snapshot, type VerseLink, type Word } from "./data";
import { SITE, SOURCES, START_LINKS, START_TEXT } from "./text";

type SearchEntity = Snapshot["search"]["entities"][number];

export type Rel = {
  rel: string | null;
  type: string | null;
  id: string;
  title: string | null;
  url: string;
  because: { ref: string; url: string } | null;
  certainty: string | null;
  voice: unknown;
  strength: number;
};

export type Move = { id: string; title?: string | null; url?: string };

export type McpItem = {
  id: string;
  title: string;
  url: string;
  text: string;
  verses: { ref: string; text: string | null; url: string }[];
  relations: Rel[];
  moves: Record<string, Move | Move[] | null>;
  shown: boolean;
  schema?: unknown;
  sources_extra?: { name: string; licence: string; url: string }[];
};

export type StartEntry = {
  text: string;
  links: { rel: string; id: string; title: string; url: string }[];
};

const SLUG = /^[a-z0-9_]{1,80}$/;
const CERTAINTY: Record<string, string> = {
  explicit: "stated",
  implied: "implied",
  conjectured: "reading",
  disputed: "reading",
};
const READING_CATEGORIES = new Set(["Story echoes", "Story told this way"]);
const SKIP_CATEGORIES = new Set(["Role pattern"]);
const THEME_TYPES = new Set(["in_theme"]);
const LANGUAGE_CATEGORY = "Language";
const LANGUAGE_CAP = 2;
const VERSES_IN_BODY = 6;
const UBS_SENSES = 8;
const ITEM_CACHE = 512;

// the order of strength: what the text states, then quotations and parallels,
// then readings, then words
const TIER_STATED = 3;
const TIER_QUOTE = 2;
const TIER_READING = 1;
const TIER_WORD = 0;

const EDITOR_KINDS: Record<string, [string, string]> = {
  quotes: ["quotes", "quotes"],
  "quoted by": ["quotes", "is quoted in"],
  "points to": ["points_to", "points to"],
  "pointed to by": ["points_to", "is pointed to by"],
  parallel: ["points_to", "its section points to"],
};
const ALLUSION_KINDS = ["words", "images", "letters", "revelation", "history"];

const REF = /^\s*(\d?[A-Za-z]+)\s+(\d+):(\d+)/;
const VERSE_KEY = /^(\w+)\.(\d+)\.(\d+)$/;

function diversify(rels: Rel[]): void {
  const count = new Map<string, number>();
  for (const r of rels.sort((a, b) => b.strength - a.strength)) {
    const k = count.get(r.id) ?? 0;
    count.set(r.id, k + 1);
    r.strength -= k * 10000000;
  }
}

function verseId(ref: string | null | undefined): [string, number, number] | null {
  const m = REF.exec(ref ?? "");
  return m ? [m[1], Number(m[2]), Number(m[3])] : null;
}

function firstOf(x: unknown): string {
  if (Array.isArray(x)) return (x[0] as string) ?? "";
  return (x as string) ?? "";
}

export class Backend {
  readonly d: Snapshot;
  readonly dataVersion: string;
  readonly sources = SOURCES;
  private cache = new Map<string, McpItem | null>();
  private shownCache = new Map<string, boolean>();

  constructor(d: Snapshot) {
    this.d = d;
    this.dataVersion = this.d.meta.data_version;
  }

  private url(p: string): string {
    return SITE + p;
  }

  private addr(eid: string): string {
    return this.d.addrs[eid] ?? eid;
  }

  private cardUrl(eid: string): string {
    return this.url("/e/" + this.addr(eid));
  }

  private because(ref: string | null | undefined) {
    const v = verseId(ref ?? "");
    if (!v) return null;
    const key = `${v[0]}.${v[1]}.${v[2]}`;
    if (!(key in this.d.verses)) return null;
    return { ref: `${v[0]} ${v[1]}:${v[2]}`, url: this.url("/p/" + key) };
  }

  private vt(rtype: string | null | undefined): string | null {
    return rtype && Object.prototype.hasOwnProperty.call(this.d.schema.types, rtype)
      ? rtype
      : null;
  }

  // ------------------------------------------------------------------ items
  item(iid: string): McpItem | null {
    if (this.cache.has(iid)) {
      const got = this.cache.get(iid)!;
      this.cache.delete(iid);
      this.cache.set(iid, got);
      return got;
    }
    const at = iid.indexOf(":");
    const kind = at < 0 ? iid : iid.slice(0, at);
    const key = at < 0 ? "" : iid.slice(at + 1);
    let got: McpItem | null = null;
    switch (kind) {
      case "card":
        got = this.card(key);
        break;
      case "verse":
        got = this.verse(key);
        break;
      case "word":
        got = this.word(key);
        break;
      case "theme":
        got = this.theme(key);
        break;
      case "question":
        got = this.question(key);
        break;
      case "relation":
        got = (this.d.schema.relations[key] as McpItem | undefined) ?? null;
        break;
      case "kind":
        got = (this.d.schema.kind_items[key] as McpItem | undefined) ?? null;
        break;
      default:
        got = null;
    }
    if (got !== null) {
      this.cache.set(iid, got);
      if (this.cache.size > ITEM_CACHE) {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) this.cache.delete(oldest);
      }
      if (this.shownCache.size >= 50000) this.shownCache.clear();
      this.shownCache.set(iid, true);
    }
    return got;
  }

  shown(iid: string): boolean {
    if (this.shownCache.get(iid)) return true;
    const at = iid.indexOf(":");
    const kind = at < 0 ? iid : iid.slice(0, at);
    const key = at < 0 ? "" : iid.slice(at + 1);
    let got: boolean;
    if (kind === "card") got = key in this.d.entities;
    else if (kind === "question") got = key in this.d.questions;
    else if (kind === "verse") {
      const m = VERSE_KEY.exec(key);
      got = !!m && `${m[1]}.${Number(m[2])}.${Number(m[3])}` in this.d.verses;
    } else if (kind === "relation")
      got = Object.prototype.hasOwnProperty.call(this.d.schema.types, key);
    else if (kind === "kind") got = this.d.schema.kinds.includes(key);
    else got = this.item(iid) !== null;
    if (got) {
      if (this.shownCache.size >= 50000) this.shownCache.clear();
      this.shownCache.set(iid, true);
    }
    return got;
  }

  start(): StartEntry {
    const links: StartEntry["links"] = [];
    for (const [rel, iid] of START_LINKS) {
      if (!this.shown(iid)) continue;
      const at = iid.indexOf(":");
      const kind = iid.slice(0, at);
      const key = iid.slice(at + 1);
      let title: string;
      let url: string;
      if (kind === "card") {
        title = this.d.entities[key]?.name || key;
        url = this.cardUrl(key);
      } else if (kind === "verse") {
        title = key.replace(".", " ").replace(".", ":");
        url = this.url("/p/" + key);
      } else if (kind === "question") {
        title = key.replace(/-/g, " ");
        url = this.url("/questions/" + key);
      } else {
        title = titleCase(key.replace(/_/g, " "));
        url = this.url("/themes/" + key);
      }
      links.push({ rel, id: iid, title, url });
    }
    return { text: START_TEXT, links };
  }

  // ---------------------------------------------------------------------- cards
  private card(key: string): McpItem | null {
    let e = this.d.entities[key];
    if (!e) return null;
    let eid = key;
    if (e.alias_of && this.d.entities[e.alias_of]) {
      eid = e.alias_of;
      e = this.d.entities[eid];
    }
    const rels: Rel[] = [];
    let n = 0;
    for (const g of e.groups ?? []) {
      const cat = g.category;
      if (SKIP_CATEGORIES.has(cat)) continue;
      let taken = 0;
      for (const it of g.items ?? []) {
        n += 1;
        if (cat === LANGUAGE_CATEGORY && taken >= LANGUAGE_CAP) continue;
        if (it.type && THEME_TYPES.has(it.type)) continue; // themes in the body, never hops
        const because = this.because(it.refs?.[0]);
        if (!SLUG.test(it.other ?? "") || !because) continue; // no verse, no hop
        let certainty = CERTAINTY[it.certainty ?? ""] ?? "implied";
        if (READING_CATEGORIES.has(cat)) certainty = "reading";
        const tier =
          cat === LANGUAGE_CATEGORY
            ? TIER_WORD
            : certainty === "reading"
              ? TIER_READING
              : TIER_STATED;
        rels.push({
          rel: it.label ?? null,
          type: this.vt(it.type),
          id: "card:" + it.other,
          title: it.name ?? null,
          url: this.cardUrl(it.other),
          because,
          certainty,
          voice: it.claimed_by_name ? "the words of " + it.claimed_by_name : null,
          strength: tier * 100000 - n,
        });
        taken += 1;
      }
    }
    const ev = e.evcard ?? {};
    const seen = new Set(rels.map((r) => `${r.id}\u0000${r.rel}`));
    for (const c of ev.cast ?? []) {
      n += 1;
      const go = /^(\w+)\.(\d+)\.(\d+)$/.exec(String(firstOf((c.cites ?? [])[0]?.go ?? "")));
      const because = go ? this.because(`${go[1]} ${go[2]}:${go[3]}`) : null;
      const obj = c.object ?? {};
      const subs = (c.subjects ?? []).filter(
        (s): s is { id?: string; name?: string } => typeof s === "object" && s !== null,
      );
      if (!because) continue;
      const certainty = CERTAINTY[c.certainty ?? ""] ?? "implied";
      const voice = c.claimed_by ? "the words of " + (c.claimed_by.name ?? "") : null;
      const clause = [
        subs.map((s) => s.name ?? "").join(" and "),
        c.verb,
        obj.name,
      ]
        .filter((x) => x)
        .join(" ");
      const ends: { id?: string; name?: string; rel: string }[] = [
        ...subs.map((s) => ({ id: s.id, name: s.name, rel: clause })),
        { id: obj.id, name: obj.name, rel: clause },
      ];
      for (const oid of ends) {
        if (!SLUG.test(oid.id ?? "") || oid.id === eid) continue;
        const k = `${oid.id}\u0000${oid.rel}`;
        if (seen.has(k)) continue;
        seen.add(k);
        rels.push({
          rel: oid.rel,
          type: this.vt((c as { kind?: string }).kind),
          id: "card:" + oid.id,
          title: oid.name ?? null,
          url: this.cardUrl(oid.id!),
          because,
          certainty,
          voice,
          // on an event, who did what leads its tier, ahead of the structural "contains"
          strength: TIER_STATED * 100000 + 50000 - n,
        });
      }
    }
    for (const q of ev.quotes ?? []) {
      n += 1;
      const frmGo = VERSE_KEY.exec(String(firstOf(q.from_go)));
      const toGo = VERSE_KEY.exec(String(firstOf(q.to_go)));
      const frm = frmGo ? this.because(`${frmGo[1]} ${frmGo[2]}:${frmGo[3]}`) : null;
      if (toGo && frm) {
        const tid = `${toGo[1]}.${toGo[2]}.${toGo[3]}`;
        rels.push({
          rel: q.verb || "quotes",
          type: null,
          id: "verse:" + tid,
          title: String(firstOf(q.to_ref)) || tid,
          url: this.url("/p/" + tid),
          because: frm,
          certainty: "stated",
          voice: q.speaker ?? null,
          strength: TIER_QUOTE * 100000 - n,
        });
      }
    }
    diversify(rels);

    const refs = (e.refs ?? [])
      .map((r) => verseId(r))
      .filter((v): v is [string, number, number] => !!v && `${v[0]}.${v[1]}.${v[2]}` in this.d.verses);
    const verses = refs.slice(0, VERSES_IN_BODY).map((v) => {
      const k = `${v[0]}.${v[1]}.${v[2]}`;
      return { ref: `${v[0]} ${v[1]}:${v[2]}`, text: this.d.verses[k] ?? null, url: this.url("/p/" + k) };
    });
    const themes = (e.mthemes ?? []).map((t) => t.title || t.theme).filter((t) => t);
    let text = (e.name ?? eid) + (e.desc ? ". " + e.desc : "");
    if (themes.length) text += "\nThemes: " + themes.join(", ");

    const moves: Record<string, Move | Move[] | null> = {};
    const withinRaw = e.event?.within;
    const within = Array.isArray(withinRaw)
      ? withinRaw
      : withinRaw
        ? [withinRaw]
        : [];
    const ups = within.filter(
      (w): w is string => typeof w === "string" && SLUG.test(w) && w in this.d.entities,
    );
    if (ups.length) {
      const up = ups[0];
      moves.up = {
        id: "card:" + up,
        title: this.d.entities[up]?.name || up,
        url: this.cardUrl(up),
      };
    }
    moves.down = (e.event?.tellings ?? [])
      .filter((t) => SLUG.test(t.id ?? ""))
      .map((t) => ({ id: "card:" + t.id, title: t.label ?? null, url: this.cardUrl(t.id) }));

    return {
      id: "card:" + eid,
      title: e.name ?? eid,
      url: this.cardUrl(eid),
      text,
      verses,
      relations: rels,
      moves,
      shown: true,
    };
  }

  // --------------------------------------------------------------------- verses
  private verseHops(ec: VerseLink): {
    target: string;
    type: string;
    label: string;
    certainty: string;
    tier: number;
  }[] {
    const out: { target: string; type: string; label: string; certainty: string; tier: number }[] = [];
    for (const it of ec.editors ?? []) {
      const k = EDITOR_KINDS[it.kind ?? ""];
      if (!k) continue;
      const how =
        it.kind === "parallel"
          ? "in the Berean editors' section heading"
          : "as the Berean editors note";
      out.push({ target: it.target, type: k[0], label: `${k[1]}, ${how}`, certainty: "stated", tier: TIER_QUOTE });
    }
    const buckets: [keyof VerseLink, string][] = [
      ["earlier", "echoes"],
      ["later", "is echoed in"],
    ];
    for (const [bucket, label] of buckets) {
      for (const it of (ec[bucket] as { target: string; band: string; band_note: string }[] | undefined) ?? []) {
        const grade = `${it.band ?? ""}: ${it.band_note ?? ""}`;
        out.push({
          target: it.target,
          type: "echoes",
          label: `${label} (a word match, ${grade})`,
          certainty: "match",
          tier: TIER_READING,
        });
      }
    }
    for (const it of ec.aligned ?? []) {
      out.push({
        target: it.target,
        type: "says_the_same_as",
        label: "says the same as, as DeepSeek Flash judged the pair",
        certainty: "reading",
        tier: TIER_READING,
      });
    }
    for (const kind of ALLUSION_KINDS) {
      for (const it of ec.allusions?.[kind] ?? []) {
        const label = it.before ? "alludes to" : "is alluded to in";
        out.push({
          target: it.target,
          type: "alludes_to",
          label: `${label}, as ${it.reader || "a reader"} judged`,
          certainty: "reading",
          tier: TIER_READING,
        });
      }
    }
    return out;
  }

  private verse(key: string): McpItem | null {
    const m = VERSE_KEY.exec(key);
    if (!m) return null;
    const b = m[1];
    const c = Number(m[2]);
    const v = Number(m[3]);
    const hereKey = `${b}.${c}.${v}`;
    if (!(hereKey in this.d.verses)) return null;
    const text = this.d.verses[hereKey];
    const here = { ref: `${b} ${c}:${v}`, url: this.url("/p/" + hereKey) };
    const ec = this.d.links[hereKey] ?? {};
    const rels: Rel[] = [];
    let n = 0;
    const seen = new Set<string>();
    for (const hop of this.verseHops(ec)) {
      n += 1;
      const t = hop.target;
      if (!t || t === hereKey || seen.has(`${t}\u0000${hop.type}`)) continue;
      seen.add(`${t}\u0000${hop.type}`);
      const [tb, tc, tv] = t.split(".");
      rels.push({
        rel: hop.label,
        type: this.vt(hop.type),
        id: "verse:" + t,
        title: `${tb} ${Number(tc)}:${Number(tv)}`,
        url: this.url("/p/" + t),
        because: here,
        certainty: hop.certainty,
        voice: null,
        strength: hop.tier * 100000 - n,
      });
    }
    diversify(rels);

    const moves: Record<string, Move> = {};
    const candidates: [string, string][] = [
      ["prev", `${b}.${c}.${v - 1}`],
      ["next", `${b}.${c}.${v + 1}`],
      ["next", `${b}.${c + 1}.1`],
    ];
    for (const [rel, cand] of candidates) {
      if (rel in moves || !(cand in this.d.verses)) continue;
      const [cb, cc, cv] = cand.split(".");
      moves[rel] = {
        id: "verse:" + cand,
        title: `${cb} ${Number(cc)}:${Number(cv)}`,
        url: this.url("/p/" + cand),
      };
    }
    return {
      id: "verse:" + hereKey,
      title: `${b} ${c}:${v}`,
      url: here.url,
      text: text ?? "",
      verses: [{ ...here, text }],
      relations: rels,
      moves,
      shown: true,
    };
  }

  // ---------------------------------------------------------------------- words
  private word(rawKey: string): McpItem | null {
    const letter = rawKey[0];
    if (letter !== "H" && letter !== "G") return null;
    const strong = rawKey.slice(1).replace(/^0+/, "") || "0";
    const base = letter.toLowerCase() + strong.replace(/[^0-9]/g, "");
    const suffix = /[a-z]$/i.test(strong) ? strong.slice(-1).toLowerCase() : "";
    let w: Word | undefined = this.d.words[base + suffix] ?? this.d.words[base];
    if (!w) return null;

    const vs: { ref: string; text: string | null; url: string }[] = [];
    for (const t of w.occurrences ?? []) {
      if (!(t in this.d.verses)) continue;
      const [tb, tc, tv] = t.split(".");
      vs.push({
        ref: `${tb} ${Number(tc)}:${Number(tv)}`,
        text: this.d.verses[t] ?? null,
        url: this.url("/p/" + t),
      });
    }

    let text = `${w.lemma} (${w.translit}), ${w.lang}: ${w.short || w.gloss || ""}`;
    let extra: { name: string; licence: string; url: string }[] = [];
    const u = w.ubs;
    if (u && u.senses?.length) {
      // UBS's senses (CC BY-SA, not the graph's CC BY): marked in the text, and
      // its credit added to this answer's sources only
      text += `\nIts senses in the UBS dictionary (${u.licence}, not the graph's license):`;
      for (const x of u.senses.slice(0, UBS_SENSES)) {
        const glosses = (x.glosses ?? []).join("; ");
        const domains = (x.domains ?? []).map((dm) => dm.label ?? "").join(", ");
        text += `\n- ${glosses}: ${x.short} [${domains}; ${(x.refs ?? []).length} verses]`;
      }
      if (u.senses.length > UBS_SENSES) {
        text += `\n- and ${u.senses.length - UBS_SENSES} more senses on the page`;
      }
      extra = [
        {
          name: u.credit ?? "",
          licence: `${u.licence ?? ""} (${u.licence_url ?? ""}). ${u.edited ?? ""}`,
          url: u.url ?? "",
        },
      ];
    }
    if (w.definition) {
      text += "\n" + w.definition + (w.definition_credit ? `\n(${w.definition_credit})` : "");
    }
    return {
      id: "word:" + rawKey,
      title: `${rawKey} ${w.lemma ?? ""}`,
      url: this.url("/word/" + rawKey),
      text,
      verses: vs,
      relations: [],
      moves: {},
      shown: true,
      sources_extra: extra,
    };
  }

  // --------------------------------------------------------------------- themes
  private theme(key: string): McpItem | null {
    const t = this.d.themes[key];
    if (!t) return null;
    const events = (t.events ?? []).filter((x) => x.listed).map((x) => x.title).filter((x) => x);
    let text = t.title || key;
    if (t.subtitle) text += ": " + t.subtitle;
    if (events.length) text += "\nEvents: " + events.join(", ");
    return {
      id: "theme:" + key,
      title: t.title || key,
      url: this.url(t.path || "/themes/" + key),
      text,
      verses: [],
      relations: [],
      moves: {},
      shown: true,
    };
  }

  // ------------------------------------------------------------------ questions
  private question(key: string): McpItem | null {
    const q = this.d.questions[key];
    if (!q) return null;
    const parts = [q.question || key, q.intro || ""];
    for (const r of q.readings ?? []) {
      parts.push(`A reading: ${r.label ?? ""}. ${r.summary ?? ""}`);
    }
    return {
      id: "question:" + key,
      title: q.question || key,
      url: this.url(q.path || "/questions/" + key),
      text: parts.filter((p) => p).join("\n"),
      verses: [],
      relations: [],
      moves: {},
      shown: true,
    };
  }

  // ------------------------------------------------------------------- search
  search(query: string, limit: number): { id: string; title: string; url: string }[] {
    const term = query.trim();
    if (term.length < 2) return [];
    const rows = this.searchRows(term);
    const out: { id: string; title: string; url: string }[] = [];
    for (const r of rows) {
      if (r.kind === "entity") {
        if (!SLUG.test(r.id)) continue;
        out.push({ id: "card:" + r.id, title: r.title, url: this.cardUrl(r.id) });
      } else if (r.kind === "mtheme") {
        if (!SLUG.test(r.id)) continue;
        out.push({ id: "theme:" + r.id, title: r.title, url: this.url("/themes/" + r.id) });
      } else if (r.kind === "passage") {
        const v = verseId(r.title);
        if (!v) continue;
        const key = `${r.id}.${v[1]}.${v[2]}`;
        if (!(key in this.d.verses)) continue;
        out.push({ id: "verse:" + key, title: r.title, url: this.url("/p/" + key) });
      }
      if (out.length >= limit) break;
    }
    return out;
  }

  private searchRows(
    term: string,
  ): { kind: string; id: string; title: string; r: number; phrase?: boolean; whole?: string }[] {
    const rows: { kind: string; id: string; title: string; r: number; phrase?: boolean; whole?: string }[] = [];
    const books = this.d.search.books;
    const aliases = this.d.search.book_aliases ?? {};

    // A RANGE OPENS AT ITS START: "Genesis 1:1-3" and "Deut 28-30"
    const m = /^\s*([0-9]?\s*[A-Za-z]+)\.?\s*(\d+)?(?:[:.\s](\d+))?(?:\s*[-–]\s*(\d+)(?::(\d+))?)?\s*$/.exec(term);
    if (m) {
      const want = slug(m[1]);
      const ch = Number(m[2] || 1);
      const vs = m[3] ? Number(m[3]) : null;
      const hit: string[] = [];
      const alias = aliases[want];
      if (alias) hit.push(alias);
      for (const b of books) {
        if (hit.includes(b.code)) continue;
        if (slug(b.title).startsWith(want) || slug(b.code).startsWith(want)) hit.push(b.code);
      }
      for (const b of hit.slice(0, 6)) {
        const last = books.find((x) => x.code === b)?.chapters ?? 1;
        if (m[2] && ch > last) continue;
        const c = Math.min(Math.max(ch, 1), last);
        if (vs && !(`${b}.${c}.${vs}` in this.d.verses)) continue;
        const upto = m[4] ? `–${m[4]}${m[5] ? ":" + m[5] : ""}` : "";
        const title = `${this.bookTitle(b)} ${c}${vs ? ":" + vs : ""}${upto}`;
        rows.push({ kind: "passage", id: b, title, r: b === alias ? 0 : 1 });
      }
    }

    const wants = new Set([wordkey(term)]);
    wants.delete("");

    const rank = (key: string): number | null => {
      let best: number | null = null;
      for (const w of wants) {
        let r: number;
        if (key === w) r = 0;
        else if (key.startsWith(w)) {
          const next = key.slice(w.length, w.length + 1);
          r = /[a-z0-9]/.test(next) ? 2 : 1;
        } else if (LEADING.some((a) => key.startsWith(a) && key.slice(a.length).startsWith(w))) {
          r = LEADING.some((a) => key === a + w) ? 0 : 1;
        } else if (` ${key}`.includes(` ${w}`)) r = 3;
        else if (allWords(w, key)) r = 4;
        else continue;
        best = best === null ? r : Math.min(best, r);
      }
      return best;
    };

    // major themes and their concepts
    const themesOffered = new Set<string>();
    for (const t of this.d.search.themes) {
      const title = t.title;
      const rs = [rank(wordkey(title))]
        .concat(title.split(/[/&()]/).filter((p) => p.trim()).map((p) => rank(wordkey(p))))
        .filter((x): x is number => x !== null);
      if (rs.length) {
        themesOffered.add(t.id);
        rows.push({ kind: "mtheme", id: t.id, title, r: Math.min(...rs) - 1 });
      }
    }
    for (const t of this.d.search.themes) {
      for (const name of t.concepts ?? []) {
        const rk = rank(wordkey(name));
        if (rk !== null) rows.push({ kind: "mtheme", id: t.id, title: name, r: rk + 1 });
      }
    }

    // every record of a name, aliases too
    type Hit = { r: number; len: number; e: SearchEntity; nrels: number };
    const hits: Hit[] = [];
    const viaAka = new Map<string, [number, string]>();
    for (const e of this.d.search.entities) {
      const r = rank(wordkey(e.name));
      if (r !== null) {
        let rr = r;
        if (SPEECH_NAME.test(e.name) && e.type === "text") rr += 4;
        if (rr === 3 && e.type === wordkey(term)) rr = 1;
        if (e.id.startsWith("rcell_")) rr += 4;
        hits.push({ r: rr, len: e.name.length, e, nrels: e.nrels });
      }
      for (const a of e.aka ?? []) {
        const ar = rank(wordkey(a));
        if (ar === null) continue;
        const prev = viaAka.get(e.id);
        if (!prev || ar + 1 < prev[0]) viaAka.set(e.id, [ar + 1, wordkey(a)]);
      }
    }
    const index = new Map(hits.map((h, i) => [h.e.id, i]));
    for (const [eid, [r, akey]] of viaAka) {
      const e = this.d.search.entities.find((x) => x.id === eid);
      if (!e) continue;
      const i = index.get(eid);
      if (i !== undefined) {
        if (r < hits[i].r) hits[i] = { r, len: akey.length, e, nrels: hits[i].nrels };
      } else {
        hits.push({ r, len: akey.length, e, nrels: e.nrels });
      }
    }
    hits.sort((a, b) => a.r - b.r || a.len - b.len || b.nrels - a.nrels);
    const seenName = new Set<string>();
    for (const h of hits.slice(0, 40)) {
      const dedupe = `${h.e.name}\u0000${h.e.type}`;
      if (seenName.has(dedupe)) continue;
      seenName.add(dedupe);
      rows.push({ kind: "entity", id: h.e.id, title: h.e.name, r: h.r, whole: h.e.whole });
    }

    // the phrase in the text: two words or more, word for word
    const words = term.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    if (words.length >= 2) {
      let found = 0;
      for (const [key, text] of Object.entries(this.d.verses)) {
        const toks = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
        let has = false;
        for (let j = 0; j + words.length <= toks.length; j++) {
          if (words.every((w, k) => toks[j + k] === w)) {
            has = true;
            break;
          }
        }
        if (!has) continue;
        const [b, c, v] = key.split(".");
        rows.push({
          kind: "passage",
          id: b,
          title: `${this.bookTitle(b)} ${Number(c)}:${Number(v)}`,
          r: 5,
          phrase: true,
        });
        if (++found >= 8) break;
      }
    }

    rows.sort((a, b) => {
      const pa = a.kind !== "passage" || !!a.phrase ? 1 : 0;
      const pb = b.kind !== "passage" || !!b.phrase ? 1 : 0;
      return pa - pb || a.r - b.r || a.title.length - b.title.length;
    });
    // A PART AFTER ITS WHOLE: where a telling and its event both answer, the
    // telling goes straight after the event it belongs to.
    for (const r of rows.filter((x) => x.kind === "entity" && x.whole)) {
      const idx = rows.indexOf(r);
      const wholeAt = rows.findIndex((x) => x.kind === "entity" && x.title === r.whole);
      if (wholeAt === -1 || idx >= wholeAt) continue;
      rows.splice(idx, 1);
      const j = rows.findIndex((x) => x.kind === "entity" && x.title === r.whole);
      rows.splice(j + 1, 0, r);
    }
    return rows;
  }

  private bookTitle(code: string): string {
    return this.d.search.books.find((b) => b.code === code)?.title ?? code;
  }
}

// ------------------------------------------------------------------ helpers
const LEADING = ["the ", "a ", "an "];
const SMALL = new Set(["the", "a", "an", "of", "and", "or", "to", "in", "for", "on", "with"]);
const SPEECH_NAME = /^(.+) at ((?:[1-3] ?)?[A-Z][a-z]+\.? \d+:\d+)$/;

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
}

function slug(s: string): string {
  return fold(s ?? "").replace(/[^a-z0-9]/g, "");
}

function wordkey(s: string): string {
  return (fold(s ?? "").match(/[a-z0-9]+/g) ?? []).join(" ");
}

function allWords(w: string, key: string): boolean {
  const want = w.split(" ").filter((x) => x && !SMALL.has(x));
  if (want.length < 2) return false;
  const have = key.split(" ");
  return want.every((x) => have.some((h) => h.startsWith(x)));
}

function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

let singleton: Backend | null = null;

export async function backend(): Promise<Backend> {
  if (!singleton) singleton = new Backend(await loadSnapshot());
  return singleton;
}
