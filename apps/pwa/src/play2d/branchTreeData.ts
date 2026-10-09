import type { TreeNodeData } from '@mantine/core';
import type { BranchId, Play } from '../engine';

export function branchTreeData(play: Play): TreeNodeData[] {
  // `path` holds the ids from the root down to the node being built. A well-formed play is
  // a tree and never trips it; it only stops duplicated ids (which validatePlay rejects)
  // from recursing forever. Parent cycles are unreachable from a null parent, so they drop out.
  const childrenOf = (parentId: BranchId | null, path: ReadonlySet<BranchId>): TreeNodeData[] =>
    play.branches
      .filter((branch) => branch.parentId === parentId && !path.has(branch.id))
      .map((branch) => ({
        value: branch.id,
        label: branch.name,
        children: childrenOf(branch.id, new Set(path).add(branch.id)),
      }));

  return childrenOf(null, new Set());
}
