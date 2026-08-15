import { useState } from 'react';

import { useAuth } from './hooks/use-auth';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

type Page = 'login' | 'register';

function App() {
  const { user, loading, logout } = useAuth();

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

  return (
    <div>
      <header>
        <h1>NexChat</h1>

        <p>
          Welcome, <strong>{user.name}</strong>
        </p>

        <p>{user.email}</p>

        <button type="button" onClick={logout}>
          Logout
        </button>
      </header>

      <main>
        <HomePage />
      </main>
    </div>
  );
}

export default App;
