import type { ResourceMetadata } from "xmcp";
import { RESOURCES } from "@/lib/text";

export const metadata: ResourceMetadata = {
  name: "licensing",
  title: "Licensing",
  description: "The graph's licence and the terms of its sources.",
};

export default function licensing() {
  return RESOURCES.licensing;
}
