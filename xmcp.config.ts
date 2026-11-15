import type { XmcpConfig } from "xmcp";

const instructions = [
  "This graph holds the people, events, places and ideas of the Bible, and",
  "every relation cites the verse it rests on. Start with the start tool when",
  "you have no query yet; otherwise use search. Each answer ends with links",
  "and moves: follow them with fetch to walk the graph. A link's iri names its",
  "relation in our published vocabulary, and its certainty says how firmly the",
  "verse supports it: stated, implied, a reading (someone's judgment), or a",
  "match (found by shared words, with its grade). Check certainty before you",
  "rely on a reading or a match. Cite the url and the verses of whatever you use.",
].join(" ");

const config: XmcpConfig = {
  http: true,
  experimental: {
    adapter: "nextjs",
  },
  // The route imports .xmcp/adapter, which this build itself emits: checking
  // types before emitting would fail on the first build of a clean tree.
  // `next build` type-checks the route after the adapter exists.
  typescript: {
    skipTypeCheck: true,
  },
  paths: {
    tools: "src/tools",
    resources: "src/resources",
    prompts: false,
  },
  template: {
    name: "bible-ontology",
    description:
      "A read-only knowledge graph of the Bible's text: people, events, places and ideas, " +
      "every relation citing its verse. Built on the original languages and read in the Berean Standard Bible.",
    instructions,
  },
};

export default config;
