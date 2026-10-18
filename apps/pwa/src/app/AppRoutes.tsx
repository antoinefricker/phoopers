import { Navigate, Route, Routes } from 'react-router';
import { AuthCallbackScreen } from '../auth/AuthCallbackScreen';
import { SignInScreen } from '../auth/SignInScreen';
import { HomeScreen } from '../home/HomeScreen';
import { LibraryScreen } from '../library/LibraryScreen';
import { MyPlaysScreen } from '../mine/MyPlaysScreen';
import { DraftEditorRoute, StoredEditorRoute } from '../play2d/EditorRoute';
import { AppShell } from './AppShell';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomeScreen />} />
        <Route path="library" element={<LibraryScreen />} />
        <Route path="mine" element={<MyPlaysScreen />} />
        <Route path="signin" element={<SignInScreen />} />
        <Route path="auth/callback" element={<AuthCallbackScreen />} />
      </Route>
      {/* Outside the shell: the editor draws its own header and fills the window. */}
      <Route path="play" element={<DraftEditorRoute />} />
      <Route path="play/:id" element={<StoredEditorRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
