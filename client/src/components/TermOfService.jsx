import React from 'react';
import { FaGavel, FaUserCheck, FaExclamationTriangle, FaShieldAlt, FaCalendarAlt, FaEnvelope, FaCheckCircle } from 'react-icons/fa';

const TermsOfService = () => {
  return (
    <div className="container-fluid bg-light min-vh-100 nav-top-margin">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-lg-10">
            {/* Header */}
            <div className="text-center mb-5">
              <FaGavel className="text-primary mb-3" size={60} />
              <h1 className="display-4 fw-bold text-dark mb-3">Terms of Service</h1>
              <p className="lead text-muted">
                Please read these terms carefully before using our ArthFlow application.
              </p>
              <div className="bg-primary text-white px-3 py-2 rounded-pill d-inline-block">
                <small><strong>Effective Date:</strong> {new Date().toLocaleDateString()}</small>
              </div>
            </div>

            {/* Main Content */}
            <div className="bg-white rounded-4 shadow-sm p-4 p-md-5">
              
              {/* Agreement */}
              <section className="mb-5">
                <div className="d-flex align-items-center mb-3">
                  <FaUserCheck className="text-success me-3" size={24} />
                  <h2 className="h3 mb-0 text-dark">Agreement to Terms</h2>
                </div>
                <div className="bg-success bg-opacity-10 border border-success border-opacity-25 rounded-3 p-4">
                  <p className="text-muted mb-0">
                    By accessing and using ArthFlow, you accept and agree to be bound by the terms and provision of this agreement. 
                    If you do not agree to abide by the above, please do not use this service.
                  </p>
                </div>
              </section>

              {/* Service Description */}
              <section className="mb-5">
                <div className="d-flex align-items-center mb-3">
                  <FaCalendarAlt className="text-primary me-3" size={24} />
                  <h2 className="h3 mb-0 text-dark">Service Description</h2>
                </div>
                <p className="text-muted lh-lg mb-4">
                  ArthFlow is a web-based application that helps you manage your personal finances by integrating with Google Calendar. 
                  Our service allows you to track expenses, manage budgets, and analyze your financial patterns.
                </p>
                
                <div className="row g-4">
                  <div className="col-md-4">
                    <div className="text-center p-3 bg-light rounded-3">
                      <FaCalendarAlt className="text-primary mb-2" size={32} />
                      <h5 className="h6 text-dark">Calendar Sync</h5>
                      <small className="text-muted">Integrate financial events with Google Calendar</small>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="text-center p-3 bg-light rounded-3">
                      <FaCheckCircle className="text-success mb-2" size={32} />
                      <h5 className="h6 text-dark">Expense Tracking</h5>
                      <small className="text-muted">Monitor and categorize your expenses</small>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="text-center p-3 bg-light rounded-3">
                      <FaShieldAlt className="text-info mb-2" size={32} />
                      <h5 className="h6 text-dark">Secure Platform</h5>
                      <small className="text-muted">Your financial data is protected</small>
                    </div>
                  </div>
                </div>
              </section>

              {/* User Responsibilities */}
              <section className="mb-5">
                <div className="d-flex align-items-center mb-3">
                  <FaUserCheck className="text-warning me-3" size={24} />
                  <h2 className="h3 mb-0 text-dark">User Responsibilities</h2>
                </div>
                
                <div className="accordion" id="userResponsibilities">
                  <div className="accordion-item border-0 bg-light rounded-3 mb-3">
                    <h2 className="accordion-header">
                      <button className="accordion-button bg-transparent text-dark fw-semibold" type="button" data-bs-toggle="collapse" data-bs-target="#account-security">
                        Account Security
                      </button>
                    </h2>
                    <div id="account-security" className="accordion-collapse collapse show" data-bs-parent="#userResponsibilities">
                      <div className="accordion-body">
                        <ul className="text-muted mb-0">
                          <li>Maintain the confidentiality of your account credentials</li>
                          <li>Notify us immediately of any unauthorized access</li>
                          <li>Use strong passwords and enable two-factor authentication when available</li>
                          <li>Log out from shared or public computers</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                  
                  <div className="accordion-item border-0 bg-light rounded-3 mb-3">
                    <h2 className="accordion-header">
                      <button className="accordion-button collapsed bg-transparent text-dark fw-semibold" type="button" data-bs-toggle="collapse" data-bs-target="#data-accuracy">
                        Data Accuracy
                      </button>
                    </h2>
                    <div id="data-accuracy" className="accordion-collapse collapse" data-bs-parent="#userResponsibilities">
                      <div className="accordion-body">
                        <ul className="text-muted mb-0">
                          <li>Provide accurate and truthful information</li>
                          <li>Keep your financial data up-to-date</li>
                          <li>Verify all transactions and entries</li>
                          <li>Report any discrepancies or errors promptly</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                  
                  <div className="accordion-item border-0 bg-light rounded-3">
                    <h2 className="accordion-header">
                      <button className="accordion-button collapsed bg-transparent text-dark fw-semibold" type="button" data-bs-toggle="collapse" data-bs-target="#acceptable-use">
                        Acceptable Use
                      </button>
                    </h2>
                    <div id="acceptable-use" className="accordion-collapse collapse" data-bs-parent="#userResponsibilities">
                      <div className="accordion-body">
                        <ul className="text-muted mb-0">
                          <li>Use the service only for lawful purposes</li>
                          <li>Do not attempt to hack, reverse engineer, or compromise the system</li>
                          <li>Respect other users' privacy and data</li>
                          <li>Do not upload malicious content or spam</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Google Calendar Integration */}
              <section className="mb-5">
                <div className="d-flex align-items-center mb-3">
                  <FaCalendarAlt className="text-info me-3" size={24} />
                  <h2 className="h3 mb-0 text-dark">Google Calendar Integration</h2>
                </div>
                <div className="border border-info border-opacity-25 rounded-3 p-4 bg-info bg-opacity-5">
                  <h4 className="h5 text-info mb-3">Third-Party Service Agreement</h4>
                  <ul className="text-muted mb-3">
                    <li>Google Calendar integration is subject to Google's Terms of Service and Privacy Policy</li>
                    <li>You must have a valid Google account to use calendar features</li>
                    <li>We are not responsible for Google service interruptions or changes</li>
                    <li>You can revoke calendar access permissions at any time</li>
                  </ul>
                  <div className="alert alert-info border-0 mb-0">
                    <small className="mb-0">
                      <strong>Important:</strong> By connecting your Google Calendar, you authorize us to access only the calendar data necessary for our financial tracking features.
                    </small>
                  </div>
                </div>
              </section>

              {/* Limitations and Disclaimers */}
              <section className="mb-5">
                <div className="d-flex align-items-center mb-3">
                  <FaExclamationTriangle className="text-warning me-3" size={24} />
                  <h2 className="h3 mb-0 text-dark">Limitations and Disclaimers</h2>
                </div>
                
                <div className="row g-4">
                  <div className="col-md-6">
                    <div className="bg-warning bg-opacity-10 border border-warning border-opacity-25 rounded-3 p-4 h-100">
                      <h5 className="h6 text-warning mb-3">Service Availability</h5>
                      <ul className="text-muted small mb-0">
                        <li>We strive for 99.9% uptime but cannot guarantee uninterrupted service</li>
                        <li>Maintenance windows may temporarily affect availability</li>
                        <li>We are not liable for service interruptions</li>
                      </ul>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="bg-danger bg-opacity-10 border border-danger border-opacity-25 rounded-3 p-4 h-100">
                      <h5 className="h6 text-danger mb-3">Financial Advice Disclaimer</h5>
                      <ul className="text-muted small mb-0">
                        <li>Our service is for tracking purposes only</li>
                        <li>We do not provide financial advice or recommendations</li>
                        <li>Consult qualified professionals for financial planning</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>

              {/* Data and Privacy */}
              <section className="mb-5">
                <div className="d-flex align-items-center mb-3">
                  <FaShieldAlt className="text-success me-3" size={24} />
                  <h2 className="h3 mb-0 text-dark">Data and Privacy</h2>
                </div>
                <div className="bg-light rounded-3 p-4">
                  <div className="row g-3 align-items-center">
                    <div className="col-md-8">
                      <h5 className="h6 text-dark mb-2">Your data privacy is our priority</h5>
                      <p className="text-muted mb-0 small">
                        We collect and process your data in accordance with our Privacy Policy. 
                        You retain ownership of your financial data and can request deletion at any time.
                      </p>
                    </div>
                    <div className="col-md-4 text-md-end">
                      <a href="/privacy" className="btn btn-outline-primary btn-sm">
                        <FaShieldAlt className="me-1" size={14} />
                        View Privacy Policy
                      </a>
                    </div>
                  </div>
                </div>
              </section>

              {/* Termination */}
              <section className="mb-5">
                <div className="d-flex align-items-center mb-3">
                  <FaExclamationTriangle className="text-danger me-3" size={24} />
                  <h2 className="h3 mb-0 text-dark">Account Termination</h2>
                </div>
                <div className="row g-4">
                  <div className="col-md-6">
                    <div className="border-start border-danger border-4 ps-3">
                      <h5 className="h6 text-dark">By You</h5>
                      <p className="text-muted small mb-0">
                        You may terminate your account at any time by contacting us or using the account deletion feature. 
                        Upon termination, your data will be deleted according to our data retention policy.
                      </p>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="border-start border-warning border-4 ps-3">
                      <h5 className="h6 text-dark">By Us</h5>
                      <p className="text-muted small mb-0">
                        We may suspend or terminate accounts that violate these terms, engage in fraudulent activity, 
                        or pose security risks. We will provide notice when possible.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Changes to Terms */}
              <section className="mb-5">
                <div className="d-flex align-items-center mb-3">
                  <FaGavel className="text-info me-3" size={24} />
                  <h2 className="h3 mb-0 text-dark">Changes to Terms</h2>
                </div>
                <div className="alert alert-info border-0">
                  <p className="mb-2">
                    <strong>We may update these Terms of Service from time to time.</strong>
                  </p>
                  <ul className="mb-2">
                    <li>Significant changes will be communicated via email or app notification</li>
                    <li>Continued use of the service constitutes acceptance of updated terms</li>
                    <li>You can review the current terms at any time on this page</li>
                  </ul>
                  <small className="text-muted">
                    Last updated: {new Date().toLocaleDateString()}
                  </small>
                </div>
              </section>

              {/* Contact Information */}
              <section className="mb-0">
                <div className="d-flex align-items-center mb-3">
                  <FaEnvelope className="text-primary me-3" size={24} />
                  <h2 className="h3 mb-0 text-dark">Contact Information</h2>
                </div>
                <div className="bg-primary bg-opacity-10 rounded-3 p-4">
                  <p className="text-muted mb-3">
                    If you have questions about these Terms of Service, please contact us:
                  </p>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <div className="d-flex align-items-center">
                        <FaEnvelope className="text-primary me-2" size={16} />
                        <div>
                          <small className="text-muted d-block">Email</small>
                          <span className="fw-semibold">arthflow0@gmail.com</span>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="d-flex align-items-center">
                        <FaCheckCircle className="text-success me-2" size={16} />
                        <div>
                          <small className="text-muted d-block">Response Time</small>
                          <span className="fw-semibold">Within 48 hours</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

            </div>

            {/* Footer Note */}
            <div className="text-center mt-4">
              <small className="text-muted">
                By using ArthFlow, you acknowledge that you have read, understood, and agree to these Terms of Service.
              </small>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;