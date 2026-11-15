/** The site's own words about itself: the MCP resources and the front door. */

export const SITE = "https://bibleontology.org";

export const SOURCES = [
  {
    name: "MACULA Hebrew and Greek Linguistic Datasets",
    licence: "(c) 2022-2024 Biblica, Inc. Licensed under CC BY 4.0",
    url: "https://github.com/Clear-Bible/macula-hebrew/ and https://github.com/Clear-Bible/macula-greek/",
  },
  {
    name: "The Holy Bible, Berean Standard Bible, BSB",
    licence: "This text of God's Word has been dedicated to the public domain.",
    url: "https://bereanbible.com",
  },
  {
    name: "STEP Bible's Translators Brief lexicons (Tyndale House, Cambridge)",
    licence:
      "CC BY 4.0; the Greek based on Abbott-Smith's Manual Greek Lexicon of the New Testament (1922)",
    url: "https://github.com/STEPBible/STEPBible-Data",
  },
];

export const CREDIT = "Bible Ontology (bibleontology.org), CC BY 4.0";

export const START_TEXT =
  "Bible Ontology is a graph of what the Bible's text says: who did what to whom, who said it, which passages " +
  "quote or echo which, and the Hebrew and Greek words beneath, every relation tied to the verse that makes it. " +
  "It takes no doctrinal side; where a link is a reading rather than a statement of the text, it says so. Open " +
  "one of these, or search for a name, an event, a theme or a reference.";

export const START_LINKS: Array<[string, string]> = [
  ["event", "card:event_jesus_temptation"],
  ["person", "card:david"],
  ["person", "card:moses"],
  ["event", "card:event_creation_of_heavens_and_earth"],
  ["theme", "theme:creation"],
  ["question", "question:baptism"],
  ["verse", "verse:John.1.1"],
];

export const RESOURCES: Record<string, string> = {
  about:
    "# Bible Ontology\n\nA knowledge graph of the Bible's text: people, events, places, ideas and words, and " +
    "the relations between them, each citing its verse. Built on the original languages (MACULA) and read in " +
    "the Berean Standard Bible. Read-only. It states what the text says and marks readings as readings; it " +
    "takes no doctrinal position.\n\nEvery answer ends with links and moves: follow them with `fetch`. Each " +
    "link's `iri` is its relation's definition in the published vocabulary; its `certainty` says how firmly " +
    "the verse supports it; `voice` says whose words it rests on. Cite the `url` and the verses you use.\n",
  method:
    "# How the graph is built\n\n- Relations are lifted from the clauses of the original-language text " +
    "(MACULA) and read against the verse; where translations differ, the original decides.\n- Each relation " +
    "keeps its certainty (stated, implied, a reading) and its voice: the narrator, or the speaker whose words " +
    "it rests on (\"the words of Eliphaz\").\n- Readings (story echoes, judged parallels) are marked as " +
    "readings and never presented as the text's own statement.\n- Machine readings are checked twice and " +
    "against planted faults before they are kept; the method is described at " + SITE + "/about.\n",
  licensing:
    "# Licensing\n\nThe graph: Bible Ontology (bibleontology.org), CC BY 4.0. Its sources keep their own " +
    "terms, credited in their own words in every answer's `sources`: MACULA (c) Biblica, Inc., CC BY 4.0; " +
    "the Berean Standard Bible, public domain; STEP Bible's lexicons, CC BY 4.0. A word's senses from the UBS " +
    "dictionaries of Biblical Hebrew and New Testament Greek (United Bible Societies) are CC BY-SA 4.0, not the " +
    "graph's license: an answer that carries them says so in its text and credits them in its `sources`.\n",
};

/** The inverse of MACULA's book codes, for the verse-to-verse hop parser. */
export const MACULA_BACK: Record<string, string> = {
  Gen: "Gen", Exo: "Exod", Lev: "Lev", Num: "Num", Deu: "Deut", Jos: "Josh", Jdg: "Judg", Rut: "Ruth",
  "1Sa": "1Sam", "2Sa": "2Sam", "1Ki": "1Kgs", "2Ki": "2Kgs", "1Ch": "1Chr", "2Ch": "2Chr", Ezr: "Ezra",
  Neh: "Neh", Est: "Esth", Job: "Job", Psa: "Ps", Pro: "Prov", Ecc: "Eccl", Sng: "Song", Isa: "Isa",
  Jer: "Jer", Lam: "Lam", Ezk: "Ezek", Dan: "Dan", Hos: "Hos", Jol: "Joel", Amo: "Amos", Oba: "Obad",
  Jon: "Jonah", Mic: "Mic", Nah: "Nah", Hab: "Hab", Zep: "Zeph", Hag: "Hag", Zec: "Zech", Mal: "Mal",
  Mat: "Matt", Mrk: "Mark", Luk: "Luke", Jhn: "John", Act: "Acts", Rom: "Rom", "1Co": "1Cor", "2Co": "2Cor",
  Gal: "Gal", Eph: "Eph", Php: "Phil", Col: "Col", "1Th": "1Thess", "2Th": "2Thess", "1Ti": "1Tim",
  "2Ti": "2Tim", Tit: "Titus", Phm: "Phlm", Heb: "Heb", Jas: "Jas", "1Pe": "1Pet", "2Pe": "2Pet",
  "1Jn": "1John", "2Jn": "2John", "3Jn": "3John", Jud: "Jude", Rev: "Rev",
};
