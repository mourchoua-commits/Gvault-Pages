# GThink Second Kernel · Public Knowledge Blob

Entry point: `manifest.json`

This directory is one public parent blob split into specialized knowledge branches. The second kernel should load branches marked `always`, then request optional branches only when the task needs them.

## Runtime

```js
import { loadSecondKernelKnowledge, buildSecondKernelTaskPacket } from './loader.js';
const knowledge = await loadSecondKernelKnowledge({ branches: ['architecture', 'capabilities'] });
const packet = await buildSecondKernelTaskPacket({ taskId: 'task-1', intent: 'assist', requestedFunction: 'analyze' });
```

## Branches

- `routing`: interpretation and placement rules.
- `architecture`: GVAULT / Go.S / GThink system map.
- `task-methods`: quality, FiCsa, ProdOui, SACREBLEU and snapshot/triangulation methodology.
- `capabilities`: what the second kernel may use and its public/private boundaries.
- `handoff`: structured cooperation contract with the primary core.

The public blob intentionally excludes credentials, private captures, private verbatim and protected vault material. Those remain behind an explicit authenticated bridge.
