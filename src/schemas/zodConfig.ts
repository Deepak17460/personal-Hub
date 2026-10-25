import { z } from 'zod';

// The CSP forbids eval; without this Zod probes `new Function` and triggers a CSP violation.
z.config({ jitless: true });
