import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

import '../node_modules/bootstrap/dist/css/bootstrap.min.css';
import '../node_modules/bootstrap/dist/js/bootstrap.bundle.min.js';

import { BrowserRouter } from 'react-router-dom';

import { Provider } from 'react-redux';
import { store } from './app/store';

import { ApolloProvider } from '@apollo/client';
import client from './graphql/apolloClient';

import { registerServiceWorker } from './pwa/serviceWorker.js';

// Disable console logs in production, but keep warn and error
if (import.meta.env.VITE_DISABLE_CONSOLE === 'true') {
  console.log = console.info = console.debug = function() {};
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ApolloProvider client={client}>
      <Provider store={store}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </Provider>
    </ApolloProvider>
  </StrictMode>,
)

// Register SW after app renders
registerServiceWorker();