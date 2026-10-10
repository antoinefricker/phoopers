import { useContext, useMemo, useState } from 'react';
import { Box, Button, Group, NavLink, type TreeNodeData } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { BranchId, Play } from '../engine';
import { ConfirmDelete } from '../editor/ConfirmDelete';
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

  // The dialog stays mounted so Mantine can run its exit transition; `count` re-keys it per open as a
  // guard for the future (ConfirmDelete is stateless today, so the key is currently inert)
  // and `target` is kept after closing so the body does not blank out mid-transition.
  const [deleting, setDeleting] = useState<{ target: BranchId | null; opened: boolean; count: number }>({
    target: null,
    opened: false,
    count: 0,
  });
  const nameOf = (id: BranchId) => play.branches.find((b) => b.id === id)?.name ?? id;

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

  // Says what goes with the branch: deleting one deletes everything forked from it.
  const deleteBody = () => {
    if (deleting.target === null) return null;
    const names = descendantsOf(play, deleting.target).map(nameOf);
    if (names.length === 0) return t('play.editor.deleteBranchBody', 'This branch will be deleted.');

    return t(
      'play.editor.deleteBranchBodyWithDescendants',
      'This branch and the variants forked from it will be deleted: {{names}}.',
      { names: names.join(', ') },
    );
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
                  aria-label={t('play.editor.forkFrom', 'Fork from {{name}}', { name: node.label })}
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
                    onClick={() =>
                      setDeleting((d) => ({ target: node.value as BranchId, opened: true, count: d.count + 1 }))
                    }
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
      <ConfirmDelete
        key={deleting.count}
        opened={deleting.opened}
        title={t('play.editor.deleteBranchTitle', 'Delete {{name}}?', {
          name: deleting.target === null ? '' : nameOf(deleting.target),
        })}
        body={deleteBody()}
        confirmLabel={t('play.editor.delete', 'Delete')}
        onConfirm={() => {
          if (deleting.target !== null) remove(deleting.target);
          setDeleting((d) => ({ ...d, opened: false }));
        }}
        onClose={() => setDeleting((d) => ({ ...d, opened: false }))}
      />
      {forkingFrom !== null && <ForkDialog parentBranchId={forkingFrom} onClose={() => setForkingFrom(null)} />}
    </>
  );
}
