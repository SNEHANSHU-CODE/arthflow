import React, { lazy, Suspense } from 'react';
import { FaArrowRight, FaChartLine, FaTachometerAlt, FaShieldAlt, FaChartBar, FaGift, FaLock, FaMobileAlt, FaSyncAlt, FaCog, FaHeadset, FaArrowUp, FaArrowDown, FaChartPie } from 'react-icons/fa';
import "./styles/LandingPage.css";

// Lazy load it so it doesn't block the initial page paint.
const DashboardPreview = lazy(() => import('../components/DashboardPreview'));

// ─── Hero Section ─────────────────────────────────────────────────────────────
const HeroSection = () => (
  <section
    className="position-relative overflow-hidden"
    style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', minHeight: '100vh' }}
  >
    {/* Animated Background Elements - Desktop */}
    <div className="position-absolute w-100 h-100 bubble-container d-none d-md-block">
      <div className="animated-bg" style={{ width: '60px', height: '60px', left: '10%', animationDelay: '0s' }}></div>
      <div className="animated-bg" style={{ width: '40px', height: '40px', left: '20%', animationDelay: '-3s' }}></div>
      <div className="animated-bg" style={{ width: '80px', height: '80px', left: '30%', animationDelay: '-6s' }}></div>
      <div className="animated-bg" style={{ width: '35px', height: '35px', left: '50%', animationDelay: '-9s' }}></div>
      <div className="animated-bg" style={{ width: '70px', height: '70px', left: '70%', animationDelay: '-12s' }}></div>
      <div className="animated-bg" style={{ width: '45px', height: '45px', left: '85%', animationDelay: '-2s' }}></div>
      <div className="animated-bg" style={{ width: '55px', height: '55px', left: '5%', animationDelay: '-8s' }}></div>
      <div className="animated-bg" style={{ width: '65px', height: '65px', left: '90%', animationDelay: '-5s' }}></div>
    </div>

    {/* Mobile Background Elements - Fewer and smaller */}
    <div className="position-absolute w-100 h-100 bubble-container d-block d-md-none">
      <div className="animated-bg" style={{ width: '30px', height: '30px', left: '15%', animationDelay: '0s' }}></div>
      <div className="animated-bg" style={{ width: '25px', height: '25px', left: '60%', animationDelay: '-5s' }}></div>
      <div className="animated-bg" style={{ width: '35px', height: '35px', left: '80%', animationDelay: '-8s' }}></div>
      <div className="animated-bg" style={{ width: '40px', height: '40px', left: '30%', animationDelay: '-3s' }}></div>
    </div>

    <div className="container position-relative" style={{ paddingTop: '8rem', paddingBottom: '8rem' }}>
      <div className="row align-items-center min-vh-100">
        <div className="col-lg-6 text-white">
          <div className="transition-all duration-1000 hero-content">
            <h1 className="display-3 fw-bold mb-4" style={{ lineHeight: '1.2' }}>
              Master Your
              <span className="d-block text-warning">Financial Future</span>
            </h1>
            <p className="lead mb-4 opacity-75">
              Experience intelligent financial management with real-time analytics, enterprise-grade security,
              and powerful insights - completely free with your data always secure.
            </p>

            <div className="d-flex flex-column flex-sm-row gap-3 mb-5">
              <a href="/signup" className="btn btn-warning btn-lg px-4 py-3 fw-semibold d-flex align-items-center justify-content-center" style={{ borderRadius: '50px' }}>
                Get Started Free
                <FaArrowRight className="ms-2" />
              </a>
            </div>

            <div className="row text-center">
              <div className="col-3">
                <div className="fw-bold fs-4">50K+</div>
                <div className="small opacity-75">Active Users</div>
              </div>
              <div className="col-3">
                <div className="fw-bold fs-4">$2.5B+</div>
                <div className="small opacity-75">Tracked Transactions</div>
              </div>
              <div className="col-3">
                <div className="fw-bold fs-4">99.9%</div>
                <div className="small opacity-75">Uptime</div>
              </div>
              <div className="col-3">
                <div className="fw-bold fs-4">100%</div>
                <div className="small opacity-75">Free to Use</div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="transition-all duration-1000 delay-300" style={{ animation: 'float 6s ease-in-out infinite' }}>
            <div className="bg-light rounded-4 shadow-lg p-4" style={{ filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.3))', transform: 'perspective(1000px) rotateY(-5deg) rotateX(5deg)' }}>
              <div className="bg-primary rounded-3 p-4 mb-3">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <p className="text-white mb-0 fw-semibold">Financial Dashboard</p>
                  <FaChartLine className="text-white" />
                </div>
                <div className="row text-white">
                  <div className="col-6">
                    <div className="small opacity-90">Total Balance</div>
                    <div className="fw-bold fs-5">$24,580.50</div>
                  </div>
                  <div className="col-6">
                    <div className="small opacity-90">This Month</div>
                    <div className="fw-bold fs-5 text-success">+12.5%</div>
                  </div>
                </div>
              </div>
              <div className="row g-2">
                <div className="col-4">
                  <div className="bg-success bg-opacity-10 rounded-2 p-3 text-center">
                    <FaArrowUp className="text-success" />
                    <div className="small mt-1">Income</div>
                  </div>
                </div>
                <div className="col-4">
                  <div className="bg-warning bg-opacity-10 rounded-2 p-3 text-center">
                    <FaArrowDown className="text-warning" />
                    <div className="small mt-1">Expenses</div>
                  </div>
                </div>
                <div className="col-4">
                  <div className="bg-info bg-opacity-10 rounded-2 p-3 text-center">
                    <FaChartPie className="text-info" />
                    <div className="small mt-1">Analytics</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

// ─── Features Section ─────────────────────────────────────────────────────────
const FeaturesSection = () => (
  <section className="py-5" style={{ marginTop: '6rem', marginBottom: '6rem' }}>
    <div className="container">
      <div className="text-center mb-5 transition-all duration-1000 features-header">
        <h2 className="display-5 fw-bold mb-4">Powerful Features for Modern Finance</h2>
        <p className="lead text-muted col-lg-8 mx-auto">
          Built with cutting-edge technology to deliver exceptional performance, security, and user experience - all completely free
        </p>
      </div>

      <div className="row g-4">
        <div className="col-lg-6">
          <div className="card h-100 border-0 shadow-lg transition-all duration-500 hover-lift" style={{ borderRadius: '1rem' }}>
            <div className="card-body p-4">
              <div className="d-inline-flex align-items-center justify-content-center mb-4 rounded-3 text-white" style={{ width: '80px', height: '80px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                <FaChartLine size={32} />
              </div>
              <h3 className="fw-bold mb-3">Smart Analytics</h3>
              <p className="text-muted mb-0">Gain deep insights into your spending patterns with AI-powered analytics and personalized financial recommendations.</p>
            </div>
          </div>
        </div>
        <div className="col-lg-6">
          <div className="card h-100 border-0 shadow-lg transition-all duration-500 hover-lift" style={{ borderRadius: '1rem' }}>
            <div className="card-body p-4">
              <div className="d-inline-flex align-items-center justify-content-center mb-4 rounded-3 text-white" style={{ width: '80px', height: '80px', background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
                <FaTachometerAlt size={32} />
              </div>
              <h3 className="fw-bold mb-3">Real-time Analytics</h3>
              <p className="text-muted mb-0">Monitor your financial health with live dashboards and instant notifications for better control over your money.</p>
            </div>
          </div>
        </div>
        <div className="col-lg-6">
          <div className="card h-100 border-0 shadow-lg transition-all duration-500 hover-lift" style={{ borderRadius: '1rem' }}>
            <div className="card-body p-4">
              <div className="d-inline-flex align-items-center justify-content-center mb-4 rounded-3 text-white" style={{ width: '80px', height: '80px', background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
                <FaShieldAlt size={32} />
              </div>
              <h3 className="fw-bold mb-3">Bank-Level Security</h3>
              <p className="text-muted mb-0">Your data is protected with enterprise-grade encryption and multi-factor authentication. Your privacy is our priority.</p>
            </div>
          </div>
        </div>
        <div className="col-lg-6">
          <div className="card h-100 border-0 shadow-lg transition-all duration-500 hover-lift" style={{ borderRadius: '1rem' }}>
            <div className="card-body p-4">
              <div className="d-inline-flex align-items-center justify-content-center mb-4 rounded-3 text-white" style={{ width: '80px', height: '80px', background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }}>
                <FaChartBar size={32} />
              </div>
              <h3 className="fw-bold mb-3">Advanced Reporting</h3>
              <p className="text-muted mb-0">Generate comprehensive financial reports with customizable charts and detailed insights to track your progress.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

// ─── Benefits Section ─────────────────────────────────────────────────────────
const BenefitsSection = () => (
  <section className="py-5 position-relative" style={{ background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)' }}>
    <div className="container">
      <div className="text-center mb-5">
        <h2 className="display-5 fw-bold mb-4">Why Choose Finance Tracker?</h2>
        <p className="lead text-muted col-lg-8 mx-auto">
          Discover the benefits that make Finance Tracker the perfect choice for managing your finances
        </p>
      </div>

      <div className="row g-4">
        <div className="col-lg-4">
          <div className="text-center p-4">
            <div className="d-inline-flex align-items-center justify-content-center mb-4 rounded-circle text-white" style={{ width: '80px', height: '80px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              <FaGift size={32} />
            </div>
            <h3 className="fw-bold mb-3">100% Free Forever</h3>
            <p className="text-muted">No hidden fees, no premium plans, no limits. Access all features completely free with no strings attached.</p>
          </div>
        </div>
        <div className="col-lg-4">
          <div className="text-center p-4">
            <div className="d-inline-flex align-items-center justify-content-center mb-4 rounded-circle text-white" style={{ width: '80px', height: '80px', background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
              <FaLock size={32} />
            </div>
            <h3 className="fw-bold mb-3">Data Privacy First</h3>
            <p className="text-muted">Your financial data stays secure and private. We never sell or share your information with third parties.</p>
          </div>
        </div>
        <div className="col-lg-4">
          <div className="text-center p-4">
            <div className="d-inline-flex align-items-center justify-content-center mb-4 rounded-circle text-white" style={{ width: '80px', height: '80px', background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
              <FaMobileAlt size={32} />
            </div>
            <h3 className="fw-bold mb-3">Multi-Platform Access</h3>
            <p className="text-muted">Access your financial data anywhere, anytime with our responsive web app and mobile-friendly design.</p>
          </div>
        </div>
      </div>

      <div className="row g-4 mt-4">
        <div className="col-lg-4">
          <div className="text-center p-4">
            <div className="d-inline-flex align-items-center justify-content-center mb-4 rounded-circle text-white" style={{ width: '80px', height: '80px', background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }}>
              <FaSyncAlt size={32} />
            </div>
            <h3 className="fw-bold mb-3">Real-time Updates</h3>
            <p className="text-muted">Get instant updates on your financial status with real-time synchronization across all your accounts.</p>
          </div>
        </div>
        <div className="col-lg-4">
          <div className="text-center p-4">
            <div className="d-inline-flex align-items-center justify-content-center mb-4 rounded-circle text-white" style={{ width: '80px', height: '80px', background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' }}>
              <FaCog size={32} />
            </div>
            <h3 className="fw-bold mb-3">Easy Setup</h3>
            <p className="text-muted">Get started in minutes with our intuitive setup process. No complex configurations required.</p>
          </div>
        </div>
        <div className="col-lg-4">
          <div className="text-center p-4">
            <div className="d-inline-flex align-items-center justify-content-center mb-4 rounded-circle text-white" style={{ width: '80px', height: '80px', background: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)' }}>
              <FaHeadset size={32} />
            </div>
            <h3 className="fw-bold mb-3">24/7 Support</h3>
            <p className="text-muted">Our dedicated support team is always here to help you make the most of your financial management.</p>
          </div>
        </div>
      </div>
    </div>
  </section>
);

// ─── CTA Section ──────────────────────────────────────────────────────────────
const CTASection = () => (
  <section className="py-5 position-relative" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
    <div className="container text-center text-white">
      <div className="row justify-content-center">
        <div className="col-lg-8">
          <h2 className="display-5 fw-bold mb-4">Ready to Transform Your Financial Future?</h2>
          <p className="lead mb-5 opacity-75">
            Join thousands of users who trust Finance Tracker to manage their finances securely and intelligently.
            Start your journey today - completely free!
          </p>
          <div className="d-flex flex-column flex-sm-row gap-3 justify-content-center">
            <a href="/signup" className="btn btn-warning btn-lg px-5 py-3 fw-semibold" style={{ borderRadius: '50px' }}>
              Start Free Today
              <FaArrowRight className="ms-2" />
            </a>
          </div>
        </div>
      </div>
    </div>
  </section>
);

// ─── Fallback shown while DashboardPreview lazy-loads ─────────────────────────
const SliderFallback = () => (
  <div
    style={{
      background: '#080a10',
      minHeight: '400px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <div className="spinner-border text-light opacity-25" role="status">
      <span className="visually-hidden">Loading...</span>
    </div>
  </div>
);

const LandingPage = () => (
  <div className="overflow-hidden">
    <HeroSection />
    <FeaturesSection />
    <Suspense fallback={<SliderFallback />}>
      <DashboardPreview />
    </Suspense>
    <BenefitsSection />
    <CTASection />
  </div>
);

export default LandingPage;