/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  distDir: '_static',
  images: {
    unoptimized: true
  },
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    return config;
  },
};

module.exports = nextConfig;
