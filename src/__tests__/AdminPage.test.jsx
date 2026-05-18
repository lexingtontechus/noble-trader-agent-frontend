import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import AdminPage from '@/components/admin/AdminPage';

// Mock Clerk
vi.mock('@clerk/nextjs', () => ({
  useUser: () => mockUseUser(),
  UserProfile: () => <div data-testid="user-profile">UserProfile</div>,
}));

// Mock ClerkAuthPanel
vi.mock('@/components/auth/ClerkAuthPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="clerk-auth-panel">ClerkAuthPanel</div>,
}));

// Mock fetch for role check
global.fetch = vi.fn();

let mockUseUser = vi.fn();

function renderAdminPage() {
  return act(() => {
    return render(<AdminPage />);
  });
}

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUser.mockReturnValue({
      isSignedIn: true,
      isLoaded: true,
      user: { id: 'user_123' },
    });
  });

  it('shows access denied for non-admin users', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ role: 'authenticated', isAdmin: false }),
    });

    await renderAdminPage();
    expect(screen.getByText('Access Denied')).toBeDefined();
    expect(screen.getByText(/Current role:/)).toBeDefined();
  });

  it('shows admin content for admin users', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ role: 'admin', isAdmin: true }),
    });

    await renderAdminPage();
    expect(screen.getByTestId('clerk-auth-panel')).toBeDefined();
    expect(screen.getByTestId('user-profile')).toBeDefined();
    expect(screen.getByText('Admin')).toBeDefined();
  });

  it('shows loading state while checking role', async () => {
    global.fetch.mockImplementation(() => new Promise(() => {})); // never resolves

    await renderAdminPage();
    // Loading spinner has the "loading-spinner" class
    const spinner = document.querySelector('.loading-spinner');
    expect(spinner).toBeDefined();
  });

  it('shows sign-in prompt for unauthenticated users', async () => {
    mockUseUser.mockReturnValue({
      isSignedIn: false,
      isLoaded: true,
      user: null,
    });

    await renderAdminPage();
    expect(screen.getByText('Sign in to access this page.')).toBeDefined();
  });
});
