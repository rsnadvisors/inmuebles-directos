import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Fully dynamic app (Supabase data per request): no incremental cache bucket needed.
export default defineCloudflareConfig({});
