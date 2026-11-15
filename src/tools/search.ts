import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { backend } from "@/lib/backend";
import { searchTool } from "@/lib/mcp";

export const schema = {
  query: z
    .string()
    .min(1)
    .max(200)
    .describe("A name, an event, a theme, or a reference such as Matt 4:4."),
};

export const metadata: ToolMetadata = {
  name: "search",
  description:
    "Use this when you have a question or a name. Search the Bible ontology for people, events, places and ideas; returns up to ten matching items, each with its three strongest links.",
  annotations: {
    title: "Search",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export default async function search({ query }: InferSchema<typeof schema>) {
  return searchTool(await backend(), query);
}
