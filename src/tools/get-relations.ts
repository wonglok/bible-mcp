import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { backend } from "@/lib/backend";
import { getRelationsTool } from "@/lib/mcp";

export const schema = {
  id: z.string().describe("The item whose relations to list, as fetch returns it."),
  kind: z.string().optional().describe("Only relations of this vocabulary type."),
  cursor: z.string().optional().describe("The cursor from a 'more' link, for the next page."),
};

export const metadata: ToolMetadata = {
  name: "get_relations",
  description:
    "Page through an item's relations, strongest first, optionally filtered by relation kind. Use the cursor from a 'more' link to see the next page.",
  annotations: {
    title: "Get relations",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export default async function getRelations({ id, kind, cursor }: InferSchema<typeof schema>) {
  return getRelationsTool(await backend(), { id, kind, cursor });
}
