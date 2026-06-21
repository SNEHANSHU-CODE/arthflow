import React, { useState } from "react";
import { Link, Outlet } from "react-router-dom";
export default function DashboardHome() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="container-fluid h-100 bg-light nav-top-margin">
      <div className="row">
        {/* Sidebar Toggle Button for Mobile */}
        <button
          className="btn btn-dark d-md-none"
          onClick={toggleSidebar}
        >
          {isSidebarOpen ? "Close Menu" : "Menu"}
        </button>

        {/* Sidebar */}
        <nav
          className={`col-md-2 bg-dark sidebar text-white p-3 ${
            isSidebarOpen ? "d-block" : "d-none"
          } d-md-block`}
        >
          <ul className="nav flex-column">
            <li className="nav-item">
              <Link className="nav-link text-white" to="/dashboard">Dashboard</Link>
            </li>
            <li className="nav-item">
              <Link className="nav-link text-white" to="/dashboard/transactions">Transactions</Link>
            </li>
            <li className="nav-item">
              <Link className="nav-link text-white" to="/dashboard/analytics">Analytics</Link>
            </li>
            <li className="nav-item">
              <Link className="nav-link text-white" to="/dashboard/budget">Budget</Link>
            </li>
            <li className="nav-item">
              <Link className="nav-link text-white" to="/dashboard/goals">Goals</Link>
            </li>
            <li className="nav-item">
              <Link className="nav-link text-white" to="/dashboard/reminders">Reminders</Link>
            </li>
            <li className="nav-item">
              <Link className="nav-link text-white" to="/dashboard/vault">Vault</Link>
            </li>
            <li className="nav-item">
              <Link className="nav-link text-white" to="/dashboard/settings">Settings</Link>
            </li>
            <li className="nav-item">
              <Link className="nav-link text-white" to="/dashboard/profile">Profile</Link>
            </li>
          </ul>
        </nav>

        {/* Main Content */}
        <main className="col-md-10 ms-sm-auto px-md-4 py-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
