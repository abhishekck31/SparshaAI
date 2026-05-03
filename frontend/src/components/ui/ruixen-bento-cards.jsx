import React from "react"

const C = {
  blue: '#2563eb',
  text: '#1a1a2e',
  muted: '#64748b',
  border: '#e2e8f0',
  surface: '#ffffff',
  bgAlt: '#f8fafc'
};

const cardContents = [
  {
    title: "Clinical Intelligence",
    description: "Sparsha AI provides stunning, medical-grade components built with clinical precision and high-performance monitoring in mind.",
    gridSpan: "span 3"
  },
  {
    title: "Physician Friendly",
    description: "Simple voice-first APIs and excellent real-time documentation make it easy to manage your ward and patients with lightning speed.",
    gridSpan: "span 3"
  },
  {
    title: "Dynamic Ward Telemetry",
    description: "Design dynamic, responsive patient grids using our live telemetry utilities. Whether you're building ICU monitors, general ward dashboards, or emergency triage units, Sparsha UI provides composable layout primitives that scale beautifully.",
    gridSpan: "span 4"
  },  
  {
    title: "Mobile-Ready Dashboard",
    description: "The Sparsha platform is fully responsive, ensuring clinicians have 24/7 access to critical vitals and alerts across all mobile and tablet devices.",
    gridSpan: "span 2"
  }
];

const PlusIcon = ({ style }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    width={20}
    height={20}
    strokeWidth="2"
    stroke="#94a3b8"
    style={{ position: 'absolute', ...style }}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
  </svg>
);

const CornerPlus = () => (
  <>
    <PlusIcon style={{ top: -10, left: -10 }} />
    <PlusIcon style={{ top: -10, right: -10 }} />
    <PlusIcon style={{ bottom: -10, left: -10 }} />
    <PlusIcon style={{ bottom: -10, right: -10 }} />
  </>
);

const BentoCard = ({ title, description, gridSpan }) => {
  return (
    <div className="bento-card" style={{
      gridColumn: gridSpan,
      position: 'relative',
      padding: '32px',
      backgroundColor: '#ffffff',
      border: `1px dashed #cbd5e1`,
      borderRadius: '16px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      minHeight: '200px',
      transition: 'all 0.3s ease',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
    }}>
      <CornerPlus />
      <div style={{ position: 'relative', zIndex: 2 }}>
        <h3 style={{ 
          margin: '0 0 12px', 
          fontSize: '22px', 
          fontWeight: '800', 
          color: C.text,
          fontFamily: "'Outfit', sans-serif"
        }}>
          {title}
        </h3>
        <p style={{ 
          margin: 0, 
          fontSize: '14px', 
          color: C.muted, 
          lineHeight: '1.6',
          fontWeight: '500'
        }}>
          {description}
        </p>
      </div>
    </div>
  );
};

export default function RuixenBentoCards() {
  return (
    <section style={{ 
      width: '100%', 
      padding: '80px 20px', 
      backgroundColor: '#ffffff',
      borderTop: `1px solid ${C.border}`,
      marginTop: '40px'
    }}>
      <style>{`
        @media (max-width: 768px) {
          .bento-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
          .bento-card {
            grid-column: span 1 !important;
          }
        }
      `}</style>

      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Responsive Grid - Using CSS Grid via Style */}
        <div className="bento-grid" style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(6, 1fr)', 
          gap: '24px',
          marginBottom: '60px'
        }}>
          {cardContents.map((card, idx) => (
            <BentoCard key={idx} {...card} />
          ))}
          
          {/* Full Width Bottom Card */}
          <BentoCard 
            title="Critical & Lightweight" 
            description="Built for emergency response speed, Sparsha AI ensures zero-latency vital updates without sacrificing document quality. Each component is optimized for low-power medical devices and high-speed clinical networks." 
            gridSpan="span 6"
          />
        </div>

        {/* Footer Heading */}
        <div style={{ maxWidth: '800px' }}>
          <h2 style={{ 
            fontSize: '48px', 
            fontWeight: '900', 
            color: C.text, 
            margin: '0 0 20px',
            fontFamily: "'Outfit', sans-serif",
            letterSpacing: '-0.02em'
          }}>
            Built for clinical performance. <br/>
            <span style={{ color: C.blue }}>Designed for flexibility.</span>
          </h2>
          <p style={{ 
            fontSize: '18px', 
            color: C.muted, 
            lineHeight: '1.6',
            margin: 0,
            fontWeight: '500'
          }}>
            Sparsha UI gives you the tools to build beautiful, high-performing clinical dashboards with lightning speed. 
            Each medical component is thoughtfully designed to be flexible, reusable, and accessible for critical healthcare environments.
          </p>
        </div>
      </div>
    </section>
  )
}
