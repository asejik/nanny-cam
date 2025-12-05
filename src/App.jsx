import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import Auth from './components/Auth';
import { Loader2 } from 'lucide-react';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check active session on load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // 2. Listen for changes (login, logout, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // If no session, show the Auth screen
  if (!session) {
    return <Auth />;
  }

  // If logged in, show the Dashboard (Placeholder for now)
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl rounded-2xl bg-white p-8 shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 pb-6">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <button
            onClick={handleLogout}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200"
          >
            Sign Out
          </button>
        </div>
        <div className="mt-8">
          <p className="text-gray-600">
            Welcome, <span className="font-semibold">{session.user.email}</span>!
          </p>
          <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
            <p className="text-gray-500">Your rooms will appear here soon.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;