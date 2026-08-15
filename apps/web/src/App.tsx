import { useState } from 'react';

import { useAuth } from './hooks/use-auth';
import { ChatPage } from './pages/ChatPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

type Page = 'login' | 'register';

function App() {
  const { user, loading } = useAuth();

  const [page, setPage] = useState<Page>('login');

  if (loading) {
    return <div>Loading NexChat...</div>;
  }

  if (!user) {
    if (page === 'register') {
      return <RegisterPage onLogin={() => setPage('login')} />;
    }

    return <LoginPage onRegister={() => setPage('register')} />;
  }

  return <ChatPage />;
}

export default App;
