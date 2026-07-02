import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { FaEye, FaEyeSlash, FaUserPlus } from 'react-icons/fa';
import { MdEmail, MdLock, MdPerson } from 'react-icons/md';
import { FcGoogle } from 'react-icons/fc';
import { clearError, clearFormError, clearOAuthError } from '../app/authSlice';
import { authService } from '../services/authService';
import GoogleLoginButton from '../components/GoogleLoginButton';
import OtpInput from '../components/OtpInput';

export default function Signup() {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const { loading, oauthError } = useSelector((state) => state.auth);

    // State for form steps
    const [currentStep, setCurrentStep] = useState(1); // 1 = Signup Form, 2 = OTP Verification
    const [otpSent, setOtpSent] = useState(false);
    const [otpLoading, setOtpLoading] = useState(false);
    const [otpError, setOtpError] = useState('');
    const [otpSuccess, setOtpSuccess] = useState('');
    const [resendTimer, setResendTimer] = useState(0);
    const [registrationToken, setRegistrationToken] = useState('');

    const [signup, setSignup] = useState({
        username: "",
        email: "",
        password: "",
        cpassword: ""
    });
    const [showPassword, setShowPassword] = useState(false);
    const [showCPassword, setShowCPassword] = useState(false);
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState('');

    // Countdown timer for resend OTP
    useEffect(() => {
        let interval;
        if (resendTimer > 0) {
            interval = setInterval(() => {
                setResendTimer((prev) => prev - 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [resendTimer]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setSignup((prev) => ({ ...prev, [name]: value }));
        // Clear field-specific error when user starts typing
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
        // Clear form error
        if (formError) {
            setFormError('');
            dispatch(clearFormError());
        }
    };

    const togglePasswordVisibility = () => {
        setShowPassword(prev => !prev);
    };

    const toggleCPasswordVisibility = () => {
        setShowCPassword(prev => !prev);
    };

    const validateField = (name, value) => {
        const nameRegex = /^[A-Za-z\s]{3,}$/;
        const emailRegex = /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/;
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
        let errorMsg = '';

        if (name === 'username') {
            if (!value.trim()) errorMsg = 'Username is required.';
            else if (!nameRegex.test(value)) errorMsg = 'Username should be at least 3 characters and contain only letters.';
        } else if (name === 'email') {
            if (!value.trim()) errorMsg = 'Email is required.';
            else if (!emailRegex.test(value)) errorMsg = 'Invalid email format.';
        } else if (name === 'password') {
            if (!value) errorMsg = 'Password is required.';
            else if (!passwordRegex.test(value)) errorMsg = 'Password must be 8+ chars, with uppercase, lowercase, digit & special char.';
        } else if (name === 'cpassword') {
            if (!value) errorMsg = 'Please confirm your password.';
            else if (signup.password !== value) errorMsg = 'Passwords do not match.';
        }

        setErrors(prev => ({ ...prev, [name]: errorMsg }));
    };

    const handleBlur = (e) => {
        const { name, value } = e.target;
        validateField(name, value);
    };

    const validate = () => {
        const newErrors = {};
        const nameRegex = /^[A-Za-z\s]{3,}$/;
        const emailRegex = /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/;
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

        if (!signup.username.trim()) {
            newErrors.username = 'Username is required.';
        } else if (!nameRegex.test(signup.username)) {
            newErrors.username = 'Username should be at least 3 characters and contain only letters.';
        }

        if (!signup.email.trim()) {
            newErrors.email = 'Email is required.';
        } else if (!emailRegex.test(signup.email)) {
            newErrors.email = 'Invalid email format.';
        }

        if (!signup.password) {
            newErrors.password = 'Password is required.';
        } else if (!passwordRegex.test(signup.password)) {
            newErrors.password = 'Password must be 8+ chars, with uppercase, lowercase, digit & special char.';
        }

        if (!signup.cpassword) {
            newErrors.cpassword = 'Please confirm your password.';
        } else if (signup.password !== signup.cpassword) {
            newErrors.cpassword = 'Passwords do not match.';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSendOTP = async (e) => {
        e.preventDefault();
        if (validate()) {
            setOtpLoading(true);
            setFormError('');
            setOtpError('');

            try {
                const response = await authService.sendRegistrationOTP({
                    username: signup.username,
                    email: signup.email,
                    password: signup.password
                });

                setOtpSent(true);
                setCurrentStep(2);
                setOtpSuccess('OTP sent successfully to your email!');
                setResendTimer(60); // 60 seconds cooldown
            } catch (error) {
                setFormError(error.message || 'Failed to send OTP. Please try again.');
            } finally {
                setOtpLoading(false);
            }
        }
    };

    const handleVerifyOTP = async (otp) => {
        setOtpLoading(true);
        setOtpError('');
        setOtpSuccess('');

        try {
            const response = await authService.verifyRegistrationOTP({
                email: signup.email,
                otp: otp
            });

            setOtpSuccess('OTP verified successfully!');
            
            // Store registration token if provided in response
            if (response.registrationToken) {
                setRegistrationToken(response.registrationToken);
            }

            // Complete registration
            await completeRegistration(response.registrationToken);
        } catch (error) {
            setOtpError(error.message || 'Invalid OTP. Please try again.');
        } finally {
            setOtpLoading(false);
        }
    };

    const completeRegistration = async (token) => {
        try {
            const response = await authService.register({ registrationToken: token });
            
            // Registration successful, navigate to dashboard
            setTimeout(() => {
                navigate('/dashboard');
            }, 500);
        } catch (error) {
            setOtpError(error.message || 'Registration failed. Please try again.');
        }
    };

    const handleResendOTP = async () => {
        if (resendTimer > 0) return;

        setOtpLoading(true);
        setOtpError('');
        setOtpSuccess('');

        try {
            await authService.sendRegistrationOTP({
                username: signup.username,
                email: signup.email,
                password: signup.password
            });

            setOtpSuccess('OTP resent successfully!');
            setResendTimer(60);
        } catch (error) {
            setOtpError(error.message || 'Failed to resend OTP. Please try again.');
        } finally {
            setOtpLoading(false);
        }
    };

    const handleOtpReset = () => {
        setOtpError('');
    };

    const handleBackToForm = () => {
        setCurrentStep(1);
        setOtpSent(false);
        setOtpError('');
        setOtpSuccess('');
    };

    return (
        <div className="container-fluid py-4 d-flex align-items-center justify-content-center bg-light">
            <div className="row w-100 justify-content-center nav-top-margin">
                <div className="col-12 col-sm-8 col-md-6 col-lg-4 col-xl-3">
                    <div className="card shadow-lg border-0">
                        <div className="card-body p-4">
                            {/* Header */}
                            <div className="text-center mb-4">
                                <div className="mb-3">
                                    <FaUserPlus size={48} className="text-success" />
                                </div>
                                <h4 className="card-title fw-bold">
                                    {currentStep === 1 ? 'Create Account' : 'Verify Your Email'}
                                </h4>
                                <p className="text-muted small">
                                    {currentStep === 1 
                                        ? 'Sign up to get started' 
                                        : `We sent a code to ${signup.email}`}
                                </p>
                            </div>

                            {/* Step 1: Signup Form */}
                            {currentStep === 1 && (
                                <>
                                    {/* Form Error */}
                                    {formError && (
                                        <div className="alert alert-danger py-2 mb-3" role="alert">
                                            <strong>Error:</strong> {formError}
                                        </div>
                                    )}

                                    <form onSubmit={handleSendOTP} autoComplete="off">
                                        {/* Username Input */}
                                        <div className="mb-3">
                                            <label htmlFor='username' className="form-label fw-semibold">
                                                Username
                                            </label>
                                            <div className="input-group">
                                                <span className="input-group-text bg-light">
                                                    <MdPerson className="text-muted" />
                                                </span>
                                                <input
                                                    type='text'
                                                    name='username'
                                                    id='username'
                                                    autoComplete='off'
                                                    className={`form-control ${errors.username ? 'is-invalid' : ''}`}
                                                    placeholder="Enter your username"
                                                    value={signup.username}
                                                    onChange={handleChange}
                                                    onBlur={handleBlur}
                                                    disabled={otpLoading}
                                                />
                                            </div>
                                            {errors.username && (
                                                <div className="invalid-feedback d-block">
                                                    {errors.username}
                                                </div>
                                            )}
                                        </div>

                                        {/* Email Input */}
                                        <div className="mb-3">
                                            <label htmlFor='email' className="form-label fw-semibold">
                                                Email Address
                                            </label>
                                            <div className="input-group">
                                                <span className="input-group-text bg-light">
                                                    <MdEmail className="text-muted" />
                                                </span>
                                                <input
                                                    type='email'
                                                    name='email'
                                                    id='email'
                                                    autoComplete='username'
                                                    className={`form-control ${errors.email ? 'is-invalid' : ''}`}
                                                    placeholder="Enter your email"
                                                    value={signup.email}
                                                    onChange={handleChange}
                                                    onBlur={handleBlur}
                                                    disabled={otpLoading}
                                                />
                                            </div>
                                            {errors.email && (
                                                <div className="invalid-feedback d-block">
                                                    {errors.email}
                                                </div>
                                            )}
                                        </div>

                                        {/* Password Input */}
                                        <div className="mb-3">
                                            <label htmlFor='password' className="form-label fw-semibold">
                                                Password
                                            </label>
                                            <div className="input-group">
                                                <span className="input-group-text bg-light">
                                                    <MdLock className="text-muted" />
                                                </span>
                                                <input
                                                    type={showPassword ? "text" : "password"}
                                                    name='password'
                                                    id='password'
                                                    autoComplete='new-password'
                                                    className={`form-control ${errors.password ? 'is-invalid' : ''}`}
                                                    placeholder="Enter your password"
                                                    value={signup.password}
                                                    onChange={handleChange}
                                                    onBlur={handleBlur}
                                                    disabled={otpLoading}
                                                />
                                                <button
                                                    type="button"
                                                    className="btn btn-outline-secondary"
                                                    onClick={togglePasswordVisibility}
                                                    disabled={otpLoading}
                                                >
                                                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                                                </button>
                                            </div>
                                            {errors.password && (
                                                <div className="invalid-feedback d-block">
                                                    {errors.password}
                                                </div>
                                            )}
                                        </div>

                                        {/* Confirm Password Input */}
                                        <div className="mb-3">
                                            <label htmlFor='cpassword' className="form-label fw-semibold">
                                                Confirm Password
                                            </label>
                                            <div className="input-group">
                                                <span className="input-group-text bg-light">
                                                    <MdLock className="text-muted" />
                                                </span>
                                                <input
                                                    type={showCPassword ? "text" : "password"}
                                                    name='cpassword'
                                                    id='cpassword'
                                                    autoComplete='new-password'
                                                    className={`form-control ${errors.cpassword ? 'is-invalid' : ''}`}
                                                    placeholder="Confirm your password"
                                                    value={signup.cpassword}
                                                    onChange={handleChange}
                                                    onBlur={handleBlur}
                                                    disabled={otpLoading}
                                                />
                                                <button
                                                    type="button"
                                                    className="btn btn-outline-secondary"
                                                    onClick={toggleCPasswordVisibility}
                                                    disabled={otpLoading}
                                                >
                                                    {showCPassword ? <FaEyeSlash /> : <FaEye />}
                                                </button>
                                            </div>
                                            {errors.cpassword && (
                                                <div className="invalid-feedback d-block">
                                                    {errors.cpassword}
                                                </div>
                                            )}
                                        </div>

                                        {/* Submit Button */}
                                        <button
                                            className="btn btn-success w-100 py-2 mb-3"
                                            type='submit'
                                            disabled={otpLoading}
                                        >
                                            {otpLoading ? (
                                                <>
                                                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                                    Sending OTP...
                                                </>
                                            ) : (
                                                'Continue'
                                            )}
                                        </button>
                                    </form>

                                    {/* Divider */}
                                    <div className="d-flex align-items-center my-3">
                                        <hr className="flex-grow-1" />
                                        <span className="mx-2 text-muted small">or</span>
                                        <hr className="flex-grow-1" />
                                    </div>

                                    {/* Google OAuth */}
                                    <div className="mb-3">
                                        <GoogleLoginButton className="btn-outline-secondary w-100" />
                                    </div>

                                    {/* OAuth Errors */}
                                    {oauthError && (
                                        <div className="alert alert-warning py-2 mb-3" role="alert">
                                            <strong>OAuth Error:</strong> {oauthError}
                                        </div>
                                    )}

                                    {/* Login Link */}
                                    <div className="text-center mt-3">
                                        <p className='text-muted small mb-0'>
                                            Already have an account?{' '}
                                            <Link to="/login" className="text-decoration-none fw-semibold">
                                                Login
                                            </Link>
                                        </p>
                                    </div>
                                </>
                            )}

                            {/* Step 2: OTP Verification */}
                            {currentStep === 2 && (
                                <>
                                    {/* OTP Success Message */}
                                    {otpSuccess && (
                                        <div className="alert alert-success py-2 mb-3" role="alert">
                                            {otpSuccess}
                                        </div>
                                    )}

                                    {/* OTP Error Message */}
                                    {otpError && (
                                        <div className="alert alert-danger py-2 mb-3" role="alert">
                                            <strong>Error:</strong> {otpError}
                                        </div>
                                    )}

                                    {/* OTP Input Component */}
                                    <div className="mb-4">
                                        <OtpInput
                                            length={6}
                                            onComplete={handleVerifyOTP}
                                            onReset={handleOtpReset}
                                            disabled={otpLoading}
                                            autoFocus={true}
                                        />
                                    </div>

                                    {/* Resend OTP */}
                                    <div className="text-center mb-3">
                                        {resendTimer > 0 ? (
                                            <p className="text-muted small mb-0">
                                                Resend OTP in {resendTimer}s
                                            </p>
                                        ) : (
                                            <button
                                                className="btn btn-link p-0 text-decoration-none"
                                                onClick={handleResendOTP}
                                                disabled={otpLoading}
                                            >
                                                Resend OTP
                                            </button>
                                        )}
                                    </div>

                                    {/* Back to Form */}
                                    <button
                                        className="btn btn-outline-secondary w-100"
                                        onClick={handleBackToForm}
                                        disabled={otpLoading}
                                    >
                                        Back to Form
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}