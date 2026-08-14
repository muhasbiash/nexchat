import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main>
      <h1>404</h1>
      <p>Page not found.</p>
      <Link to="/">Back to home</Link>
    </main>
  );
}
