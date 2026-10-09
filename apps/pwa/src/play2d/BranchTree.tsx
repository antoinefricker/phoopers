import { NavLink, type TreeNodeData } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { BranchId, Play } from '../engine';
import { branchTreeData } from './branchTreeData';
import { usePlaybackContext } from './usePlaybackContext';

interface Props {
  play: Play;
}

// Composed from Mantine NavLink rather than Mantine Tree. Tree keeps its own selection and
// expansion state (a second source of truth beside the playback branch), starts collapsed,
// toggles expansion on click, and has no keyboard path that selects a node, since its Enter
// key does nothing. A branch switch needs none of that: every branch stays visible, one is
// current, and activating a node selects it.
export function BranchTree({ play }: Props) {
  const { t } = useTranslation();
  const { branchId, selectBranch, seek } = usePlaybackContext();

  const select = (id: BranchId) => {
    if (id === branchId) {
      return;
    }
    selectBranch(id);
    // The new branch replays the shared opening, so the playhead returns to the start.
    // Playback state is left alone: a coach watching keeps watching.
    seek(0);
  };

  const renderNodes = (nodes: TreeNodeData[]) =>
    nodes.map((node) => (
      <NavLink
        key={node.value}
        component="button"
        type="button"
        label={node.label}
        active={node.value === branchId}
        aria-current={node.value === branchId ? 'true' : undefined}
        opened
        rightSection={null}
        onClick={() => select(node.value as BranchId)}
      >
        {node.children !== undefined && node.children.length > 0 ? renderNodes(node.children) : undefined}
      </NavLink>
    ));

  return <nav aria-label={t('play.branches.label', 'Play branches')}>{renderNodes(branchTreeData(play))}</nav>;
}
