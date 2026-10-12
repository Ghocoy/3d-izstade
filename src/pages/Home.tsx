import { Link } from 'react-router-dom';
import WarpalaLogo from '../shared/Logo';

const sponsorRoutes = [
  {
    body: 'A concise sponsor package page with Standard Booth, Booth Profile, Landmark Zone Sponsor and Demo Arena inventory.',
    href: '/expo/sponsor-packages',
    label: 'Start here',
    title: 'Sponsor packages',
  },
  {
    body: 'A client-friendly Web3D walkthrough that shows the monetization story without operator/debug parameters.',
    href: '/expo-3d?salesDemo=1',
    label: 'Open demo',
    title: 'Sales demo',
  },
  {
    body: 'Construction, creative and service calculators that can turn estimate traffic into qualified lead requests.',
    href: '/calculators',
    label: 'View funnels',
    title: 'Lead calculators',
  },
];

const packageSignals = [
  ['Landmark Zone Sponsor', 'Zone ownership, hero placement and Demo Arena sponsor inventory.'],
  ['Booth Profile', 'Meeting-ready booth profile, lead capture and future qualification workflow.'],
  ['Standard Booth', 'Product profile, demo story and sponsor interest path.'],
  ['Demo Arena', 'Monthly event programming for demo battles, investor days and recaps.'],
];

const calculatorFunnels = [
  { href: '/roof-cost-calculator', metric: 'Detailed estimate', title: 'Roofing lead funnel' },
  { href: '/heating-cost-calculator', metric: 'High-intent request', title: 'Heating lead funnel' },
  { href: '/foundation-cost-calculator', metric: 'Project-start signal', title: 'Foundation lead funnel' },
];

const primaryButtonStyle = {
  background: 'linear-gradient(135deg, #0f172a, #0369a1)',
  borderRadius: '999px',
  boxShadow: '0 18px 45px rgba(14, 165, 233, 0.28)',
  color: '#fff',
  fontWeight: 950,
  padding: '15px 24px',
  textDecoration: 'none',
} as const;

const secondaryButtonStyle = {
  background: '#ecfeff',
  border: '1px solid #67e8f9',
  borderRadius: '999px',
  color: '#0e7490',
  fontWeight: 950,
  padding: '15px 24px',
  textDecoration: 'none',
} as const;

export default function Home() {
  return (
    <main
      style={{
        background:
          'radial-gradient(circle at 18% 6%, rgba(14, 165, 233, 0.16), transparent 28%), linear-gradient(180deg, #f8fafc 0%, #eef6fb 48%, #f8fafc 100%)',
        color: '#0f172a',
        minHeight: '100vh',
        padding: '52px 20px 72px',
      }}
    >
      <div style={{ margin: '0 auto', maxWidth: '1180px' }}>
        <section
          style={{
            alignItems: 'center',
            display: 'grid',
            gap: '34px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
            marginBottom: '34px',
          }}
        >
          <div>
            <WarpalaLogo size={112} />
            <div
              style={{
                color: '#0369a1',
                fontSize: '0.78rem',
                fontWeight: 950,
                letterSpacing: '0.16em',
                marginTop: '20px',
                textTransform: 'uppercase',
              }}
            >
              Web3D B2B Expo City
            </div>
            <h1
              style={{
                fontSize: 'clamp(2.7rem, 7vw, 6rem)',
                letterSpacing: '-0.065em',
                lineHeight: 0.92,
                margin: '12px 0 18px',
                maxWidth: '760px',
              }}
            >
              A sponsor-ready expo platform for Web3D demos, booths and lead generation.
            </h1>
            <p style={{ color: '#475569', fontSize: '1.12rem', lineHeight: 1.65, margin: 0, maxWidth: '720px' }}>
              The project combines a Web3D sales demo, sellable sponsor packages, lead capture paths and calculator-based
              acquisition funnels. The next commercial step is simple: send sponsors to the package page, let them review
              the sales demo, and capture their sponsorship request.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '28px' }}>
              <Link to="/expo/sponsor-packages" style={primaryButtonStyle}>
                View sponsor packages
              </Link>
              <Link to="/expo-3d?salesDemo=1" style={secondaryButtonStyle}>
                Open Web3D sales demo
              </Link>
            </div>
          </div>

          <aside
            style={{
              background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.96), rgba(3, 7, 18, 0.92))',
              border: '1px solid rgba(14, 165, 233, 0.18)',
              borderRadius: '30px',
              boxShadow: '0 30px 85px rgba(15, 23, 42, 0.2)',
              color: '#f8fafc',
              padding: '28px',
            }}
          >
            <div style={{ color: '#7dd3fc', fontSize: '0.75rem', fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              Commercial proof points
            </div>
            <div style={{ display: 'grid', gap: '14px', marginTop: '20px' }}>
              {packageSignals.map(([title, body]) => (
                <div
                  key={title}
                  style={{
                    background: 'rgba(15, 23, 42, 0.78)',
                    border: '1px solid rgba(148, 163, 184, 0.18)',
                    borderRadius: '18px',
                    padding: '15px',
                  }}
                >
                  <strong style={{ display: 'block', fontSize: '1rem' }}>{title}</strong>
                  <span style={{ color: '#cbd5e1', display: 'block', lineHeight: 1.45, marginTop: '5px' }}>{body}</span>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section
          style={{
            display: 'grid',
            gap: '18px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
            marginBottom: '32px',
          }}
        >
          {sponsorRoutes.map((route) => (
            <Link
              key={route.href}
              to={route.href}
              style={{
                background: '#ffffff',
                border: '1px solid #dbeafe',
                borderRadius: '24px',
                boxShadow: '0 18px 42px rgba(15, 23, 42, 0.06)',
                color: 'inherit',
                display: 'grid',
                gap: '12px',
                minHeight: '220px',
                padding: '24px',
                textDecoration: 'none',
              }}
            >
              <div style={{ color: '#0284c7', fontSize: '0.72rem', fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                {route.label}
              </div>
              <h2 style={{ fontSize: '1.7rem', letterSpacing: '-0.045em', lineHeight: 1.05, margin: 0 }}>{route.title}</h2>
              <p style={{ color: '#475569', lineHeight: 1.5, margin: 0 }}>{route.body}</p>
              <span style={{ color: '#0369a1', fontSize: '0.86rem', fontWeight: 950, marginTop: 'auto' }}>
                Continue
              </span>
            </Link>
          ))}
        </section>

        <section
          style={{
            background: '#0f172a',
            borderRadius: '28px',
            color: '#f8fafc',
            display: 'grid',
            gap: '22px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
            padding: '28px',
          }}
        >
          <div>
            <div style={{ color: '#93c5fd', fontSize: '0.75rem', fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              Lead funnels
            </div>
            <h2 style={{ fontSize: 'clamp(2rem, 5vw, 3.4rem)', letterSpacing: '-0.055em', lineHeight: 1, margin: '10px 0 12px' }}>
              Calculators convert practical search traffic into qualified requests.
            </h2>
            <p style={{ color: '#cbd5e1', lineHeight: 1.58, margin: 0 }}>
              Use calculators as a second acquisition layer next to sponsor outreach: each estimate can become a lead
              request for construction, creative or service partners.
            </p>
          </div>
          <div style={{ display: 'grid', gap: '12px' }}>
            {calculatorFunnels.map((entry) => (
              <Link
                key={entry.href}
                to={entry.href}
                style={{
                  alignItems: 'center',
                  background: 'rgba(15, 23, 42, 0.84)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '18px',
                  color: '#f8fafc',
                  display: 'flex',
                  gap: '14px',
                  justifyContent: 'space-between',
                  padding: '16px',
                  textDecoration: 'none',
                }}
              >
                <strong>{entry.title}</strong>
                <span style={{ color: '#bae6fd', fontSize: '0.78rem', fontWeight: 950, textTransform: 'uppercase' }}>{entry.metric}</span>
              </Link>
            ))}
            <Link
              to="/calculators"
              style={{
                color: '#7dd3fc',
                fontSize: '0.9rem',
                fontWeight: 950,
                textDecoration: 'none',
              }}
            >
              View all calculators
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
