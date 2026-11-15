import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { backend } from "@/lib/backend";
import { fetchTool } from "@/lib/mcp";

export const schema = {
  id: z
    .string()
    .describe(
      "An item id from another answer: card:jesus, verse:Matt.4.4, word:H8322, theme:creation, question:baptism, relation:quotes, kind:person.",
    ),
};

export const metadata: ToolMetadata = {
  name: "fetch",
  description:
    "Return one item whole, with its text, verses, sources and links. Use it to read a search hit or to follow a link from another answer.",
  annotations: {
    title: "Fetch an item",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export default async function fetchItem({ id }: InferSchema<typeof schema>) {
  return fetchTool(await backend(), id);
}
