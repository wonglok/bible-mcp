import type { ResourceMetadata } from "xmcp";
import { RESOURCES } from "@/lib/text";

export const metadata: ResourceMetadata = {
  name: "about",
  title: "About Bible Ontology",
  description: "What the graph is, how it is read, and how to cite it.",
};

export default function about() {
  return RESOURCES.about;
}
