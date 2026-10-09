import { useMemo } from 'react';
import { Box, NavLink, type TreeNodeData } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { BranchId, Play } from '../engine';
import { branchTreeData } from './branchTreeData';
import { usePlaybackContext } from './usePlaybackContext';

interface Props {
  play: Play;
}

// Composed from Mantine NavLink rather than Mantine Tree. Tree's keyboard handler covers
// only the arrow keys and Space (which toggles expansion), so there is no key that selects
// a node, and select-on-activate is what a branch switch needs. NavLink buttons activate on
// Enter and Space natively.
//
// The hierarchy is exposed as nested lists inside a nav, not role="tree": a tree role would
// promise roving tabindex and arrow-key navigation that this does not implement. NavLink is
// used WITHOUT children on purpose: with children it swallows Space to toggle a collapse
// that is not wanted here, which would stop keyboard users selecting any parent branch.
export function BranchTree({ play }: Props) {
  const { t } = useTranslation();
  const { branchId, selectBranch, seek } = usePlaybackContext();
  const data = useMemo(() => branchTreeData(play), [play]);

  const select = (id: BranchId) => {
    if (id === branchId) {
      return;
    }
    selectBranch(id);
    // The new branch replays the shared opening, so the playhead returns to the start.
    // Playback state is left alone: a coach watching keeps watching.
    seek(0);
  };

  const renderNodes = (nodes: TreeNodeData[], nested: boolean) => (
    <Box component="ul" m={0} p={0} pl={nested ? 'md' : 0} style={{ listStyle: 'none' }}>
      {nodes.map((node) => (
        <li key={node.value}>
          <NavLink
            component="button"
            type="button"
            label={node.label}
            active={node.value === branchId}
            aria-current={node.value === branchId ? 'true' : undefined}
            onClick={() => select(node.value as BranchId)}
          />
          {node.children !== undefined && node.children.length > 0 ? renderNodes(node.children, true) : null}
        </li>
      ))}
    </Box>
  );

  return <nav aria-label={t('play.branches.label', 'Play branches')}>{renderNodes(data, false)}</nav>;
}
