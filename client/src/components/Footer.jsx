import React from "react";
import {
  FaFacebookF,
  FaLinkedinIn,
  FaXTwitter,
  FaEnvelope,
} from "react-icons/fa6";

import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="bg-black text-light pt-5 pb-3 mt-auto border-top border-secondary">
      <div className="container">
        <div className="row gy-4">
          {/* Brand Section */}
          <div className="col-md-3">
            <div className="d-flex align-items-center mb-3">
              <img
                src="/favicon.png"
                alt=""
                className="navbar-brand-img me-2"
                style={{
                  width: '32px',
                  height: '32px',
                  objectFit: 'contain',
                  objectPosition: 'center'
                }}
              />
              <p className="text-success mb-0 fw-bold fs-4">ArthFlow</p>
            </div>
            <div className="d-flex align-items-center">
              <p className="text-light small">
                Empower your financial life with powerful insights, expense tracking, and goal setting—all in one place.
              </p>
            </div>
          </div>

          {/* Quick Links */}
          <div className="col-md-3">
            <p className="text-uppercase fw-semibold mb-3">Quick Links</p>
            <ul className="list-unstyled">
              <li><Link to="/dashboard" className="text-light text-decoration-none">Dashboard</Link></li>
              <li><Link to="/dashboard/analytics" className="text-light text-decoration-none">Analytics</Link></li>
              <li><Link to="/dashboard/transactions" className="text-light text-decoration-none">Transactions</Link></li>
              <li><Link to="/dashboard/goals" className="text-light text-decoration-none">Goals</Link></li>
              <li><Link to="/dashboard/settings" className="text-light text-decoration-none">Settings</Link></li>
            </ul>
          </div>

          {/* Support Links */}
          <div className="col-md-3">
            <p className="text-uppercase fw-semibold mb-3">Support</p>
            <ul className="list-unstyled">
              <li><Link to="/service" className="text-light text-decoration-none">Term of Service</Link></li>
              <li><Link to="/privacy" className="text-light text-decoration-none">Privacy Policy</Link></li>
              <li><Link to="/developersnote" className="text-light text-decoration-none">Developer's Note</Link></li>
            </ul>
          </div>

          {/* Contact & Social */}
          <div className="col-md-3">
            <p className="text-uppercase fw-semibold mb-3">Connect with Us</p>
            <div className="d-flex gap-3 fs-5">
            <Link to="#" className="text-light" aria-label="Facebook"><FaFacebookF /></Link>
            <Link to="#" className="text-light" aria-label="LinkedIn"><FaLinkedinIn /></Link>
            <Link to="#" className="text-light" aria-label="X (Twitter)"><FaXTwitter /></Link>
            <Link to="mailto:arthflow0@gmail.com" className="text-light" aria-label="Send us an email"><FaEnvelope /></Link>
          </div>
          </div>
        </div>

        <hr className="my-4 border-secondary" />

        <div className="text-center small text-light">
          &copy; {new Date().getFullYear()} ArthFlow. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
