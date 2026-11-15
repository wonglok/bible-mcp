import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { backend } from "@/lib/backend";
import { getVerseTool } from "@/lib/mcp";

export const schema = {
  ref: z.string().describe("A verse reference: Matt.4.4 or Matt 4:4."),
};

export const metadata: ToolMetadata = {
  name: "get_verse",
  description:
    "Return a Bible verse by reference (for example Matt 4:4 or Matt.4.4), with its links.",
  annotations: {
    title: "Get a verse",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export default async function getVerse({ ref }: InferSchema<typeof schema>) {
  return getVerseTool(await backend(), ref);
}
