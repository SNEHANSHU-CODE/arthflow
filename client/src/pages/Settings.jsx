import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { 
  FaCog,
  FaMobile,
  FaDesktop,
  FaSignOutAlt,
  FaSave,
  FaDollarSign,
  FaPalette,
  FaSpinner,
  FaCheck,
  FaExclamationTriangle,
  FaShieldAlt
} from "react-icons/fa";
import { 
  updateUserPreferences, 
  fetchUserPreferences,
  resetUserPreferences,
  clearPreferencesError,
  fetchActiveSessions,
  terminateSessionAction,
  terminateAllSessionsAction,
  toggleMFA
} from "../app/authSlice";
import { useToast } from "../hooks/useToast";

export default function Settings() {
  const dispatch = useDispatch();
  const { showToast } = useToast();
  
  // Redux state
  const { 
    preferences, 
    preferencesLoading, 
    preferencesError,
    user,
    isAuthenticated,
    sessions,
    sessionsLoading,
    sessionsError
  } = useSelector((state) => state.auth);

  // Local state for form handling
  const [localPreferences, setLocalPreferences] = useState(preferences);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch sessions on mount if authenticated
  useEffect(() => {
    if (isAuthenticated) {
      dispatch(fetchActiveSessions());
    }
  }, [dispatch, isAuthenticated]);

  // Update local preferences when Redux preferences change
  useEffect(() => {
    setLocalPreferences(preferences);
    setHasChanges(false);
  }, [preferences]);

  // Fetch preferences on mount if authenticated
  useEffect(() => {
    if (isAuthenticated) {
      dispatch(fetchUserPreferences());
    }
  }, [dispatch, isAuthenticated]);

  // Clear success message after 3 seconds
  useEffect(() => {
    if (saveSuccess) {
      const timer = setTimeout(() => setSaveSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [saveSuccess]);

  const handlePreferenceChange = (setting, value) => {
    const newPreferences = { ...localPreferences, [setting]: value };
    setLocalPreferences(newPreferences);
    
    // Check if there are changes from the original preferences
    const hasChangesNow = Object.keys(newPreferences).some(
      key => newPreferences[key] !== preferences[key]
    );
    setHasChanges(hasChangesNow);
  };

  const handleSavePreferences = async () => {
    if (!hasChanges) return;
    try {
      await dispatch(updateUserPreferences(localPreferences)).unwrap();
      setSaveSuccess(true);
      setHasChanges(false);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save preferences:', error);
    }
  };

  const handleResetPreferences = async () => {
    try {
      await dispatch(resetUserPreferences()).unwrap();
      showToast('Preferences reset to default', 'success');
    } catch (error) {
      console.error('Failed to reset preferences:', error);
      showToast('Failed to reset preferences', 'error');
    }
  };

  const dismissError = () => {
    dispatch(clearPreferencesError());
  };

  if (!isAuthenticated) {
    return (
      <div className="container-fluid">
        <div className="row justify-content-center">
          <div className="col-12 col-md-6 text-center">
            <p className="text-muted">Please login to view settings</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-12">
          {/* Header */}
          <div className="mb-4">
            <h2 className="h4 mb-2">Settings</h2>
            <p className="text-muted">Manage your preferences and account settings</p>
          </div>

          {/* Error Alert */}
          {preferencesError && (
            <div className="alert alert-danger alert-dismissible fade show mb-4" role="alert">
              <FaExclamationTriangle className="me-2" />
              {preferencesError}
              <button 
                type="button" 
                className="btn-close" 
                onClick={dismissError}
                aria-label="Close"
              ></button>
            </div>
          )}

          {/* Success Alert */}
          {saveSuccess && (
              <div className="alert alert-success fade show mb-4" role="alert">
              <FaCheck className="me-2" />
              Preferences saved successfully
            </div>
          )}

          <div className="row g-4">
            {/* Main Content */}
            <div className="col-12">
              {/* Preferences Card */}
              <div className="card shadow-sm mb-4">
                <div className="card-header bg-white border-bottom">
                  <div className="d-flex justify-content-between align-items-center">
                    <h5 className="mb-0 d-flex align-items-center">
                      <FaCog className="me-2" />
                      Settings
                    </h5>
                    {hasChanges && (
                      <span className="badge bg-warning text-dark">
                        Unsaved changes
                      </span>
                    )}
                  </div>
                </div>
                <div className="card-body">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label d-flex align-items-center">
                        <FaDollarSign className="me-2" />
                        Currency
                      </label>
                      <select
                        className="form-select"
                        value={localPreferences.currency}
                        onChange={(e) => handlePreferenceChange('currency', e.target.value)}
                        disabled={preferencesLoading}
                      >
                        <option value="INR">Indian Rupee (INR)</option>
                        <option value="USD">US Dollar (USD)</option>
                        <option value="EUR">Euro (EUR)</option>
                        <option value="GBP">British Pound (GBP)</option>
                        <option value="CAD">Canadian Dollar (CAD)</option>
                        <option value="AUD">Australian Dollar (AUD)</option>
                      </select>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label d-flex align-items-center">
                        <FaPalette className="me-2" />
                        Theme
                      </label>
                      <select
                        className="form-select"
                        value={localPreferences.theme}
                        onChange={(e) => handlePreferenceChange('theme', e.target.value)}
                        disabled={preferencesLoading}
                      >
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                        <option value="auto">Auto</option>
                      </select>
                    </div>
                  </div>

                  <div className="d-flex justify-content-between align-items-center mt-4">
                    <button 
                      className="btn btn-outline-secondary"
                      onClick={handleResetPreferences}
                      disabled={preferencesLoading}
                    >
                      Reset to Default
                    </button>
                    
                    <div className="d-flex gap-2">
                      <button 
                        className="btn btn-primary d-flex align-items-center"
                        onClick={handleSavePreferences}
                        disabled={!hasChanges || preferencesLoading}
                      >
                        {preferencesLoading ? (
                          <>
                            <div className="spinner-border spinner-border-sm me-2" role="status"></div>
                            Saving
                          </>
                        ) : (
                          <>
                            <FaSave className="me-2" />
                            Save Preferences
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* MFA Card - only for email/password users */}
              {user?.authProvider !== 'google' && (
              <div className="card shadow-sm mb-4">
                <div className="card-header bg-white border-bottom">
                  <h5 className="mb-0 d-flex align-items-center">
                    <FaShieldAlt className="me-2" />
                    Two-Factor Authentication
                  </h5>
                </div>
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <p className="mb-1 fw-semibold">Email OTP on login</p>
                      <p className="text-muted small mb-0">
                        {preferences.mfaEnabled
                          ? 'An OTP will be sent to your email every time you log in.'
                          : 'Enable to require an OTP email verification on every login.'}
                      </p>
                    </div>
                    <div className="form-check form-switch ms-4">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        role="switch"
                        id="mfaToggle"
                        checked={!!preferences.mfaEnabled}
                        onChange={(e) => dispatch(toggleMFA(e.target.checked))}
                        disabled={preferencesLoading}
                        style={{ width: '3em', height: '1.5em', cursor: 'pointer' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              )}

              {/* Active Sessions Card */}
              <div className="card shadow-sm">
                <div className="card-header bg-white border-bottom">
                  <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center">
                    <div className="d-flex align-items-center gap-2">
                        <h5 className="mb-0 d-flex align-items-center">
                        <FaDesktop className="me-2" />
                        Active Sessions
                      </h5>

                    </div>
                    {sessions.length > 1 && (
                      <button 
                        className="btn btn-outline-danger btn-sm d-flex align-items-center"
                        onClick={() => dispatch(terminateAllSessionsAction())}
                        disabled={sessionsLoading}
                      >
                        <FaSignOutAlt className="me-2" />
                        {sessionsLoading ? 'Signing out' : 'Sign Out All'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="card-body p-0">
                  {sessionsLoading && !sessions.length ? (
                    <div className="p-3 text-center">
                      <div className="spinner-border spinner-border-sm me-2" role="status"></div>
                      Loading sessions
                    </div>
                  ) : sessions.length === 0 ? (
                    <div className="p-3 text-center text-muted">
                      No active sessions
                    </div>
                  ) : (
                    sessions.map((session, index) => (
                      <div key={session._id} className={`p-3 ${index !== sessions.length - 1 ? 'border-bottom' : ''}`}>
                        <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center">
                          <div className="d-flex align-items-center mb-2 mb-sm-0">
                            <div className="bg-info bg-opacity-10 rounded-circle p-2 me-3">
                              {session.device?.toLowerCase().includes('mobile') ? 
                                <FaMobile className="text-info" /> : 
                                <FaDesktop className="text-info" />
                              }
                            </div>
                            <div>
                              <div className="fw-medium d-flex flex-column flex-sm-row align-items-start align-items-sm-center">
                                  <span className="me-2">{session.device || 'Unknown Device'}</span>
                                {session.isCurrent && (
                                    <span className="badge bg-success">Current</span>
                                )}
                              </div>
                              <small className="text-muted">
                                  {session.location || 'Unknown location'} • {session.lastActive || 'Just now'}
                              </small>
                            </div>
                          </div>
                          {!session.isCurrent && (
                            <button 
                              className="btn btn-outline-danger btn-sm"
                              onClick={() => dispatch(terminateSessionAction(session._id))}
                              disabled={sessionsLoading}
                            >
                              <FaSignOutAlt />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>


            </div>
          </div>
        </div>
      </div>
    </div>
  );
}