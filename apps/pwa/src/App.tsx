import { BrowserRouter } from 'react-router';
import { AuthContextProvider } from './auth/AuthContextProvider';
import { CacheFollowsAccount } from './auth/CacheFollowsAccount';
import { AppRoutes } from './app/AppRoutes';
import { QueryProvider } from './app/QueryProvider';

export default function App() {
  return (
    <QueryProvider>
      <AuthContextProvider>
        <CacheFollowsAccount />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthContextProvider>
    </QueryProvider>
  );
}
