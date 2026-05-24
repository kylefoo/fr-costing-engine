/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true
  },
  // Prevent Next.js from bundling these packages server-side.
  // @hyzyla/pdfium uses createRequire and loads a WASM file from the
  // filesystem; deepagents depends on Node.js native modules (fs,
  // child_process). Both must be required at runtime, not inlined.
  serverExternalPackages: [
    '@hyzyla/pdfium',
    'deepagents',
    'langchain',
    '@langchain/core',
    '@langchain/openai',
    '@langchain/google-genai',
    '@google/generative-ai',
    '@langchain/langgraph',
    '@langchain/langgraph-sdk',
  ],
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    return config;
  },
};

module.exports = nextConfig;
