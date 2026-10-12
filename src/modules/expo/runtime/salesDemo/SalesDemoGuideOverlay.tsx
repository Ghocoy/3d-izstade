import { getSalesDemoStep, isSalesDemoEnabled, type SalesDemoStep } from './salesDemoFlags';
import type { ExpoMode } from '../../state/expoRuntime';
import { createCanonicalModularHomeStudioPath } from '../modularHome/modularHomeShareUrl';

type SalesDemoGuideOverlayProps = {
  isTouchDevice?: boolean;
  mode?: ExpoMode;
  onSetMode?: (mode: ExpoMode) => void;
};

const GUIDE_ITEMS = [
  {
    body: 'Zone ownership + hero sponsor presence',
    label: 'Landmark Sponsor',
    step: 'landmark',
  },
  {
    body: 'Sponsor booth profile, contact path and lead follow-up',
    label: 'Booth Profile',
    step: 'premium',
  },
  {
    body: 'Product profile and sponsor interest',
    label: 'Standard Booth',
    step: 'standard',
  },
  {
    body: 'Monthly demo battles and sponsor inventory',
    label: 'Demo Arena',
    step: 'arena',
  },
  {
    body: '3D walkthrough, configuration and quote preview',
    label: 'Modular Homes',
    step: 'homes',
  },
] as const satisfies ReadonlyArray<{
  body: string;
  label: string;
  step: Exclude<SalesDemoStep, 'none'>;
}>;

const STEP_LINKS = [
  {
    href: '/expo-3d?salesDemo=1',
    label: 'Overview',
    step: 'none',
  },
  {
    href: '/expo-3d?salesDemo=1&salesDemoStep=landmark',
    label: 'Landmark',
    step: 'landmark',
  },
  {
    href: '/expo-3d?salesDemo=1&salesDemoStep=premium',
    label: 'Premium',
    step: 'premium',
  },
  {
    href: '/expo-3d?salesDemo=1&salesDemoStep=standard',
    label: 'Standard',
    step: 'standard',
  },
  {
    href: '/expo-3d?salesDemo=1&salesDemoStep=arena',
    label: 'Arena',
    step: 'arena',
  },
  {
    href: '/expo-3d?salesDemo=1&salesDemoStep=homes',
    label: 'Homes',
    step: 'homes',
  },
] as const satisfies ReadonlyArray<{
  href: string;
  label: string;
  step: SalesDemoStep;
}>;

const CTA_LINKS = [
  {
    href: '/expo-3d?salesDemo=1',
    label: 'Sponsor Walkthrough',
  },
  {
    href: createCanonicalModularHomeStudioPath('exterior'),
    label: 'Apskatīt modulāro māju',
  },
  {
    href: '/expo/sponsor-packages',
    label: 'View Packages',
  },
] as const;

export function SalesDemoGuideOverlay({ isTouchDevice = false, mode = 'walk', onSetMode }: SalesDemoGuideOverlayProps) {
  if (!isSalesDemoEnabled()) {
    return null;
  }

  const activeStep = getSalesDemoStep();
  const isWalkMode = mode === 'walk';
  const isFlyMode = mode === 'fly';

  return (
    <aside
      aria-label="Sales Demo Guide"
      data-sales-demo-active-step={activeStep}
      data-sales-demo-guide-overlay="true"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      style={{
        position: 'absolute',
        left: isTouchDevice ? '12px' : '252px',
        right: isTouchDevice ? '12px' : 'auto',
        bottom: isTouchDevice ? 'max(116px, calc(env(safe-area-inset-bottom) + 112px))' : '26px',
        zIndex: 115,
        width: isTouchDevice ? 'auto' : '328px',
        maxWidth: isTouchDevice ? 'calc(100vw - 24px)' : 'calc(100vw - 560px)',
        padding: isTouchDevice ? '11px 12px' : '15px 16px',
        border: '1px solid rgba(125, 211, 252, 0.38)',
        borderRadius: isTouchDevice ? '17px' : '20px',
        background:
          'radial-gradient(circle at 12% 0%, rgba(56, 189, 248, 0.2), transparent 34%), linear-gradient(180deg, rgba(6, 12, 24, 0.91), rgba(15, 23, 42, 0.78))',
        boxShadow: '0 22px 54px rgba(2, 6, 23, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        color: '#f8fafc',
        fontFamily: 'inherit',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'start' }}>
        <div>
          <div style={{ fontSize: isTouchDevice ? '0.9rem' : '1rem', fontWeight: 950, letterSpacing: '0.015em', lineHeight: 1.05 }}>
            Web3D Expo Sales Demo
          </div>
          <div style={{ marginTop: '5px', color: '#dbeafe', fontSize: isTouchDevice ? '0.64rem' : '0.7rem', fontWeight: 800, lineHeight: 1.25 }}>
            Sponsor packages, event programming and lead-generation preview
          </div>
        </div>
        <div
          style={{
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.38)',
            borderRadius: '999px',
            color: '#86efac',
            fontSize: '0.56rem',
            fontWeight: 950,
            letterSpacing: '0.12em',
            padding: '4px 7px',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          Client view
        </div>
      </div>

      <nav
        aria-label="Sales Demo step links"
        data-sales-demo-step-link-panel="true"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '5px',
          marginTop: isTouchDevice ? '10px' : '12px',
        }}
      >
        {STEP_LINKS.map((link) => {
          const isActive = activeStep === link.step;

          return (
            <a
              key={link.href}
              aria-current={isActive ? 'page' : undefined}
              data-sales-demo-step-link={link.step}
              href={link.href}
              style={{
                background: isActive ? 'linear-gradient(135deg, rgba(34, 211, 238, 0.28), rgba(59, 130, 246, 0.18))' : 'rgba(15, 23, 42, 0.64)',
                border: isActive ? '1px solid rgba(103, 232, 249, 0.62)' : '1px solid rgba(148, 163, 184, 0.22)',
                borderRadius: '999px',
                color: isActive ? '#ecfeff' : '#cbd5e1',
                fontSize: isTouchDevice ? '0.58rem' : '0.6rem',
                fontWeight: 900,
                letterSpacing: '0.01em',
                lineHeight: 1,
                padding: isTouchDevice ? '6px 7px' : '6px 8px',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {link.label}
            </a>
          );
        })}
      </nav>

      <div style={{ display: 'grid', gap: isTouchDevice ? '6px' : '7px', marginTop: isTouchDevice ? '9px' : '11px' }}>
        {GUIDE_ITEMS.map((item, index) => {
          const isActive = activeStep === item.step;

          return (
            <div
              key={item.label}
              data-sales-demo-guide-step={item.step}
              data-sales-demo-guide-step-active={isActive ? 'true' : 'false'}
              style={{
                alignItems: 'start',
                background: isActive ? 'linear-gradient(135deg, rgba(14, 165, 233, 0.19), rgba(15, 23, 42, 0.18))' : 'transparent',
                border: isActive ? '1px solid rgba(125, 211, 252, 0.42)' : '1px solid transparent',
                borderRadius: '14px',
                display: 'grid',
                gap: '8px',
                gridTemplateColumns: '22px 1fr',
                margin: isActive ? '-3px -5px' : '0',
                padding: isActive ? '4px 5px' : '0',
              }}
            >
              <div
                style={{
                  alignItems: 'center',
                  background: isActive ? 'linear-gradient(135deg, rgba(34, 211, 238, 0.34), rgba(59, 130, 246, 0.2))' : 'rgba(14, 165, 233, 0.16)',
                  border: isActive ? '1px solid rgba(103, 232, 249, 0.5)' : '1px solid rgba(125, 211, 252, 0.24)',
                  borderRadius: '999px',
                  color: isActive ? '#ecfeff' : '#bae6fd',
                  display: 'flex',
                  fontSize: '0.62rem',
                  fontWeight: 950,
                  height: '22px',
                  justifyContent: 'center',
                  lineHeight: 1,
                  width: '22px',
                }}
              >
                {index + 1}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    alignItems: 'center',
                    color: isActive ? '#ecfeff' : '#f8fafc',
                    display: 'flex',
                    fontSize: isTouchDevice ? '0.7rem' : '0.76rem',
                    fontWeight: 900,
                    gap: '6px',
                  }}
                >
                  {item.label}
                  {isActive ? (
                    <span
                      style={{
                        border: '1px solid rgba(103, 232, 249, 0.38)',
                        borderRadius: '999px',
                        color: '#67e8f9',
                        fontSize: '0.49rem',
                        fontWeight: 950,
                        letterSpacing: '0.1em',
                        padding: '2px 5px',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Active
                    </span>
                  ) : null}
                </div>
                <div style={{ color: isActive ? '#dff8ff' : '#cbd5e1', fontSize: isTouchDevice ? '0.62rem' : '0.66rem', fontWeight: 650, lineHeight: 1.28 }}>
                  {item.body}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        data-sales-demo-movement-controls="true"
        style={{
          background: 'rgba(15, 23, 42, 0.58)',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          borderRadius: '14px',
          marginTop: isTouchDevice ? '9px' : '11px',
          padding: isTouchDevice ? '8px 9px' : '9px 10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div
            style={{
              color: '#e2e8f0',
              fontSize: isTouchDevice ? '0.6rem' : '0.64rem',
              fontWeight: 950,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Movement
          </div>
          <div style={{ display: 'flex', gap: '5px' }}>
            {(['walk', 'fly'] as const).map((nextMode) => {
              const isActive = mode === nextMode;

              return (
                <button
                  key={nextMode}
                  type="button"
                  aria-pressed={isActive}
                  data-sales-demo-movement-mode={nextMode}
                  onClick={() => onSetMode?.(nextMode)}
                  style={{
                    background: isActive ? 'linear-gradient(135deg, rgba(34, 211, 238, 0.3), rgba(59, 130, 246, 0.18))' : 'rgba(2, 6, 23, 0.46)',
                    border: isActive ? '1px solid rgba(103, 232, 249, 0.56)' : '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: '999px',
                    color: isActive ? '#ecfeff' : '#cbd5e1',
                    cursor: 'pointer',
                    fontSize: isTouchDevice ? '0.54rem' : '0.56rem',
                    fontWeight: 950,
                    letterSpacing: '0.08em',
                    lineHeight: 1,
                    padding: isTouchDevice ? '6px 7px' : '6px 8px',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {nextMode}
                </button>
              );
            })}
          </div>
        </div>
        <div
          style={{
            color: '#a8b5c7',
            fontSize: isTouchDevice ? '0.56rem' : '0.6rem',
            fontWeight: 800,
            lineHeight: 1.3,
            marginTop: '7px',
          }}
        >
          {isWalkMode
            ? 'Walk: WASD or arrow keys move. Q/E turns. Click the scene once for mouse look.'
            : isFlyMode
              ? 'Fly: drag the scene to orbit and scroll or pinch to zoom.'
              : 'Choose Walk or Fly for client demo navigation.'}
        </div>
      </div>

      <div
        data-sales-demo-cta-section="true"
        style={{
          background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.12), rgba(14, 165, 233, 0.1))',
          border: '1px solid rgba(125, 211, 252, 0.24)',
          borderRadius: '15px',
          marginTop: isTouchDevice ? '9px' : '11px',
          padding: isTouchDevice ? '8px 9px' : '9px 10px',
        }}
      >
        <div
          style={{
            color: '#f8fafc',
            fontSize: isTouchDevice ? '0.68rem' : '0.74rem',
            fontWeight: 950,
            letterSpacing: '0.01em',
          }}
        >
          Ready to sponsor a Web3D expo?
        </div>
        <div
          style={{
            color: '#c7d2fe',
            fontSize: isTouchDevice ? '0.6rem' : '0.64rem',
            fontWeight: 750,
            lineHeight: 1.25,
            marginTop: '4px',
          }}
        >
          Start with a booth profile, sponsor the Demo Arena, or own a Landmark Zone.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
          {CTA_LINKS.map((link) => (
            <a
              href={link.href}
              key={link.label}
              data-sales-demo-cta-label={link.label}
              style={{
                background: 'rgba(15, 23, 42, 0.58)',
                border: '1px solid rgba(134, 239, 172, 0.34)',
                borderRadius: '999px',
                color: '#dcfce7',
                fontSize: isTouchDevice ? '0.56rem' : '0.58rem',
                fontWeight: 950,
                letterSpacing: '0.01em',
                lineHeight: 1,
                padding: isTouchDevice ? '6px 7px' : '6px 8px',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>

      <div
        style={{
          borderTop: '1px solid rgba(148, 163, 184, 0.14)',
          color: '#a8b5c7',
          fontSize: '0.6rem',
          fontWeight: 800,
          marginTop: isTouchDevice ? '9px' : '11px',
          paddingTop: isTouchDevice ? '8px' : '9px',
        }}
      >
        {'Preview mode \u00b7 no live payments or backend persistence yet'}
      </div>
    </aside>
  );
}
