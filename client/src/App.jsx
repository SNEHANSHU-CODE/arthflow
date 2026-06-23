import React, { useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux';

import PWAManager from './pwa/PWAManager';
import SettingsProvider from './context/SettingsContext';
import { fetchUserPreferences, logoutUser } from './app/authSlice';

import AppRouter from './routes/AppRouter'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import ScrollToTop from './components/ScrollToTop';
import Chatbot from './components/ChatBot';

function App() {
  const dispatch = useDispatch();
  const isAuthenticated = useSelector((state) => state.auth?.isAuthenticated);
  const accessToken = useSelector((state) => state.auth?.accessToken);

  // Initialize preferences on mount
  useEffect(() => {
    if (isAuthenticated) {
      // Fetch preferences from server
      dispatch(fetchUserPreferences());
    }
  }, [isAuthenticated, dispatch]);

  return (
    <SettingsProvider>
      <div>
        <PWAManager />
        <ScrollToTop />
        <Navbar />
        <Chatbot />
        <AppRouter />
        <Footer />
      </div>
    </SettingsProvider>
  )
}

export default App
