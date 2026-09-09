/** Prevent stale HTML from masking client bundle updates on the home route. */
const nextConfig = {
  async headers() {
    return [{
      source: "/",
      headers: [{ key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" }],
    }];
  },
};

module.exports = nextConfig;
