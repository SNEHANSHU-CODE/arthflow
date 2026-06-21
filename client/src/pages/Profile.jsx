import React, { useState, useEffect } from 'react';
import { FaEdit, FaSave, FaTimes, FaUser, FaEnvelope, FaTrash, FaKey, FaEye, FaEyeSlash } from 'react-icons/fa';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { updateUserPassword, updateUserProfile, deleteUserAccount } from '../app/authSlice';

const ProfilePage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  
  // Get user details from auth state of Redux store
  const { user, loading } = useSelector((state) => state.auth);
  
  // Profile editing state
  const [isEditing, setIsEditing] = useState(false);
  const [profileData, setProfileData] = useState({
    username: user?.username || 'User Name',
    email: user?.email || 'useremail@example.com'
  });
  const [editData, setEditData] = useState({ ...profileData });
  const [errors, setErrors] = useState({});

  // Password change state
  const [showCurrPassword, setShowCurrPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState({});
  const [newPassword, setNewPassword] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  // Delete account modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({
    password: "",
    confirmDeletion: ""
  });
  const [deleteErrors, setDeleteErrors] = useState({});

  // Profile editing handlers
  const handleEdit = () => {
    setIsEditing(true);
    setEditData({ ...profileData });
    setErrors({});
  };

  const validate = () => {
    const newErrors = {};
    const nameRegex = /^[A-Za-z\s]{3,}$/;
    const emailRegex = /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/;

    if (!editData.username.trim()) {
      newErrors.username = 'Username is required';
    } else if (!nameRegex.test(editData.username)) {
      newErrors.username = 'Username must contain at least 3 letters';
    }

    if (!editData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!emailRegex.test(editData.email)) {
      newErrors.email = 'Please enter a valid email format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (validate()) {
      try {
        const userData = {
          username: editData.username,
          email: editData.email
        };
        const result = await dispatch(updateUserProfile(userData)).unwrap();
        setProfileData({
          username: result.user.username,
          email: result.user.email
        });
        setIsEditing(false);
        setErrors({});
      } catch (error) {
        console.error('User details update fail:', error);
        // Handle error display here if needed
      }
    }
  };

  const handleCancel = () => {
    setEditData({ ...profileData });
    setIsEditing(false);
    setErrors({});
  };

  const handleInputChange = (field, value) => {
    setEditData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear errors when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Password visibility toggles
  const toggleCurrPasswordVisibility = () => {
    setShowCurrPassword(prev => !prev);
  };

  const toggleNewPasswordVisibility = () => {
    setShowNewPassword(prev => !prev);
  };

  const toggleConfirmPasswordVisibility = () => {
    setShowConfirmPassword(prev => !prev);
  };

  // Password change handlers
  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setNewPassword(prev => ({ ...prev, [name]: value }));
    // Clear field-specific error when user starts typing
    if (passwordErrors[name]) {
      setPasswordErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validatePassword = () => {
    const newErrors = {};
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

    if (!newPassword.currentPassword.trim()) {
      newErrors.currentPassword = 'Current password is required';
    }

    if (!newPassword.newPassword.trim()) {
      newErrors.newPassword = 'New password is required';
    } else if (!passwordRegex.test(newPassword.newPassword)) {
      newErrors.newPassword = 'Password must be at least 8 characters with uppercase, lowercase, number and special character';
    }

    if (!newPassword.confirmPassword.trim()) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (newPassword.newPassword !== newPassword.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setPasswordErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    if (validatePassword()) {
      try {
        const userData = {
          currentPassword: newPassword.currentPassword,
          newPassword: newPassword.newPassword,
          confirmPassword: newPassword.confirmPassword
        };
        await dispatch(updateUserPassword(userData)).unwrap();
        // Reset form
        setNewPassword({
          currentPassword: "",
          newPassword: "",
          confirmPassword: ""
        });
        setPasswordErrors({});
        // Navigate to home page after successful password change
        navigate('/');
      } catch (error) {
        console.error('Password update failed:', error);
        // Set error message for display
        setPasswordErrors({ submit: 'Password update failed' });
      }
    }
  };

  // Delete account handlers
  const handleDeleteConfirmChange = (e) => {
    const { name, value } = e.target;
    setDeleteConfirm(prev => ({ ...prev, [name]: value }));
    // Clear errors when user starts typing
    if (deleteErrors[name]) {
      setDeleteErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateDeleteConfirm = () => {
    const newErrors = {};
    
    if (user?.lastLoginProvider !== 'google' && !deleteConfirm.password.trim()) {
      newErrors.password = 'Password is required to confirm deletion';
    }
    
    if (deleteConfirm.confirmDeletion !== 'DELETE') {
      newErrors.confirmDeletion = 'Type DELETE to confirm';
    }

    setDeleteErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleDeleteAccount = async () => {
    if (validateDeleteConfirm()) {
      try {
        await dispatch(deleteUserAccount(deleteConfirm)).unwrap();
        navigate('/');
      } catch (error) {
        console.error('Account deletion failed:', error);
        setDeleteErrors({ submit: 'Account deletion failed' });
      }
    }
  };

  const openDeleteModal = () => {
    setShowDeleteModal(true);
    setDeleteConfirm({ password: "", confirmDeletion: "" });
    setDeleteErrors({});
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setDeleteConfirm({ password: "", confirmDeletion: "" });
    setDeleteErrors({});
  };

  // Handle Escape key for modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showDeleteModal) {
        closeDeleteModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDeleteModal]);

  return (
    <div className="container-fluid py-4" style={{ backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-12 col-xl-10">
            {/* Header */}
            <div className="d-flex align-items-center mb-4">
              <FaUser className="me-3 text-primary" size={28} />
              <h2 className="mb-0 fw-bold text-dark">My Profile</h2>
            </div>

            {/* Profile Info Card */}
            <div className="card shadow-sm border-0 mb-4">
              <div className="card-body p-4">
                <div className="d-flex justify-content-between align-items-start mb-4">
                  <h5 className="card-title mb-0 fw-bold">Personal Information</h5>
                  {!isEditing ? (
                    <button
                      className="btn btn-outline-primary btn-sm d-flex align-items-center"
                      onClick={handleEdit}
                    >
                      <FaEdit className="me-2" />
                      Edit
                    </button>
                  ) : (
                    <div className="d-flex gap-2">
                      <button
                        className="btn btn-success btn-sm d-flex align-items-center"
                        onClick={handleSave}
                      >
                        <FaSave className="me-2" />
                        Save
                      </button>
                      <button
                        className="btn btn-outline-secondary btn-sm d-flex align-items-center"
                        onClick={handleCancel}
                      >
                        <FaTimes className="me-2" />
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                <div className="row align-items-center">
                  <div className="col-12 col-md-8 col-lg-9">
                    <div className="row g-3">
                      {/* Name Field */}
                      <div className="col-12">
                        <label className="form-label fw-semibold text-muted mb-1">
                          <FaUser className="me-2" />
                          Full Name
                        </label>
                        {!isEditing ? (
                          <p className="form-control-plaintext fw-bold text-dark mb-0">
                            {profileData.username}
                          </p>
                        ) : (
                          <>
                            <input
                              type="text"
                              className={`form-control ${errors.username ? 'is-invalid' : ''}`}
                              value={editData.username}
                              onChange={(e) => handleInputChange('username', e.target.value)}
                            />
                            {errors.username && (
                              <div className="invalid-feedback">
                                {errors.username}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Email Field */}
                      <div className="col-12 col-lg-6">
                        <label className="form-label fw-semibold text-muted mb-1">
                          <FaEnvelope className="me-2" />
                          Email Address
                        </label>
                        {!isEditing ? (
                          <p className="form-control-plaintext text-dark mb-0">
                            {profileData.email}
                          </p>
                        ) : (
                          <>
                            <input
                              type="email"
                              className={`form-control ${errors.email ? 'is-invalid' : ''}`}
                              value={editData.email}
                              onChange={(e) => handleInputChange('email', e.target.value)}
                            />
                            {errors.email && (
                              <div className="invalid-feedback">
                                {errors.email}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Change Password Section */}
            {user?.lastLoginProvider !== 'google' && (
              <div className="card border-0 shadow-sm mt-4">
              <div className="card-header bg-transparent border-0 pt-3">
                <h5 className="mb-0 d-flex align-items-center gap-2 text-primary">
                  <FaKey size={16} />
                  Change Password
                </h5>
              </div>
              <div className="card-body pt-2">
                {/* Display submit error */}
                {passwordErrors.submit && (
                  <div className="alert alert-danger" role="alert">
                    {passwordErrors.submit}
                  </div>
                )}
                
                <form className="row g-3" onSubmit={handlePasswordUpdate}>
                  <div className="col-md-6 position-relative">
                    <label htmlFor="currentPassword" className="form-label">
                      Current Password
                    </label>
                    <input
                      type={showCurrPassword ? "text" : "password"}
                      className={`form-control ${passwordErrors.currentPassword ? 'is-invalid' : ''}`}
                      id="currentPassword"
                      name="currentPassword"
                      placeholder="Enter current password"
                      value={newPassword.currentPassword}
                      onChange={handlePasswordChange}
                    />
                    <span
                      onClick={toggleCurrPasswordVisibility}
                      style={{
                        position: 'absolute',
                        right: '15px',
                        top: '35px',
                        cursor: 'pointer',
                        zIndex: 5
                      }}
                    >
                      {showCurrPassword ? <FaEyeSlash /> : <FaEye />}
                    </span>
                    {passwordErrors.currentPassword && (
                      <div className="invalid-feedback">
                        {passwordErrors.currentPassword}
                      </div>
                    )}
                  </div>
                  
                  <div className="col-md-6 position-relative">
                    <label htmlFor="newPassword" className="form-label">
                      New Password
                    </label>
                    <input
                      type={showNewPassword ? "text" : "password"}
                      className={`form-control ${passwordErrors.newPassword ? 'is-invalid' : ''}`}
                      id="newPassword"
                      name="newPassword"
                      placeholder="Enter new password"
                      value={newPassword.newPassword}
                      onChange={handlePasswordChange}
                    />
                    <span
                      onClick={toggleNewPasswordVisibility}
                      style={{
                        position: 'absolute',
                        right: '15px',
                        top: '35px',
                        cursor: 'pointer',
                        zIndex: 5
                      }}
                    >
                      {showNewPassword ? <FaEyeSlash /> : <FaEye />}
                    </span>
                    {passwordErrors.newPassword && (
                      <div className="invalid-feedback">
                        {passwordErrors.newPassword}
                      </div>
                    )}
                  </div>
                  
                  <div className="col-md-6 position-relative">
                    <label htmlFor="confirmPassword" className="form-label">
                      Confirm New Password
                    </label>
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      className={`form-control ${passwordErrors.confirmPassword ? 'is-invalid' : ''}`}
                      id="confirmPassword"
                      name="confirmPassword"
                      placeholder="Confirm new password"
                      value={newPassword.confirmPassword}
                      onChange={handlePasswordChange}
                    />
                    <span
                      onClick={toggleConfirmPasswordVisibility}
                      style={{
                        position: 'absolute',
                        right: '15px',
                        top: '35px',
                        cursor: 'pointer',
                        zIndex: 5
                      }}
                    >
                      {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                    </span>
                    {passwordErrors.confirmPassword && (
                      <div className="invalid-feedback">
                        {passwordErrors.confirmPassword}
                      </div>
                    )}
                  </div>
                  
                  <div className="col-12">
                    <button 
                      type="submit" 
                      className="btn btn-primary btn-sm"
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                          Updating
                        </>
                      ) : (
                        'Update Password'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
            )}

            {/* Account Management Section */}
            <div className="card border-0 shadow-sm mt-4">
              <div className="card-header bg-transparent border-0 pt-3">
                <h5 className="mb-0 d-flex align-items-center gap-2 text-danger">
                  <FaTrash size={16} />
                  Danger Zone
                </h5>
              </div>
              <div className="card-body pt-2">
                <div className="alert alert-danger d-flex align-items-start gap-3">
                  <FaTrash className="mt-1" size={16} />
                  <div className="flex-grow-1">
                    <h6 className="alert-heading">Delete Account</h6>
                    <p className="mb-2">
                      Permanently delete your account and all associated data. This action cannot be undone.
                    </p>
                    <button className="btn btn-danger btn-sm" onClick={openDeleteModal}>
                      Delete My Account
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="modal fade show" tabIndex="-1" role="dialog" aria-modal="true" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header border-0">
                <h5 className="modal-title text-danger">
                  <FaTrash className="me-2" />
                  Delete Account
                </h5>
                <button type="button" className="btn-close" onClick={closeDeleteModal}></button>
              </div>
              <div className="modal-body">
                <div className="alert alert-danger">
                  <strong>Warning:</strong> This action is irreversible. All your data including transactions, goals, and settings will be permanently deleted.
                </div>
                
                {deleteErrors.submit && (
                  <div className="alert alert-danger" role="alert">
                    {deleteErrors.submit}
                  </div>
                )}

                <form>
                  {user?.lastLoginProvider !== 'google' && (
                  <div className="mb-3">
                    <label htmlFor="deletePassword" className="form-label">
                      Enter password to confirm
                    </label>
                    <input
                      type="password"
                      className={`form-control ${deleteErrors.password ? 'is-invalid' : ''}`}
                      id="deletePassword"
                      name="password"
                      placeholder="Enter your password"
                      value={deleteConfirm.password}
                      onChange={handleDeleteConfirmChange}
                    />
                    {deleteErrors.password && (
                      <div className="invalid-feedback">
                        {deleteErrors.password}
                      </div>
                    )}
                  </div>
                  )}
                  
                  <div className="mb-3">
                    <label htmlFor="confirmDeletion" className="form-label">
                      Type DELETE to confirm
                    </label>
                    <input
                      type="text"
                      className={`form-control ${deleteErrors.confirmDeletion ? 'is-invalid' : ''}`}
                      id="confirmDeletion"
                      name="confirmDeletion"
                      placeholder="Type DELETE"
                      value={deleteConfirm.confirmDeletion}
                      onChange={handleDeleteConfirmChange}
                    />
                    {deleteErrors.confirmDeletion && (
                      <div className="invalid-feedback">
                        {deleteErrors.confirmDeletion}
                      </div>
                    )}
                  </div>
                </form>
              </div>
              <div className="modal-footer border-0">
                <button type="button" className="btn btn-secondary" onClick={closeDeleteModal}>
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn btn-danger"
                  onClick={handleDeleteAccount}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Deleting
                    </>
                  ) : (
                    'Delete Account'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;