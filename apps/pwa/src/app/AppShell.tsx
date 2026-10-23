import { Outlet } from 'react-router';
import { AppHeader } from './AppHeader';
import { AppMenu } from './AppMenu';

/** The frame every page but the editor wears. The editor keeps its own column, and shares the header. */
export function AppShell() {
  return (
    <>
      {/* Ahead of the wordmark, where the editor's burger is too: one menu in one place,
          whichever page the coach is on. */}
      <AppHeader leading={<AppMenu />} />
      <main>
        <Outlet />
      </main>
    </>
  );
}
