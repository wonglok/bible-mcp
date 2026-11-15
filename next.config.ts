import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The ontology snapshot is read from disk at run time; keep it out of the
  // bundle so a large data file is not traced into every function.
  outputFileTracingExcludes: {
    "/*": ["./ontology-data/**"],
  },
};

export default nextConfig;
