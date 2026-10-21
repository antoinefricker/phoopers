import { Outlet } from 'react-router';
import { AppHeader } from './AppHeader';

/** The frame every page but the editor wears. The editor keeps its own column, and shares the header. */
export function AppShell() {
  return (
    <>
      <AppHeader />
      <main>
        <Outlet />
      </main>
    </>
  );
}
