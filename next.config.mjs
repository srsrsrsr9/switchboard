/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: false,
  // Two lockfiles exist above this directory; pin the root so tracing is correct.
  outputFileTracingRoot: import.meta.dirname,
  webpack: (config) => {
    // The dialer writes data/store.json constantly. Without this the dev
    // watcher treats every write as a source change and reloads the page.
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ["**/node_modules/**", "**/.git/**", "**/data/**"],
    };
    return config;
  },
};
