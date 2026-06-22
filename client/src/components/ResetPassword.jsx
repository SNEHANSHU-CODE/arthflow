import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../hooks/useToast';
import ToastNotification from './ToastNotification';
import { MdEmail, MdSecurity, MdArrowBack, MdLock, MdVisibility, MdVisibilityOff, MdCheck } from 'react-icons/md';
import OtpInput from './OtpInput';
import { setResendAllowed } from '../app/resetPasswordSlice';
import {
  sendPasswordReset,
  verifyPasswordReset,
  setNewPassword,
  clearError,
  resetFlow,
  goToPreviousStep,
  setEmail as setEmailAction,
  completePasswordReset
} from '../app/resetPasswordSlice';

const ResetPassword = () => {
  // Redux state
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { showToast, toasts, removeToast } = useToast();
  const {
    loading,
    error,
    currentStep,
    emailSent,
    codeVerified,
    passwordResetSuccess,
    email: reduxEmail
  } = useSelector(state => state.passwordReset);

  // Local state
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [otpValue, setOtpValue] = useState('');
  const [otpError, setOtpError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);

  // Password reset states
  const [passwords, setPasswords] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [showPasswords, setShowPasswords] = useState({
    newPassword: false,
    confirmPassword: false
  });
  const [passwordStrength, setPasswordStrength] = useState({
    score: 0,
    feedback: []
  });

  // Clear errors when Redux error changes
  useEffect(() => {
    if (error) {
      if (currentStep === 1) {
        setEmailError(error);
      } else if (currentStep === 2) {
        setOtpError(error);
      } else if (currentStep === 3) {
        setPasswordErrors(prev => ({ ...prev, general: error }));
      }
    }
  }, [error, currentStep]);

  // Handle successful password reset with timeout
  useEffect(() => {
    if (passwordResetSuccess) {
      showToast('Password reset successfully! You can now login with your new password.', 'success');
      
      const timeout = setTimeout(() => {
        dispatch(completePasswordReset());
        setEmail('');
        setOtpValue('');
        setPasswords({ newPassword: '', confirmPassword: '' });
        setPasswordStrength({ score: 0, feedback: [] });
        setPasswordErrors({});
        setEmailError('');
        setOtpError('');
        setResendTimer(0);
        setShowPasswords({ newPassword: false, confirmPassword: false });
        navigate('/login');
      }, 2000);

      return () => clearTimeout(timeout);
    }
  }, [passwordResetSuccess, dispatch, navigate]);

  // Start resend timer when email is sent
  useEffect(() => {
    if (emailSent && currentStep === 2) {
      setResendTimer(60);

      // Start countdown timer
      const timer = setInterval(() => {
        setResendTimer(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            dispatch(setResendAllowed(true));
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [emailSent, currentStep, dispatch]);

  // Sync local email with redux email
  useEffect(() => {
    if (reduxEmail && !email) {
      setEmail(reduxEmail);
    }
  }, [reduxEmail, email]);

  // Email validation
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Password validation
  const validatePassword = (password) => {
    const requirements = [
      { test: password.length >= 8, message: 'At least 8 characters' },
      { test: /[a-z]/.test(password), message: 'One lowercase letter' },
      { test: /[A-Z]/.test(password), message: 'One uppercase letter' },
      { test: /\d/.test(password), message: 'One number' },
      { test: /[!@#$%^&*(),.?":{}|<>]/.test(password), message: 'One special character' }
    ];

    const passed = requirements.filter(req => req.test);
    const failed = requirements.filter(req => !req.test);

    return {
      score: passed.length,
      feedback: failed.map(req => req.message),
      isValid: failed.length === 0
    };
  };

  const getPasswordStrengthColor = (score) => {
    if (score < 2) return 'danger';
    if (score < 4) return 'warning';
    return 'success';
  };

  const getPasswordStrengthText = (score) => {
    if (score < 2) return 'Weak';
    if (score < 4) return 'Medium';
    return 'Strong';
  };

  const handleEmailChange = (e) => {
    const value = e.target.value;
    setEmail(value);

    if (emailError) {
      setEmailError('');
      dispatch(clearError());
    }
  };

  const handleSendOTP = async (e) => {
    e.preventDefault();

    if (!email.trim()) {
      setEmailError('Email is required');
      return;
    }

    if (!validateEmail(email.trim())) {
      setEmailError('Please enter a valid email address');
      return;
    }

    // Clear any previous errors
    dispatch(clearError());
    setEmailError('');

    // Store email in Redux and dispatch action
    dispatch(setEmailAction(email.trim()));

    try {
      await dispatch(sendPasswordReset({ email: email.trim() })).unwrap();
      // Success is handled by Redux state changes and useEffect
    } catch (error) {
      // Error is handled by Redux state and useEffect
      console.error('Send OTP failed:', error);
    }
  };

  const handleOTPComplete = async (otpValue) => {
    setOtpValue(otpValue);
    setOtpError('');
    dispatch(clearError());

    try {
      await dispatch(verifyPasswordReset({
        email: reduxEmail || email,
        code: otpValue,
        otp: otpValue // Some APIs might expect 'otp' instead of 'code'
      })).unwrap();
      // Success is handled by Redux state changes
    } catch (error) {
      // Error is handled by Redux state and useEffect
      console.error('OTP verification failed:', error);
    }
  };

  const handleOTPReset = () => {
    setOtpValue('');
    setOtpError('');
    dispatch(clearError());
  };

  const handleResendOTP = async () => {
    if (resendTimer > 0 || loading) return;

    setOtpError('');
    dispatch(clearError());

    try {
      await dispatch(sendPasswordReset({ email: reduxEmail || email })).unwrap();
      // Timer will be started by useEffect when emailSent changes
    } catch (error) {
      console.error('Resend OTP failed:', error);
    }
  };

  const handleBackToEmail = () => {
    dispatch(goToPreviousStep());
    setOtpValue('');
    setOtpError('');
    setResendTimer(0);
  };

  // Password handlers
  const handlePasswordChange = (field, value) => {
    setPasswords(prev => ({ ...prev, [field]: value }));

    // Clear errors when user starts typing
    if (passwordErrors[field] || passwordErrors.general) {
      setPasswordErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        delete newErrors.general;
        return newErrors;
      });
      dispatch(clearError());
    }

    // Update password strength for new password
    if (field === 'newPassword') {
      const strength = validatePassword(value);
      setPasswordStrength(strength);
    }
  };

  const togglePasswordVisibility = (field) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();

    const errors = {};

    // Validate new password
    if (!passwords.newPassword) {
      errors.newPassword = 'New password is required';
    } else {
      const validation = validatePassword(passwords.newPassword);
      if (!validation.isValid) {
        errors.newPassword = 'Password does not meet requirements';
      }
    }

    // Validate confirm password
    if (!passwords.confirmPassword) {
      errors.confirmPassword = 'Please confirm your password';
    } else if (passwords.newPassword !== passwords.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(errors).length > 0) {
      setPasswordErrors(errors);
      return;
    }

    // Clear local errors and Redux errors
    setPasswordErrors({});
    dispatch(clearError());

    try {
      await dispatch(setNewPassword({
        newPassword: passwords.newPassword
      })).unwrap();
    } catch (error) {
      console.error('Password reset failed:', error);
    }
  };

  // Reset entire form (both Redux and local state)
  const handleResetForm = () => {
    // Reset Redux state
    dispatch(resetFlow());

    // Reset local state
    setEmail('');
    setOtpValue('');
    setPasswords({ newPassword: '', confirmPassword: '' });
    setPasswordStrength({ score: 0, feedback: [] });
    setPasswordErrors({});
    setEmailError('');
    setOtpError('');
    setResendTimer(0);
    setShowPasswords({ newPassword: false, confirmPassword: false });
  };

  // Use Redux currentStep
  const step = currentStep;
  const displayEmail = reduxEmail || email;

  return (
    <div className="container-fluid py-4 d-flex align-items-center justify-content-center bg-light">
      <div className="row w-100 justify-content-center nav-top-margin">
        <div className="col-12 col-sm-8 col-md-6 col-lg-4 col-xl-3">
          <div className="card shadow-lg border-0">
            <div className="card-body p-4">
              {/* Header */}
              <div className="text-center mb-4">
                <div className="mb-3">
                  {step === 1 ? (
                    <MdEmail size={48} className="text-primary" />
                  ) : step === 2 ? (
                    <MdSecurity size={48} className="text-primary" />
                  ) : (
                    <MdLock size={48} className="text-primary" />
                  )}
                </div>
                <h4 className="card-title fw-bold">
                  {step === 1 ? 'Forgot Password' : step === 2 ? 'Verify OTP' : 'Set New Password'}
                </h4>
                <p className="text-muted small">
                  {step === 1
                    ? 'Enter your email address to receive a verification code'
                    : step === 2
                      ? `We've sent a 6-digit code to ${displayEmail}`
                      : 'Create a strong password for your account'
                  }
                </p>
              </div>

              {/* Step 1: Email Input */}
              {step === 1 && (
                <form onSubmit={handleSendOTP}>
                  <div className="mb-3">
                    <label htmlFor="email" className="form-label fw-semibold">
                      Email Address
                    </label>
                    <div className="input-group">
                      <span className="input-group-text bg-light">
                        <MdEmail className="text-muted" />
                      </span>
                      <input
                        type="email"
                        id="email"
                        className={`form-control ${emailError ? 'is-invalid' : ''}`}
                        placeholder="Enter your email"
                        value={email}
                        onChange={handleEmailChange}
                        disabled={loading}
                        autoComplete="email"
                        required
                      />
                    </div>
                    {emailError && (
                      <div className="invalid-feedback d-block">
                        {emailError}
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary w-100 py-2"
                    disabled={loading || !email.trim()}
                  >
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Sending OTP...
                      </>
                    ) : (
                      'Send OTP'
                    )}
                  </button>
                </form>
              )}

              {/* Step 2: OTP Input */}
              {step === 2 && (
                <div>
                  <div className="d-flex align-items-center mb-3">
                    <button
                      type="button"
                      className="btn btn-link p-0 me-2"
                      onClick={handleBackToEmail}
                      disabled={loading}
                    >
                      <MdArrowBack size={20} />
                    </button>
                    <span className="text-muted small">Back to email</span>
                  </div>

                  <OtpInput
                    length={6}
                    onComplete={handleOTPComplete}
                    onReset={handleOTPReset}
                    disabled={loading}
                    className="mb-3"
                  />

                  {otpError && (
                    <div className="alert alert-danger py-2 text-center">
                      {otpError}
                    </div>
                  )}

                  {loading && (
                    <div className="text-center mb-3">
                      <div className="spinner-border text-primary" role="status">
                        <span className="visually-hidden">Verifying...</span>
                      </div>
                      <p className="text-muted mt-2 mb-0">Verifying OTP...</p>
                    </div>
                  )}

                  <div className="text-center mt-4">
                    <p className="text-muted small mb-2">Didn't receive the code?</p>
                    <button
                      type="button"
                      className="btn btn-link p-0"
                      onClick={handleResendOTP}
                      disabled={resendTimer > 0 || loading}
                    >
                      {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend OTP'}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Reset Password */}
              {step === 3 && (
                <form onSubmit={handleResetPassword}>
                  {passwordErrors.general && (
                    <div className="alert alert-danger py-2">
                      {passwordErrors.general}
                    </div>
                  )}

                  {/* New Password */}
                  <div className="mb-3">
                    <label htmlFor="newPassword" className="form-label fw-semibold">
                      New Password
                    </label>
                    <div className="input-group">
                      <span className="input-group-text bg-light">
                        <MdLock className="text-muted" />
                      </span>
                      <input
                        type={showPasswords.newPassword ? "text" : "password"}
                        id="newPassword"
                        className={`form-control ${passwordErrors.newPassword ? 'is-invalid' : ''}`}
                        placeholder="Enter new password"
                        value={passwords.newPassword}
                        onChange={(e) => handlePasswordChange('newPassword', e.target.value)}
                        disabled={loading}
                        required
                      />
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={() => togglePasswordVisibility('newPassword')}
                        disabled={loading}
                      >
                        {showPasswords.newPassword ? <MdVisibilityOff /> : <MdVisibility />}
                      </button>
                    </div>
                    {passwordErrors.newPassword && (
                      <div className="invalid-feedback d-block">
                        {passwordErrors.newPassword}
                      </div>
                    )}

                    {/* Password Strength Indicator */}
                    {passwords.newPassword && (
                      <div className="mt-2">
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <small className="text-muted">Password Strength:</small>
                          <small className={`text-${getPasswordStrengthColor(passwordStrength.score)}`}>
                            {getPasswordStrengthText(passwordStrength.score)}
                          </small>
                        </div>
                        <div className="progress" style={{ height: '4px' }}>
                          <div
                            className={`progress-bar bg-${getPasswordStrengthColor(passwordStrength.score)}`}
                            style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                          ></div>
                        </div>
                        {passwordStrength.feedback.length > 0 && (
                          <div className="mt-2">
                            <small className="text-muted d-block mb-1">Requirements:</small>
                            {passwordStrength.feedback.map((item, index) => (
                              <small key={index} className="text-muted d-block">
                                • {item}
                              </small>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div className="mb-4">
                    <label htmlFor="confirmPassword" className="form-label fw-semibold">
                      Confirm Password
                    </label>
                    <div className="input-group">
                      <span className="input-group-text bg-light">
                        <MdLock className="text-muted" />
                      </span>
                      <input
                        type={showPasswords.confirmPassword ? "text" : "password"}
                        id="confirmPassword"
                        className={`form-control ${passwordErrors.confirmPassword ? 'is-invalid' : ''}`}
                        placeholder="Confirm new password"
                        value={passwords.confirmPassword}
                        onChange={(e) => handlePasswordChange('confirmPassword', e.target.value)}
                        disabled={loading}
                        required
                      />
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={() => togglePasswordVisibility('confirmPassword')}
                        disabled={loading}
                      >
                        {showPasswords.confirmPassword ? <MdVisibilityOff /> : <MdVisibility />}
                      </button>
                    </div>
                    {passwordErrors.confirmPassword && (
                      <div className="invalid-feedback d-block">
                        {passwordErrors.confirmPassword}
                      </div>
                    )}
                    {passwords.confirmPassword && passwords.newPassword === passwords.confirmPassword && (
                      <div className="text-success mt-1">
                        <small><MdCheck size={16} /> Passwords match</small>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary w-100 py-2"
                    disabled={loading || !passwords.newPassword || !passwords.confirmPassword}
                  >
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Resetting Password...
                      </>
                    ) : (
                      'Reset Password'
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Reset Flow Button (for testing/demo) */}
          <div className="text-center mt-3">
            <button
              type="button"
              className="btn btn-link btn-sm text-muted"
              onClick={handleResetForm}
            >
              Reset Flow
            </button>
          </div>
        </div>
      </div>
      <ToastNotification toasts={toasts} onClose={removeToast} />
    </div>
  );
};

export default ResetPassword;