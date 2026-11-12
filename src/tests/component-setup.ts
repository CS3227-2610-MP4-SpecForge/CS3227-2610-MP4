// Component tests render with the real application stylesheet so layout,
// focus outlines and dialog behaviour match the app.
import "../app/globals.css";

// Next.js client modules such as next/link read process.env, which the
// browser test runner does not provide.
const runtime = globalThis as { process?: { env: Record<string, string> } };
runtime.process ??= { env: { NODE_ENV: "test" } };
