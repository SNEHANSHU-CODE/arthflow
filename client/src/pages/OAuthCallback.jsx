import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { setCredentials } from '../app/authSlice';
import { authService } from '../services/authService';
import sessionManager from '../utils/sessionManager';

/**
 * OAuth Callback Handler
 * This page handles the redirect from Google OAuth
 * Route: /oauth/callback
 */
export default function OAuthCallback() {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const [searchParams] = useSearchParams();
    const [status, setStatus] = useState('processing');

    useEffect(() => {
        const handleOAuthCallback = async () => {
            try {
                // Check for error in URL params (from backend redirect)
                const error = searchParams.get('error');
                if (error) {
                    console.error('OAuth error:', error);
                    setStatus('error');
                    setTimeout(() => navigate(`/login?error=${error}`), 2000);
                    return;
                }

                setStatus('processing');

                // STEP 1: Exchange the refreshToken cookie for an access token.
                // Right after OAuth, there is no access token in memory — only the
                // httpOnly refreshToken cookie that Google's callback set.
                // /auth/refresh reads that cookie and returns a fresh access token.
                const refreshData = await authService.refreshToken();
                const accessToken = refreshData?.accessToken;

                if (!accessToken) {
                    throw new Error('No access token returned from refresh');
                }

                // STEP 2: Now fetch the user profile using the access token.
                // authService.getProfile() will pick up the token via the
                // request interceptor once we temporarily set it below.
                // Easiest approach: pass it directly via a one-off call.
                const profileData = await authService.getProfile(accessToken);

                // STEP 3: Populate Redux state — this marks the user as authenticated.
                dispatch(setCredentials({
                    user: profileData.user,
                    accessToken,
                }));
                sessionManager.createSession(profileData.user, accessToken);

                setStatus('success');

                setTimeout(() => navigate('/dashboard', { replace: true }), 1000);

            } catch (error) {
                console.error('OAuth callback error:', error);
                setStatus('error');
                setTimeout(() => navigate('/login?error=oauth_verification_failed'), 2000);
            }
        };

        handleOAuthCallback();
    }, [navigate, dispatch, searchParams]);

    return (
        <div className="container-fluid min-vh-100 d-flex align-items-center justify-content-center bg-light">
            <div className="text-center">
                <div className="card shadow-lg border-0 p-5" style={{ maxWidth: '400px' }}>
                    {status === 'processing' && (
                        <>
                            <div className="mb-4">
                                <div className="spinner-border text-primary" role="status" style={{ width: '3rem', height: '3rem' }}>
                                    <span className="visually-hidden">Loading...</span>
                                </div>
                            </div>
                            <h4 className="mb-2">Completing Sign In</h4>
                            <p className="text-muted">Please wait while we finish setting up your account...</p>
                        </>
                    )}

                    {status === 'success' && (
                        <>
                            <div className="mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="currentColor" className="bi bi-check-circle text-success" viewBox="0 0 16 16">
                                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                                    <path d="M10.97 4.97a.235.235 0 0 0-.02.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-1.071-1.05z"/>
                                </svg>
                            </div>
                            <h4 className="mb-2 text-success">Success!</h4>
                            <p className="text-muted">Redirecting to your dashboard...</p>
                        </>
                    )}

                    {status === 'error' && (
                        <>
                            <div className="mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="currentColor" className="bi bi-exclamation-circle text-danger" viewBox="0 0 16 16">
                                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                                    <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/>
                                </svg>
                            </div>
                            <h4 className="mb-2 text-danger">Authentication Failed</h4>
                            <p className="text-muted">Redirecting to login page...</p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}