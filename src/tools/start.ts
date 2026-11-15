import { type ToolMetadata } from "xmcp";
import { backend } from "@/lib/backend";
import { startTool } from "@/lib/mcp";

export const metadata: ToolMetadata = {
  name: "start",
  description:
    "Begin here when you have no specific question yet: a short orientation to the graph and the entries most worth opening.",
  annotations: {
    title: "Start here",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export default async function start() {
  return startTool(await backend());
}
