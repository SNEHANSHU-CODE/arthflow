import React, { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================
// CLOUDINARY IMAGE URLS - update these anytime
// ============================================================
const SLIDE_IMAGES = {
  dashboard: 'https://res.cloudinary.com/dwbjric7q/image/upload/w_700,f_auto,q_auto/v1781442899/3.Dashboard_b5vffv_dyrnp3.png',
  transactions: 'https://res.cloudinary.com/dwbjric7q/image/upload/w_700,f_auto,q_auto/v1781442899/4.Transaction_Page_hpoxe7_bb3dmq.png',
  analytics: 'https://res.cloudinary.com/dwbjric7q/image/upload/w_700,f_auto,q_auto/v1781442899/5.Analytics_Page_jjhtnb_kfnyz9.png',
  goals: 'https://res.cloudinary.com/dwbjric7q/image/upload/w_700,f_auto,q_auto/v1781442900/6.Goals_Page_rvxcve_vigpyb.png',
  reminders: 'https://res.cloudinary.com/dwbjric7q/image/upload/w_700,f_auto,q_auto/v1781442900/7.Reminder_Page_f5zbdu_erymwp.png',
  vault: 'https://res.cloudinary.com/dwbjric7q/image/upload/w_700,f_auto,q_auto/v1781442899/Vault_f8xldz_ym9szg.png',
};
// ============================================================

const SLIDES = [
  {
    id: 1,
    imageKey: 'dashboard',
    label: 'Dashboard Overview',
    title: 'Your Financial Command Center',
    description: "Get a bird's-eye view of your net worth, cash flow, and spending trends — all in one place.",
    accent: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    badge: 'Overview',
  },
  {
    id: 2,
    imageKey: 'transactions',
    label: 'Transactions',
    title: 'Every Rupee, Perfectly Tracked',
    description: 'Log, search, and categorize every income and expense with powerful filters and instant search.',
    accent: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    badge: 'Transactions',
  },
  {
    id: 3,
    imageKey: 'analytics',
    label: 'Analytics',
    title: 'Insights That Drive Better Decisions',
    description: 'Visualize your spending patterns with interactive charts, category breakdowns, and trend analysis.',
    accent: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    badge: 'Analytics',
  },
  {
    id: 4,
    imageKey: 'goals',
    label: 'Goals',
    title: 'Set Goals. Track Progress. Win.',
    description: 'Define savings goals, set deadlines, and watch your progress update automatically as you transact.',
    accent: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    badge: 'Goals',
  },
  {
    id: 5,
    imageKey: 'reminders',
    label: 'Reminders',
    title: 'Never Miss a Bill or Payment',
    description: 'Smart reminders for recurring bills, EMIs, and investments synced directly to Google Calendar.',
    accent: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    badge: 'Reminders',
  },
  {
    id: 6,
    imageKey: 'vault',
    label: 'Vault',
    title: 'Your Personal Document Vault',
    description: 'Securely store and preview important financial documents — bank statements, tax files, and more — right inside your dashboard.',
    accent: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
    badge: 'Vault',
  },
];



const SlideImageStack = ({ activeIndex, animating }) => (
  <div
    style={{
      position: 'relative',
      width: '100%',
      height: '450px',
      borderRadius: '10px',
      overflow: 'hidden',
      background: '#0a0c12',
    }}
  >
    <div
      style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: '60px',
        background: 'linear-gradient(to top, rgba(8,10,16,0.7), transparent)',
        zIndex: 2,
        pointerEvents: 'none',
      }}
    />

    {SLIDES.map((slide, i) => {
      const src = SLIDE_IMAGES[slide.imageKey];
      const isActive = i === activeIndex;
      return (
        <img
          key={slide.id}
          src={src}
          alt={`${slide.label} screen`}
          style={{
            position: 'absolute',
            top: 0, left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'top left',
            display: 'block',
            opacity: isActive && !animating ? 1 : 0,
            transition: 'opacity 0.3s ease',
            pointerEvents: isActive ? 'auto' : 'none',
          }}
        />
      );
    })}
  </div>
);

const DashboardPreview = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [animating, setAnimating] = useState(false);
  const intervalRef = useRef(null);
  const INTERVAL_MS = 4500;

  const goTo = useCallback(
    (index) => {
      if (animating) return;
      setAnimating(true);
      setTimeout(() => {
        setActiveIndex((index + SLIDES.length) % SLIDES.length);
        setAnimating(false);
      }, 200);
    },
    [animating]
  );

  const next = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo]);
  const prev = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo]);

  useEffect(() => {
    if (isPaused) return;
    intervalRef.current = setInterval(next, INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [isPaused, next]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === ' ') { e.preventDefault(); setIsPaused((p) => !p); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [next, prev]);

  const touchStart = useRef(null);
  const handleTouchStart = (e) => { touchStart.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    if (touchStart.current === null) return;
    const diff = touchStart.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) diff > 0 ? next() : prev();
    touchStart.current = null;
  };

  const slide = SLIDES[activeIndex];

  return (
    <section
      className="py-5 position-relative overflow-hidden"
      style={{ background: '#080a10' }}
      aria-label="Dashboard feature preview"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          background: slide.accent,
          opacity: 0.05,
          transition: 'background 0.6s ease',
          pointerEvents: 'none',
        }}
      />

      <div className="container position-relative">

        <div className="text-center mb-5">
          <span
            style={{
              display: 'inline-block',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '20px',
              padding: '4px 16px',
              fontSize: '12px',
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.5)',
              marginBottom: '16px',
            }}
          >
            Product Preview
          </span>
          <h2
            className="fw-bold"
            style={{ color: '#fff', fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', letterSpacing: '-0.5px' }}
          >
            See What's Inside
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', maxWidth: '480px', margin: '10px auto 0', fontSize: '15px' }}>
            A full-featured finance dashboard — explore every screen below.
          </p>
        </div>

        <div className="d-flex justify-content-center flex-wrap gap-2 mb-4" role="tablist" aria-label="Dashboard screens">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={i === activeIndex}
              onClick={() => goTo(i)}
              style={{
                background: i === activeIndex ? slide.accent : 'rgba(255,255,255,0.06)',
                border: i === activeIndex ? 'none' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: '20px',
                padding: '6px 18px',
                fontSize: '13px',
                fontWeight: i === activeIndex ? 600 : 400,
                color: i === activeIndex ? '#fff' : 'rgba(255,255,255,0.45)',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '20px',
            overflow: 'hidden',
          }}
        >
          <div className="row g-0">

            <div
              className="col-lg-5 d-flex flex-column justify-content-center"
              style={{
                padding: 'clamp(28px, 5vw, 52px)',
                opacity: animating ? 0 : 1,
                transform: animating ? 'translateY(6px)' : 'translateY(0)',
                transition: 'opacity 0.2s ease, transform 0.2s ease',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  padding: '4px 12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  background: slide.accent,
                  color: '#fff',
                  marginBottom: '20px',
                  width: 'fit-content',
                }}
              >
                {slide.badge}
              </span>

              <h3
                style={{
                  color: '#fff',
                  fontSize: 'clamp(1.3rem, 2.5vw, 1.75rem)',
                  fontWeight: 700,
                  lineHeight: 1.3,
                  marginBottom: '16px',
                  letterSpacing: '-0.3px',
                }}
              >
                {slide.title}
              </h3>

              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '15px', lineHeight: 1.7, marginBottom: '32px' }}>
                {slide.description}
              </p>

              <a
                href="/signup"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: slide.accent,
                  color: '#fff',
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: '14px',
                  padding: '12px 24px',
                  borderRadius: '50px',
                  width: 'fit-content',
                  transition: 'opacity 0.2s ease, transform 0.2s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                Try it Free
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </a>
            </div>

            <div
              className="col-lg-7"
              style={{
                padding: 'clamp(16px, 3vw, 28px)',
                background: 'rgba(0,0,0,0.3)',
                borderLeft: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <SlideImageStack activeIndex={activeIndex} animating={animating} />
            </div>

          </div>
        </div>

        <div className="d-flex align-items-center justify-content-between mt-4" style={{ padding: '0 4px' }}>

          <div className="d-flex align-items-center gap-3" role="group" aria-label="Slide indicators">
            {SLIDES.map((s, i) => (
              <button
                key={s.id}
                aria-label={`Go to ${s.label}`}
                onClick={() => goTo(i)}
                style={{
                  width: i === activeIndex ? '28px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  background: i === activeIndex ? '#fff' : 'rgba(255,255,255,0.2)',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                }}
              />
            ))}
          </div>

          <div className="d-flex align-items-center gap-3">
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
              {String(activeIndex + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')}
            </span>

            <button
              aria-label="Previous slide" onClick={prev}
              style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>

            <button
              aria-label="Next slide" onClick={next}
              style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>

            <button
              aria-label={isPaused ? 'Resume autoplay' : 'Pause autoplay'}
              onClick={() => setIsPaused((p) => !p)}
              style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            >
              {isPaused ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <p className="text-center mt-3" style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px', letterSpacing: '0.3px' }}>
          Arrow keys to navigate · Space to pause · Swipe on mobile
        </p>

      </div>
    </section>
  );
};

export default DashboardPreview;