import { useState } from 'react';
import Layout from './components/layout/Layout';
import ProfileView from './components/pages/ProfileView';
import SearchView from './components/pages/SearchView';
import WorkspaceView from './components/pages/WorkspaceView';
import AuthPage from './components/pages/AuthPage';
// ProfileView loads documents and profile from Supabase / localStorage directly.
import { useSupabaseAuth } from './hooks/useSupabaseAuth';
import './App.css';

// const PROFILE_STORAGE_KEY = 'grantflow.organizationProfile';
// const PROFILE_SUMMARY_STORAGE_KEY = 'grantflow.profileSummary';

// function buildProfileSummary(profile: string) {
//   const trimmed = profile.trim();
//   const preview = trimmed.slice(0, 320);
//   const sentenceCount = trimmed ? trimmed.split(/[.!?]+/).filter(Boolean).length : 0;

//   return {
//     preview,
//     characters: trimmed.length,
//     sentences: sentenceCount,
//     updatedAt: new Date().toISOString(),
//   };
// }

function App() {
  const { session, loading: authLoading, supabaseConfigured } = useSupabaseAuth();
  const [activeView, setActiveView] = useState('profile');
  // organizationProfile now managed via localStorage by ProfileView
  // SearchView reads organization profile from localStorage
  const profileReady = !supabaseConfigured || !!session?.user;

  // useEffect(() => {
  //   if (!supabaseConfigured || !session?.user || !profileReady) return;

  //   const id = session.user.id;
  //   const t = window.setTimeout(() => {
  //     saveOrganizationProfileText(id, organizationProfile).catch((e) =>
  //       console.warn('Failed to save organization profile', e)
  //     );
  //   }, 800);

  //   return () => window.clearTimeout(t);
  // }, [organizationProfile, session, supabaseConfigured, profileReady]);

  if (supabaseConfigured && authLoading) {
    return (
      <div className="app-auth-loading" role="status" aria-live="polite">
        Loading…
      </div>
    );
  }

  if (supabaseConfigured && !session) {
    return <AuthPage />;
  }

  if (supabaseConfigured && session && !profileReady) {
    return (
      <div className="app-auth-loading" role="status" aria-live="polite">
        Loading your profile…
      </div>
    );
  }

  const renderView = () => {
    switch (activeView) {
      case 'profile':
        return <ProfileView />;
      case 'search':
        return <SearchView />;
      case 'workspace':
        return <WorkspaceView />;
      default:
        return <ProfileView />;
    }
  };

  return (
    <Layout activeView={activeView} onNavigate={setActiveView}>
      {renderView()}
    </Layout>
  );
}

export default App;
