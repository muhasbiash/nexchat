import { useState } from 'react';

import { useAuth } from './hooks/use-auth';
import { ChatPage } from './pages/ChatPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

type Page = 'home' | 'login' | 'register';

function App() {
  const { user, loading } = useAuth();

  const [page, setPage] = useState<Page>('home');

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-orb" />

        <div>
          <strong>NexChat</strong>
          <span>Preparing your conversations...</span>
        </div>
      </div>
    );
  }

  if (user) {
    return <ChatPage />;
  }

  if (page === 'login') {
    return <LoginPage onRegister={() => setPage('register')} />;
  }

  if (page === 'register') {
    return <RegisterPage onLogin={() => setPage('login')} />;
  }

  return (
    <HomePage
      onLogin={() => setPage('login')}
      onRegister={() => setPage('register')}
    />
  );
}

export default App;