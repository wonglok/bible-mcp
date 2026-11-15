import type { ResourceMetadata } from "xmcp";
import { backend } from "@/lib/backend";

export const metadata: ResourceMetadata = {
  name: "version",
  title: "Version",
  description: "The data and vocabulary version this snapshot serves.",
};

export default async function version() {
  const b = await backend();
  return `# Version\n\nData and vocabulary: ${b.dataVersion}\n`;
}
