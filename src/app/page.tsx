const TOOLS = [
  ["start", "Begin here when you have no specific question yet."],
  ["search", "Search for a name, an event, a theme or a reference."],
  ["fetch", "Open one item whole: its text, verses, links and moves."],
  ["get_relations", "Page through an item's relations, strongest first."],
  ["get_verse", "Open a verse by reference (Matt.4.4 or Matt 4:4)."],
  ["get_word", "Open a Strong's word card (H8322 or G26)."],
];

export default function Home() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "72px 24px 96px",
        fontFamily: "ui-serif, Georgia, 'Times New Roman', serif",
        lineHeight: 1.6,
        color: "#1c1917",
      }}
    >
      <p
        style={{
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          fontSize: 12,
          color: "#78716c",
        }}
      >
        Read-only MCP server
      </p>
      <h1 style={{ fontSize: 42, lineHeight: 1.15, margin: "8px 0 20px" }}>
        Bible Ontology
      </h1>
      <p style={{ fontSize: 18 }}>
        A knowledge graph of the Bible&apos;s text: people, events, places,
        ideas and words, and the relations between them, each citing its verse.
        It states what the text says, marks readings as readings, and takes no
        doctrinal position.
      </p>
      <h2 style={{ marginTop: 40, fontSize: 22 }}>Connect</h2>
      <p>
        The MCP endpoint is <code style={code}>/mcp</code> (Streamable HTTP).
        Point a client at{" "}
        <code style={code}>https://mcp.jesus.technology/mcp</code>.
      </p>
      <h2 style={{ marginTop: 40, fontSize: 22 }}>Tools</h2>
      <ul style={{ paddingLeft: 20 }}>
        {TOOLS.map(([name, what]) => (
          <li key={name} style={{ marginBottom: 8 }}>
            <code style={code}>{name}</code> — {what}
          </li>
        ))}
      </ul>
      <h2 style={{ marginTop: 40, fontSize: 22 }}>Resources</h2>
      <ul style={{ paddingLeft: 20 }}>
        {["about", "method", "licensing", "version"].map((name) => (
          <li key={name}>
            <code style={code}>bibleontology://{name}</code>
          </li>
        ))}
      </ul>
      <p style={{ marginTop: 48, fontSize: 14, color: "#57534e" }}>
        The graph: Bible Ontology (bibleontology.org), CC BY 4.0. Its sources
        keep their own terms, credited in every answer. The Berean Standard
        Bible is public domain.
      </p>
    </main>
  );
}

const code = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.9em",
  background: "#f5f5f4",
  padding: "2px 6px",
  borderRadius: 4,
} as const;
