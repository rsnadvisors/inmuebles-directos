import { readAdminSummary } from "../lib/admin-data";
import { adminBoundary, Overview } from "./components";
export default async function AdminOverviewPage() { return adminBoundary(async () => <Overview summary={await readAdminSummary()} />); }
