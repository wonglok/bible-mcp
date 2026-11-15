import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { backend } from "@/lib/backend";
import { getWordTool } from "@/lib/mcp";

export const schema = {
  strong: z.string().describe("A Strong's number: H8322 or G26."),
};

export const metadata: ToolMetadata = {
  name: "get_word",
  description:
    "Return a Strong's word entry by number (for example H8322 or G26), with its links.",
  annotations: {
    title: "Get a word",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export default async function getWord({ strong }: InferSchema<typeof schema>) {
  return getWordTool(await backend(), strong);
}
