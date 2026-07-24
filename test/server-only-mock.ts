// Stub for the `server-only` package (vitest.config.ts aliases it here).
// The real package unconditionally throws on import outside Next.js's
// react-server bundler condition, which would break every test that imports
// a server-only lib module (buildFilter.ts, areas.ts, etc.) even though the
// functions under test are plain, side-effect-free logic.
export {};
