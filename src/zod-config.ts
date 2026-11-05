import { config } from 'zod';

// Zod probes `new Function` to decide whether to JIT-compile validators. Under
// a strict CSP the caught probe still fires a securitypolicyviolation, so keep
// validators interpreted (the payloads here are tiny). This module must be
// imported before any schema is constructed.
config({ jitless: true });
