// Next.js v16 looks for proxy.js at the same level as app/ (i.e., src/)
// when using src/app/ directory structure. This file re-exports from the
// root proxy.js so that clerkMiddleware is properly registered.
// See: https://nextjs.org/docs/app/api-reference/file-conventions/proxy
import proxyFn, { config } from "../proxy.js";

export default proxyFn;
export { proxyFn as proxy };
export { config };
