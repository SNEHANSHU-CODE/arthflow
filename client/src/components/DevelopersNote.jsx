import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './styles/DevelopersNote.css';
import {
  FaUser,
  FaCalendarAlt,
  FaCode,
  FaLightbulb,
  FaHeart,
  FaGithub,
  FaLinkedin,
  FaEnvelope,
  FaRocket,
  FaChartLine,
  FaMobile,
  FaCog,
  FaShieldAlt,
  FaExpandArrowsAlt,
  FaMoon,
  FaMagic,
  FaMobileAlt,
  FaChartBar,
  FaGlobe,
  FaRobot,
  FaBolt,
  FaDatabase
} from 'react-icons/fa';

const DevelopersNote = () => {

  const [isExpanded, setIsExpanded] = useState(false);

  const techStack = [
    'React.js', 'Redux Toolkit', 'Bootstrap 5', 'React Router',
    'React Icons', 'CSS3 Animations', 'Responsive Design', 'Node.js', 'Express.js', 'Redis', 'MongoDB',
    'fastAPI', 'Langchain', 'LLM API Integration'
  ];

  const features = [
    'Enterprise-grade UI/UX design',
    'Smooth animations and transitions',
    'Mobile-first responsive layout',
    'Accessibility-compliant components',
    'Modern CSS techniques',
    'Performance optimized',
    'Cross-browser compatibility',
    'SEO-friendly structure'
  ];

  const designPrinciples = [
    {
      icon: <FaUser className="text-primary" />,
      title: "User-Centered",
      description: "Every element prioritizes user experience and accessibility"
    },
    {
      icon: <FaRocket className="text-success" />,
      title: "Performance First",
      description: "Optimized animations and efficient rendering"
    },
    {
      icon: <FaMobile className="text-warning" />,
      title: "Mobile Ready",
      description: "Responsive design that works on all devices"
    },
    {
      icon: <FaCog className="text-info" />,
      title: "Scalable",
      description: "Component-based architecture for easy maintenance"
    }
  ];

  const enhancements = [
    {
      icon: <FaMoon className="text-primary" />,
      title: "Dark Mode",
      description: "Implementing a sleek dark theme with automatic system detection",
    },
    {
      icon: <FaMagic className="text-success" />,
      title: "Micro-interactions",
      description: "Advanced animations and subtle feedback for enhanced user engagement",
    },
    {
      icon: <FaMobileAlt className="text-warning" />,
      title: "PWA Features",
      description: "Progressive web app capabilities with offline functionality",
    },
    {
      icon: <FaChartBar className="text-info" />,
      title: "Advanced Analytics",
      description: "Real user monitoring with detailed performance insights",
    },
    {
      icon: <FaGlobe className="text-danger" />,
      title: "Internationalization",
      description: "Multi-language support with RTL layout compatibility",
    },
    {
      icon: <FaRobot className="text-secondary" />,
      title: "AI Integration",
      description: "Smart content suggestions and personalized user experiences",
    },
    {
      icon: <FaBolt className="text-warning" />,
      title: "Performance Boost",
      description: "Advanced caching strategies and code splitting optimization",
    },
    {
      icon: <FaDatabase className="text-success" />,
      title: "Real-time Features",
      description: "WebSocket integration for live updates and collaboration",
    }
  ];

return (
  <div className="container-fluid py-5" style={{ background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)' }}>
    <div className="container nav-top-margin">
      {/* Header Section */}
      <div className="row mb-5">
        <div className="col-12">
          <div className="card border-0 shadow-lg overflow-hidden">
            <div className="card-header border-0 text-white p-3 p-md-5"
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                position: 'relative'
              }}>
              <div className="row align-items-center">
                <div className="col-md-8">
                  <div className="d-flex align-items-center">
                    <div>
                      <h1 className="mb-2 fw-bold display-5 fs-2 fs-md-1">Developer's Note</h1>
                      <p className="mb-0 fs-5 opacity-90">A comprehensive overview from the developer</p>
                    </div>
                  </div>
                </div>
                <div className="col-md-4 text-md-end text-center mt-3 mt-md-0">
                  <div className="bg-white bg-opacity-10 rounded-3 p-3 d-inline-block">
                    <div className="d-flex align-items-center text-white">
                      <FaCalendarAlt className="me-2" />
                      <span className="fw-semibold">
                        {new Date().toLocaleString('default', { month: 'long' })} {new Date().getFullYear()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Author Info Section */}
      <div className="row mb-5">
        <div className="col-12">
          <div className="card border-0 shadow-sm">
            <div className="card-body p-4">
              <div className="row align-items-center">
                <div className="col-md-2 text-center mb-3 mb-md-0">
                  <div className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center mx-auto"
                    style={{ width: '80px', height: '80px', fontSize: '2rem', fontWeight: 'bold' }}>
                    SSJ
                  </div>
                </div>
                <div className="col-md-6">
                  <h4 className="mb-2 fw-bold text-dark">Snehanshu Sekhar Jena</h4>
                  <p className="text-muted mb-3">
                    Full-Stack Developer specializing in modern web applications with a passion for creating
                    exceptional user experiences through thoughtful design and robust architecture.
                  </p>
                  <div className="d-flex flex-wrap gap-2">
                    <span className="badge bg-primary">React Developer</span>
                    <span className="badge bg-success">Full Stack Developer</span>
                    <span className="badge bg-info">UI Developer</span>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="row g-3">
                    <div className="col-6">
                      <div className="text-center p-3 bg-light rounded-3">
                        <FaCode className="text-primary mb-2" size={24} />
                        <div className="fw-bold text-dark">2+ Years</div>
                        <small className="text-muted">of Hands-on Experience</small>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="text-center p-3 bg-light rounded-3">
                        <FaChartLine className="text-success mb-2" size={24} />
                        <div className="fw-bold text-dark">10+ Projects</div>
                        <small className="text-muted">Completed</small>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Developer's Vision */}
      <div className="row mb-5">
        <div className="col-12">
          <div className="card border-0 shadow-sm">
            <div className="card-body p-3 p-md-5">
              <div className="d-flex align-items-center mb-4">
                <FaLightbulb className="text-warning me-3" size={32} />
                <h3 className="mb-0 fw-bold text-dark">Developer's Vision</h3>
              </div>

              <div className="row">
                <div className="col-lg-8">
                  <p className="lead text-muted mb-4">
                    This landing page represents my commitment to creating exceptional user experiences
                    that combine modern design principles with practical functionality. Every animation,
                    color choice, and interaction has been carefully crafted to engage users while
                    maintaining accessibility and performance.
                  </p>

                  {!isExpanded && (
                    <button
                      className="btn btn-outline-primary btn-lg"
                      onClick={() => setIsExpanded(true)}
                    >
                      <FaExpandArrowsAlt className="me-2" />
                      Read More About Development Process
                    </button>
                  )}
                </div>
                <div className="col-lg-4">
                  <div className="bg-light rounded-3 p-4 h-100">
                    <h6 className="fw-bold mb-3 text-dark">Core Values</h6>
                    <ul className="list-unstyled">
                      <li className="mb-2">
                        <FaShieldAlt className="text-primary me-2" />
                        <span className="text-muted">Quality First</span>
                      </li>
                      <li className="mb-2">
                        <FaUser className="text-success me-2" />
                        <span className="text-muted">User-Centric</span>
                      </li>
                      <li className="mb-2">
                        <FaRocket className="text-warning me-2" />
                        <span className="text-muted">Innovation</span>
                      </li>
                      <li>
                        <FaHeart className="text-danger me-2" />
                        <span className="text-muted">Passion-Driven</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="row mb-5" style={{ animation: 'fadeIn 0.6s ease-in-out' }}>
          <div className="col-12">
            <div className="card border-0 shadow-sm">
              <div className="card-body p-3 p-md-5">
                <h4 className="fw-bold mb-4 text-dark">Development Philosophy & Process</h4>

                <div className="row mb-4">
                  <div className="col-lg-6 mb-4">
                    <h6 className="fw-bold text-primary mb-3">Philosophy</h6>
                    <p className="text-muted">
                      In today's digital landscape, users expect more than just functional interfaces—they
                      crave experiences that feel intuitive, responsive, and delightful. This project
                      embodies that philosophy by implementing enterprise-grade practices while maintaining
                      the agility and creativity that modern web development demands.
                    </p>
                  </div>
                  <div className="col-lg-6 mb-4">
                    <h6 className="fw-bold text-success mb-3">Key Achievements</h6>
                    <div className="row">
                      {features.slice(0, 4).map((feature, index) => (
                        <div key={index} className="col-12 mb-2">
                          <div className="d-flex align-items-center">
                            <div className="bg-success rounded-circle me-2"
                              style={{ width: '8px', height: '8px' }} />
                            <small className="text-muted">{feature}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Development Journey */}
                <div className="mb-4">
                  <h6 className="fw-bold mb-3 text-dark">Development Journey</h6>
                  <div className="row g-4">
                    <div className="col-md-3">
                      <div className="border-start border-primary border-3 ps-3 h-100">
                        <div className="fw-semibold text-primary mb-2">Planning</div>
                        <small className="text-muted">
                          Research, wireframing, and architecture design
                        </small>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="border-start border-success border-3 ps-3 h-100">
                        <div className="fw-semibold text-success mb-2">Design</div>
                        <small className="text-muted">
                          UI/UX design, component library, and style guide
                        </small>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="border-start border-warning border-3 ps-3 h-100">
                        <div className="fw-semibold text-warning mb-2">Development</div>
                        <small className="text-muted">
                          Component building, testing, and optimization
                        </small>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="border-start border-info border-3 ps-3 h-100">
                        <div className="fw-semibold text-info mb-2">Polish</div>
                        <small className="text-muted">
                          Performance tuning and final refinements
                        </small>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Technology Stack */}
      <div className="row mb-5">
        <div className="col-12">
          <div className="card border-0 shadow-sm">
            <div className="card-body p-3 p-md-5">
              <div className="d-flex align-items-center mb-4">
                <FaCode className="text-info me-3" size={32} />
                <h3 className="mb-0 fw-bold text-dark">Technology Stack</h3>
              </div>

              <div className="row">
                <div className="col-lg-8">
                  <div className="d-flex flex-wrap gap-3 mb-4">
                    {techStack.map((tech, index) => (
                      <span key={index}
                        className="badge bg-light text-dark border px-4 py-3 fs-6"
                        style={{ borderRadius: '25px' }}>
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="col-lg-4">
                  <div className="bg-primary bg-opacity-10 rounded-3 p-4">
                    <h6 className="fw-bold text-primary mb-3">Why These Technologies?</h6>
                    <p className="text-muted mb-0 small">
                      Each technology was carefully selected for its reliability, performance,
                      and developer experience. This stack ensures scalability and maintainability
                      while providing the best user experience.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Design Principles */}
      <div className="row mb-5">
        <div className="col-12">
          <div className="card border-0 shadow-sm">
            <div className="card-body p-3 p-md-5">
              <h3 className="fw-bold mb-4 text-dark">Design Principles Applied</h3>
              <div className="row g-4">
                {designPrinciples.map((principle, index) => (
                  <div key={index} className="col-lg-3 col-md-6">
                    <div className="card border-0 bg-light h-100">
                      <div className="card-body p-4 text-center">
                        <div className="mb-3" style={{ fontSize: '2rem' }}>
                          {principle.icon}
                        </div>
                        <h6 className="fw-bold mb-3 text-dark">{principle.title}</h6>
                        <p className="text-muted mb-0 small">{principle.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Future Enhancement Section */}
      <div className="row mb-5">
        <div className="col-12">
          <div className="card border-0 shadow-sm">
            <div className="card-body p-3 p-md-5">
              <div className="d-flex align-items-center justify-content-between mb-4">
                <h3 className="mb-0 fw-bold text-dark">Future Enhancements</h3>
                <span className="badge bg-primary fs-6 px-3 py-2">Roadmap 2026-2027</span>
              </div>

              <p className="text-muted mb-4 lead">
                Our commitment to continuous improvement drives these upcoming features and enhancements
                designed to elevate user experience and expand functionality.
              </p>

              <div className="row g-4">
                {enhancements.map((enhancement, index) => (
                  <div key={index} className="col-lg-3 col-md-6">
                    <div className="card border-0 bg-light h-100 enhancement-card">
                      <div className="card-body p-4">
                        <div className="d-flex align-items-center justify-content-between mb-3">
                          <div style={{ fontSize: '2rem' }}>
                            {enhancement.icon}
                          </div>
                        </div>

                        <h6 className="fw-bold mb-2 text-dark">{enhancement.title}</h6>
                        <p className="text-muted mb-3 small">{enhancement.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Call to Action */}
      <div className="row">
        <div className="col-12">
          <div className="card border-0 shadow-lg overflow-hidden">
            <div className="card-body p-0">
              <div className="text-center p-3 p-md-5 text-white position-relative"
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  backgroundImage: 'url("data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%23ffffff" fill-opacity="0.1"%3E%3Ccircle cx="30" cy="30" r="4"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")'
                }}>
                <FaHeart className="text-warning mb-4" size={48} />
                <h2 className="fw-bold mb-3">Built with Passion & Purpose</h2>
                <p className="lead mb-4 opacity-90">
                  This project represents hours of thoughtful development, testing, and refinement.
                  I hope it serves as an inspiration for your own creative endeavors.
                </p>

                <div className="mb-4">
                  <blockquote className="blockquote">
                    <p className="mb-0 fst-italic opacity-75">
                      "Great design is not just what it looks like – it's how it works."
                    </p>
                    <footer className="blockquote-footer text-white-50 mt-2">
                      Steve Jobs
                    </footer>
                  </blockquote>
                </div>

                {/* Social Links */}
                <div className="d-flex flex-wrap justify-content-center gap-3 mb-4">
                  <Link to="https://www.linkedin.com/in/snehanshu-sekhar-jena-5365841a1/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline-light btn-lg rounded-pill">
                    <FaLinkedin className="me-2" />
                    LinkedIn
                  </Link>
                  <a href="mailto:snehanshusekhar99@gmail.com"
                    className="btn btn-light btn-lg rounded-pill text-primary">
                    <FaEnvelope className="me-2" />
                    Get In Touch
                  </a>
                </div>

                <div className="text-center">
                  <p className="mb-0 opacity-75">
                    Thank you for taking the time to explore this project!
                    <FaRocket className="ms-2 text-warning" />
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);
};

export default DevelopersNote;