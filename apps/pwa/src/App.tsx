import { BrowserRouter } from 'react-router';
import { AuthContextProvider } from './auth/AuthContextProvider';
import { AppRoutes } from './app/AppRoutes';
import { QueryProvider } from './app/QueryProvider';

export default function App() {
  return (
    <QueryProvider>
      <AuthContextProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthContextProvider>
    </QueryProvider>
  );
}
