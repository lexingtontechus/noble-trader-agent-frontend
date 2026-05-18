import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Supabase db module before importing alerting
vi.mock('@/lib/supabase/db', () => ({
  db: {
    telegramNotification: {
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'test-id',
          chatId: data.chatId,
          message: data.message,
          messageType: data.messageType,
          success: data.success,
          error: data.error,
          createdAt: new Date().toISOString(),
        })
      ),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

// Mock fetch globally
global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

// Import after mocking
import { sendAlert, getDiscordChannelStatus, ALERT_TYPES, SEVERITY_LEVELS, formatAlertMessage, formatAlertTelegram, sendDiscordMessage } from '@/lib/alerting';

describe('alerting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports sendAlert function', () => {
    expect(typeof sendAlert).toBe('function');
  });

  it('exports getDiscordChannelStatus function', () => {
    expect(typeof getDiscordChannelStatus).toBe('function');
  });

  it('exports ALERT_TYPES with expected types', () => {
    expect(ALERT_TYPES).toHaveProperty('SIGNAL');
    expect(ALERT_TYPES).toHaveProperty('TRADE');
    expect(ALERT_TYPES).toHaveProperty('RISK');
    expect(ALERT_TYPES).toHaveProperty('REGIME');
    expect(ALERT_TYPES).toHaveProperty('SYSTEM');
  });

  it('exports SEVERITY_LEVELS with expected levels', () => {
    expect(SEVERITY_LEVELS).toHaveProperty('info');
    expect(SEVERITY_LEVELS).toHaveProperty('success');
    expect(SEVERITY_LEVELS).toHaveProperty('warning');
    expect(SEVERITY_LEVELS).toHaveProperty('error');
  });

  it('getDiscordChannelStatus returns an object with expected keys', () => {
    const status = getDiscordChannelStatus();
    expect(status).toBeDefined();
    expect(typeof status).toBe('object');
    expect(status).toHaveProperty('signals');
    expect(status).toHaveProperty('executions');
    expect(status).toHaveProperty('status');
  });

  it('getDiscordChannelStatus values are booleans', () => {
    const status = getDiscordChannelStatus();
    expect(typeof status.signals).toBe('boolean');
    expect(typeof status.executions).toBe('boolean');
    expect(typeof status.status).toBe('boolean');
  });

  it('formatAlertMessage returns null for null input', () => {
    expect(formatAlertMessage(null)).toBeNull();
  });

  it('formatAlertMessage parses alert record correctly', () => {
    const record = {
      id: 'abc-123',
      chatId: 'SPY',
      message: 'Test message',
      messageType: 'SIGNAL',
      success: true,
      error: '{"severity":"warning","data":{"direction":"LONG"}}',
      createdAt: '2025-01-01T00:00:00Z',
    };
    const result = formatAlertMessage(record);
    expect(result.id).toBe('abc-123');
    expect(result.type).toBe('SIGNAL');
    expect(result.symbol).toBe('SPY');
    expect(result.message).toBe('Test message');
    expect(result.severity).toBe('warning');
    expect(result.data).toEqual({ direction: 'LONG' });
  });

  it('formatAlertMessage handles system alerts', () => {
    const record = {
      id: 'sys-1',
      chatId: 'system',
      message: 'System started',
      messageType: 'SYSTEM',
      success: true,
      error: '{"severity":"info","data":{}}',
      createdAt: '2025-01-01T00:00:00Z',
    };
    const result = formatAlertMessage(record);
    expect(result.symbol).toBeNull();
    expect(result.type).toBe('SYSTEM');
  });

  it('formatAlertMessage handles invalid JSON in error field', () => {
    const record = {
      id: 'bad-json',
      chatId: 'AAPL',
      message: 'Alert',
      messageType: 'TRADE',
      success: true,
      error: 'not-valid-json',
      createdAt: '2025-01-01T00:00:00Z',
    };
    const result = formatAlertMessage(record);
    expect(result.severity).toBe('info');
    expect(result.data).toEqual({});
  });

  it('formatAlertTelegram returns a string containing the alert type', () => {
    const alert = {
      type: 'SIGNAL',
      symbol: 'SPY',
      message: 'Buy signal detected',
      severity: 'success',
      data: { direction: 'LONG' },
    };
    const result = formatAlertTelegram(alert);
    expect(typeof result).toBe('string');
    expect(result).toContain('SIGNAL');
    expect(result).toContain('SPY');
    expect(result).toContain('Buy signal detected');
  });

  it('sendDiscordMessage returns false when no webhook URL is configured', async () => {
    // Without DISCORD_WEBHOOK env vars, should return false
    const result = await sendDiscordMessage({
      type: 'SIGNAL',
      symbol: 'SPY',
      message: 'Test',
      severity: 'info',
      data: {},
    });
    expect(result).toBe(false);
  });

  it('sendAlert returns a record when called', async () => {
    const record = await sendAlert({
      type: 'SYSTEM',
      message: 'Test alert from vitest',
      severity: 'info',
    });
    expect(record).toBeDefined();
    expect(record.message).toBe('Test alert from vitest');
  });
});
