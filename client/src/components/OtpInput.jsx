import React, { useState, useRef, useEffect } from 'react';

const OtpInput = ({ 
  length = 6, 
  onComplete, 
  onReset, 
  disabled = false,
  className = "",
  autoFocus = true 
}) => {
  const [otp, setOtp] = useState(new Array(length).fill(''));
  const inputRefs = useRef([]);

  useEffect(() => {
    // Focus on first input when component mounts
    if (autoFocus && inputRefs.current[0] && !disabled) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus, disabled]);

  // Intentionally removed useEffect that resets OTP when disabled to prevent empty shells during validation

  const handleChange = (element, index) => {
    if (disabled || isNaN(element.value)) return;

    const newOtp = [...otp];
    newOtp[index] = element.value;
    setOtp(newOtp);

    // Move to next input if current field is filled
    if (element.value && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Call onComplete when all fields are filled
    if (newOtp.every(digit => digit !== '') && newOtp.join('').length === length) {
      onComplete?.(newOtp.join(''));
    }
  };

  const handleKeyDown = (e, index) => {
    if (disabled) return;

    // Handle backspace
    if (e.key === 'Backspace') {
      e.preventDefault();
      const newOtp = [...otp];
      
      if (otp[index]) {
        // Clear current field
        newOtp[index] = '';
        setOtp(newOtp);
      } else if (index > 0) {
        // Move to previous field and clear it
        newOtp[index - 1] = '';
        setOtp(newOtp);
        inputRefs.current[index - 1]?.focus();
      }
    }
    
    // Handle arrow keys
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Handle delete key
    if (e.key === 'Delete') {
      e.preventDefault();
      const newOtp = [...otp];
      newOtp[index] = '';
      setOtp(newOtp);
    }
  };

  const handlePaste = (e) => {
    if (disabled) return;
    
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text/plain');
    const pastedNumbers = pastedData.replace(/\D/g, '').slice(0, length);
    
    if (pastedNumbers) {
      const newOtp = new Array(length).fill('');
      for (let i = 0; i < pastedNumbers.length; i++) {
        newOtp[i] = pastedNumbers[i];
      }
      setOtp(newOtp);
      
      // Focus on the next empty field or last field
      const nextIndex = Math.min(pastedNumbers.length, length - 1);
      inputRefs.current[nextIndex]?.focus();
      
      // Check if complete
      if (pastedNumbers.length === length) {
        onComplete?.(pastedNumbers);
      }
    }
  };

  const handleFocus = (e, index) => {
    if (disabled) return;
    // Select all text when input is focused
    e.target.select();
  };

  const resetOtp = () => {
    if (disabled) return;
    
    const newOtp = new Array(length).fill('');
    setOtp(newOtp);
    
    // Focus first input after reset
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
    
    // Call onReset callback if provided
    onReset?.();
  };

  return (
    <div className={`d-flex flex-column align-items-center ${className}`}>
      <div className="d-flex justify-content-center gap-2 mb-3">
        {otp.map((digit, index) => (
          <input
            key={'otp-' + index}
            ref={el => inputRefs.current[index] = el}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength="1"
            value={digit}
            onChange={e => handleChange(e.target, index)}
            onKeyDown={e => handleKeyDown(e, index)}
            onPaste={handlePaste}
            onFocus={e => handleFocus(e, index)}
            disabled={disabled}
            className={`form-control text-center fw-bold ${disabled ? 'bg-light' : ''}`}
            style={{
              width: '40px',
              height: '40px',
              fontSize: '1.25rem',
              border: `2px solid ${disabled ? '#e9ecef' : '#dee2e6'}`,
              borderRadius: '8px',
              cursor: disabled ? 'not-allowed' : 'text'
            }}
            autoComplete="off"
            aria-label={`Digit ${index + 1} of ${length}`}
          />
        ))}
      </div>
      <button
        type="button"
        className="btn btn-link btn-sm text-muted"
        onClick={resetOtp}
        disabled={disabled}
        style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
      >
        Clear OTP
      </button>
    </div>
  );
};

export default OtpInput;