#!/usr/bin/env node
/**
 * Load ontology-data/*.json into MongoDB (the collections src/lib/mongo.ts
 * reads). Re-running replaces the snapshot.
 *
 *   npm run seed
 *   MONGODB_URI=mongodb://127.0.0.1:27017/bible_mcp npm run seed
 */
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

const DATA = process.env.BIBLE_MCP_DATA ?? path.join(process.cwd(), "ontology-data");
const URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/bible_mcp";
const DB = process.env.MONGODB_DB ?? "bible_mcp";
const BATCH = 2000;

const read = (name) => JSON.parse(fs.readFileSync(path.join(DATA, name), "utf-8"));

async function replace(db, name, docs) {
  const col = db.collection(name);
  await col.deleteMany({});
  for (let i = 0; i < docs.length; i += BATCH) {
    await col.insertMany(docs.slice(i, i + BATCH), { ordered: false });
  }
  console.log(`  ${name}: ${docs.length.toLocaleString()}`);
}

const entries = (obj) => Object.entries(obj).map(([k, v]) => ({ _id: k, v }));

async function main() {
  console.log(`seeding ${DB} from ${DATA} …`);
  await mongoose.connect(URI, { dbName: DB, serverSelectionTimeoutMS: 5000 });
  const db = mongoose.connection.db;
  if (!db) throw new Error("no database handle");

  await replace(db, "snapshot", [
    { _id: "meta", v: read("meta.json") },
    { _id: "addrs", v: read("card-slugs.json") },
    { _id: "schema", v: read("schema.json") },
    { _id: "search", v: read("search.json") },
  ]);
  await replace(db, "entities", entries(read("entities.json")).map(({ _id, v }) => ({ _id, entity: v })));
  await replace(db, "verses", entries(read("verses.json")).map(({ _id, v }) => ({ _id, text: v })));
  await replace(
    db,
    "verse_links",
    entries(read("verse-links.json")).map(({ _id, v }) => ({ _id, link: v })),
  );
  await replace(db, "words", entries(read("words.json")).map(({ _id, v }) => ({ _id, word: v })));
  await replace(db, "themes", entries(read("themes.json")).map(({ _id, v }) => ({ _id, theme: v })));
  await replace(
    db,
    "questions",
    entries(read("questions.json")).map(({ _id, v }) => ({ _id, question: v })),
  );

  await mongoose.disconnect();
  console.log("done.");
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
