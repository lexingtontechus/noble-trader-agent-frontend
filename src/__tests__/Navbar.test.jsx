import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import Navbar from '@/components/Navbar';

// Mock Clerk — factory must be self-contained (hoisted before variable declarations)
vi.mock('@clerk/nextjs', () => {
  const MockBtn = ({ children }) => <div data-testid="user-button">{children}</div>;
  MockBtn.MenuItems = ({ children }) => <div>{children}</div>;
  MockBtn.Link = ({ label }) => <div>{label}</div>;
  return { UserButton: MockBtn };
});

// Mock dynamic imports
vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => {
    const DynamicComponent = () => null;
    DynamicComponent.displayName = 'DynamicComponent';
    DynamicComponent.preload = vi.fn();
    return DynamicComponent;
  },
}));

// Mock ThemeSwitcher
vi.mock('@/components/shared/ThemeSwitcher', () => ({
  __esModule: true,
  default: () => <div data-testid="theme-switcher">ThemeSwitcher</div>,
}));

// Mock fetch for health check
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ status: 'ok' }),
});

function renderNavbar(props) {
  return act(() => {
    const result = render(<Navbar {...props} />);
    return result;
  });
}

describe('Navbar', () => {
  const defaultProps = { activeView: 'dashboard', setActiveView: vi.fn() };

  it('renders the app title', async () => {
    await renderNavbar(defaultProps);
    expect(screen.getByText('Noble Trader')).toBeDefined();
  });

  it('renders all main nav items in desktop tabs', async () => {
    await renderNavbar(defaultProps);
    // Nav items appear in both desktop tabs and mobile nav, so use getAllByText
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Orders').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Trade').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Renko').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Admin').length).toBeGreaterThanOrEqual(1);
  });

  it('renders Simulate, Portfolio, and Search tabs', async () => {
    await renderNavbar(defaultProps);
    expect(screen.getAllByText('Simulate').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Portfolio').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Search').length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT render Docs link (removed from navbar)', async () => {
    await renderNavbar(defaultProps);
    const docsLinks = screen.queryAllByText('Docs');
    // Docs link was removed — should not appear in any navigation
    expect(docsLinks.length).toBe(0);
  });

  it('renders the UserButton', async () => {
    await renderNavbar(defaultProps);
    expect(screen.getByTestId('user-button')).toBeDefined();
  });

  it('renders the ThemeSwitcher', async () => {
    await renderNavbar(defaultProps);
    expect(screen.getByTestId('theme-switcher')).toBeDefined();
  });

  it('renders the REGIME RISK subtitle', async () => {
    await renderNavbar(defaultProps);
    expect(screen.getByText('REGIME RISK')).toBeDefined();
  });
});
