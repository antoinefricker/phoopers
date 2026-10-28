import { BrowserRouter } from 'react-router';
import { AuthContextProvider } from './auth/AuthContextProvider';
import { CacheFollowsAccount } from './auth/CacheFollowsAccount';
import { AppRoutes } from './app/AppRoutes';
import { QueryProvider } from './app/QueryProvider';
import { SettingsContextProvider } from './settings/SettingsContextProvider';

export default function App() {
  return (
    <QueryProvider>
      <AuthContextProvider>
        <SettingsContextProvider>
          <CacheFollowsAccount />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </SettingsContextProvider>
      </AuthContextProvider>
    </QueryProvider>
  );
}
