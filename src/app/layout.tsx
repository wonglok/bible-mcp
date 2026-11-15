import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Bible Ontology MCP",
  description:
    "A read-only MCP server over a knowledge graph of the Bible's text: people, events, places and ideas, " +
    "every relation citing its verse.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
