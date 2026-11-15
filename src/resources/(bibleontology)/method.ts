import type { ResourceMetadata } from "xmcp";
import { RESOURCES } from "@/lib/text";

export const metadata: ResourceMetadata = {
  name: "method",
  title: "How the graph is built",
  description: "Certainty, voice, and how readings are marked.",
};

export default function method() {
  return RESOURCES.method;
}
