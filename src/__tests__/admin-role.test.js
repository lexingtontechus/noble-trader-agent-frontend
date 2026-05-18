import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Clerk server-side auth
const mockAuth = vi.fn();
const mockClerkClient = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
  clerkClient: () => mockClerkClient(),
}));

import { GET } from '@/app/api/auth/role/route';

describe('/api/auth/role', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns admin role for admin users', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockClerkClient.mockResolvedValue({
      users: {
        getUser: vi.fn().mockResolvedValue({
          privateMetadata: { role: 'admin' },
        }),
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(data.role).toBe('admin');
    expect(data.isAdmin).toBe(true);
  });

  it('returns authenticated role for non-admin users', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_456' });
    mockClerkClient.mockResolvedValue({
      users: {
        getUser: vi.fn().mockResolvedValue({
          privateMetadata: {},
        }),
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(data.role).toBe('authenticated');
    expect(data.isAdmin).toBe(false);
  });

  it('returns unauthenticated when no user is signed in', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    mockClerkClient.mockResolvedValue({
      users: {
        getUser: vi.fn(),
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(data.role).toBe('unauthenticated');
    expect(data.isAdmin).toBe(false);
  });

  it('gracefully handles Clerk error (returns unauthenticated)', async () => {
    mockAuth.mockRejectedValue(new Error('Clerk unavailable'));

    const response = await GET();
    const data = await response.json();

    // getUserRole() catches the error internally and returns "unauthenticated"
    expect(data.isAdmin).toBe(false);
    expect(data.role).toBe('unauthenticated');
  });
});
