  import { ApolloClient, InMemoryCache, HttpLink, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
// Apollo v3 onError must return an Observable, not a Promise.
// fromPromise converts our async refresh logic into a proper Observable.
import { fromPromise } from '@apollo/client';
import { store } from '../app/store';
import { setCredentials, clearCredentials } from '../app/authSlice';
// apiClient would trigger axiosConfigs interceptor on a 401, which runs its
// OWN refresh logic in parallel — two simultaneous refreshes = race condition
// and the second one always fails (refresh token already rotated).
import axios from 'axios';
import sessionManager from '../utils/sessionManager';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// BUG 4 FIX: Template literals are always truthy, so the || fallback never fires.
// Use conditional assignment instead.
const ANALYTICS_SERVER_URL = import.meta.env.VITE_ANALYTICS_URL
  ? `${import.meta.env.VITE_ANALYTICS_URL}/graphql`
  : 'http://localhost:5001/graphql';

const httpLink = new HttpLink({
  uri: ANALYTICS_SERVER_URL,
  credentials: 'include',
});

const authLink = setContext((_, { headers }) => {
  const state = store.getState();
  const token = state?.auth?.accessToken;

  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
      'x-timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
      'x-locale': navigator.language || 'en-US',
      'x-request-timestamp': new Date().toISOString(),
    }
  };
});

import { refreshTokenShared } from '../utils/axiosConfigs';

const getNewToken = () => {
  return refreshTokenShared();
};

const errorLink = onError(({ graphQLErrors, networkError, operation, forward }) => {
  const is401 =
    networkError?.statusCode === 401 ||
    graphQLErrors?.some(e => e.extensions?.code === 'UNAUTHENTICATED');

  if (is401) {
    return fromPromise(getNewToken())
      .flatMap(newToken => {
        operation.setContext(({ headers = {} }) => ({
          headers: { ...headers, authorization: `Bearer ${newToken}` },
        }));
        return forward(operation);
      });
  }
});

const client = new ApolloClient({
  link: from([errorLink, authLink, httpLink]),
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          dashboard:        { merge(_, incoming) { return incoming; } },
          spendingTrends:   { merge(_, incoming) { return incoming; } },
          categoryAnalysis: { merge(_, incoming) { return incoming; } },
          goalsProgress:    { merge(_, incoming) { return incoming; } },
          incomeTrends:     { merge(_, incoming) { return incoming; } },
        }
      }
    }
  }),
  connectToDevTools: import.meta.env.DEV,
});

export default client;