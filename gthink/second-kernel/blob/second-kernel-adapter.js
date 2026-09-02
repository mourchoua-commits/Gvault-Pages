import { loadSecondKernelKnowledge, buildSecondKernelTaskPacket } from './loader.js';

const KEYWORDS = {
  architecture: /architecture|structure|module|route|greffe|graft|gva?ult|go\.s/i,
  capabilities: /capacit|outil|service|connect|github|fichier|worker|agent/i
};

function inferBranches(task = {}) {
  const text = [task.intent, task.requestedFunction, task.text, task.message, ...(task.constraints || [])]
    .filter(Boolean).join(' ');
  return Object.entries(KEYWORDS).filter(([, re]) => re.test(text)).map(([id]) => id);
}

let readyPromise = null;

export function ready() {
  if (!readyPromise) readyPromise = loadSecondKernelKnowledge({ branches: ['architecture', 'capabilities'] });
  return readyPromise;
}

export async function contextForTask(task = {}) {
  const branches = inferBranches(task);
  return buildSecondKernelTaskPacket(task, { branches });
}

export async function getBranch(id) {
  const knowledge = await loadSecondKernelKnowledge({ branches: [id] });
  return knowledge.branches[id] || null;
}

export const secondKernelKnowledge = Object.freeze({
  schema: 'gthink.second-kernel.knowledge-adapter.v1',
  parentBlobId: 'GT-SECOND-KERNEL-KNOWLEDGE',
  ready,
  contextForTask,
  getBranch,
  inferBranches
});

if (typeof window !== 'undefined') {
  window.GTHINK_SECOND_KERNEL_KNOWLEDGE = secondKernelKnowledge;
  ready().catch(() => null);
}
