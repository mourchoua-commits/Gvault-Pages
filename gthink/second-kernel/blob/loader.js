export async function loadSecondKernelKnowledge(options = {}) {
  const base = options.base || new URL('./', import.meta.url);
  const manifestUrl = new URL('manifest.json', base);
  const manifest = await fetch(manifestUrl, { cache: 'no-cache' }).then(r => {
    if (!r.ok) throw new Error(`SECOND_KERNEL_MANIFEST_${r.status}`);
    return r.json();
  });

  const requested = new Set(options.branches || []);
  const selected = manifest.branches.filter(b => b.load === 'always' || requested.has(b.id));
  const knowledge = { manifest, branches: {}, errors: [] };

  await Promise.all(selected.map(async branch => {
    try {
      const url = new URL(branch.path, manifestUrl);
      const data = await fetch(url, { cache: 'no-cache' }).then(r => {
        if (!r.ok) throw new Error(`BRANCH_${branch.id}_${r.status}`);
        return r.json();
      });
      knowledge.branches[branch.id] = data;
    } catch (error) {
      knowledge.errors.push({ branchId: branch.id, error: String(error?.message || error) });
    }
  }));

  return knowledge;
}

export async function buildSecondKernelTaskPacket(task, options = {}) {
  const knowledge = await loadSecondKernelKnowledge(options);
  return {
    schema: 'gthink.second-kernel.task-packet.v1',
    task,
    knowledge,
    loadedAt: new Date().toISOString()
  };
}
