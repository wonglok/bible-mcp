import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The MCP route reads the ontology snapshot from disk at run time. Ship the
  // snapshot with that route's serverless function so `process.cwd()/ontology-data`
  // resolves on Vercel. No other route needs it.
  outputFileTracingIncludes: {
    "/mcp": ["./ontology-data/**"],
  },
};

export default nextConfig;
