import { useContext, useMemo, useState } from 'react';
import { Box, Button, Group, NavLink, type TreeNodeData } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { BranchId, Play } from '../engine';
import { ForkDialog } from '../editor/ForkDialog';
import { descendantsOf } from '../editor/mutations';
import { EditorContext } from '../editor/useEditorContext';
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
  // Read the context directly: the tree still renders without an editor around it, and then
  // there is simply nothing to fork or delete.
  const editor = useContext(EditorContext);
  const editing = editor?.mode === 'edit';
  const [forkingFrom, setForkingFrom] = useState<BranchId | null>(null);

  const remove = (id: BranchId) => {
    if (editor === null) return;
    // Deleting a branch deletes its descendants too. If the one on screen is among them, return
    // to the root rather than leave the playback context pointing at a branch that is gone.
    const doomed = [id, ...descendantsOf(play, id)];
    editor.removeBranch(id);
    if (doomed.includes(branchId)) {
      selectBranch(play.rootBranchId);
      seek(0);
    }
  };

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
          <Group gap={4} wrap="nowrap">
            <NavLink
              component="button"
              type="button"
              label={node.label}
              active={node.value === branchId}
              aria-current={node.value === branchId ? 'true' : undefined}
              onClick={() => select(node.value as BranchId)}
              style={{ flex: 1 }}
            />
            {editing && (
              <>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  aria-label={t('play.editor.forkFrom', 'Create a variant from {{name}}', { name: node.label })}
                  onClick={() => setForkingFrom(node.value as BranchId)}
                >
                  {t('play.editor.fork', 'Fork')}
                </Button>
                {/* The root has no delete action at all, rather than one that fails on click. */}
                {node.value !== play.rootBranchId && (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="red"
                    aria-label={t('play.editor.deleteBranch', 'Delete {{name}}', { name: node.label })}
                    onClick={() => remove(node.value as BranchId)}
                  >
                    {t('play.editor.delete', 'Delete')}
                  </Button>
                )}
              </>
            )}
          </Group>
          {node.children !== undefined && node.children.length > 0 ? renderNodes(node.children, true) : null}
        </li>
      ))}
    </Box>
  );

  return (
    <>
      <nav aria-label={t('play.branches.label', 'Play branches')}>{renderNodes(data, false)}</nav>
      {forkingFrom !== null && <ForkDialog parentBranchId={forkingFrom} onClose={() => setForkingFrom(null)} />}
    </>
  );
}
