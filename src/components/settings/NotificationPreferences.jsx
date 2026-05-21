"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { notifySuccess, notifyError, notifyInfo, invalidatePreferenceCache } from "@/lib/notifications";

// ── Default preferences (mirrors server defaults) ────────────────────────────

const DEFAULT_CHANNELS = {
  in_app: true,
  discord: false,
  email: false,
};

const DEFAULT_ALERT_TYPES = {
  trade_filled: true,
  trade_rejected: true,
  order_submitted: true,
  risk_breach: true,
  kill_switch: true,
  mode_change: true,
  pnl_threshold: true,
  regime_change: false,
  strategy_signal: false,
  campaign_complete: true,
  reconciliation: true,
};

const DEFAULT_QUIET_HOURS = {
  enabled: false,
  start: "22:00",
  end: "07:00",
  timezone: "America/New_York",
};

const DEFAULT_DIGEST_SETTINGS = {
  enabled: false,
  frequency: "daily",
  time: "18:00",
};

// ── Alert type metadata ──────────────────────────────────────────────────────

const ALERT_TYPE_META = {
  trade_filled: { icon: "💰", label: "Trade Filled", description: "Notification when a trade order is filled" },
  trade_rejected: { icon: "🚫", label: "Trade Rejected", description: "Notification when a trade is rejected by the broker" },
  order_submitted: { icon: "📤", label: "Order Submitted", description: "Notification when a new order is submitted" },
  risk_breach: { icon: "⚠️", label: "Risk Limit Breach", description: "Alert when a risk limit is breached (daily loss, etc.)" },
  kill_switch: { icon: "🛑", label: "Kill Switch Activated", description: "Critical alert when the kill switch is triggered" },
  mode_change: { icon: "🔄", label: "Mode Change", description: "Notification when trading mode changes (paper/live)" },
  pnl_threshold: { icon: "📊", label: "P&L Threshold Alert", description: "Alert when P&L hits a configured threshold" },
  regime_change: { icon: "🌊", label: "Regime Change", description: "Alert when market regime is detected as changed" },
  strategy_signal: { icon: "📈", label: "Strategy Signal", description: "Notification on new strategy-generated signals" },
  campaign_complete: { icon: "✅", label: "Campaign Complete", description: "Notification when a trading campaign finishes" },
  reconciliation: { icon: "🔍", label: "Reconciliation Result", description: "Notification on position reconciliation results" },
};

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

// ── Skeleton loader ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-base-300 rounded w-48" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card bg-base-200 shadow">
            <div className="card-body p-4">
              <div className="h-5 bg-base-300 rounded w-24 mb-2" />
              <div className="h-4 bg-base-300 rounded w-full" />
            </div>
          </div>
        ))}
      </div>
      <div className="h-6 bg-base-300 rounded w-32" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-16 bg-base-200 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function NotificationPreferences() {
  const [channels, setChannels] = useState(DEFAULT_CHANNELS);
  const [alertTypes, setAlertTypes] = useState(DEFAULT_ALERT_TYPES);
  const [quietHours, setQuietHours] = useState(DEFAULT_QUIET_HOURS);
  const [digestSettings, setDigestSettings] = useState(DEFAULT_DIGEST_SETTINGS);
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState({});
  const [testResults, setTestResults] = useState({});
  const [hasChanges, setHasChanges] = useState(false);
  const [discordConnected, setDiscordConnected] = useState(null);
  const initialLoadDone = useRef(false);

  // Fetch preferences
  const fetchPreferences = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications/preferences");
      if (res.ok) {
        const data = await res.json();
        if (data.preferences) {
          setChannels(data.preferences.channels || DEFAULT_CHANNELS);
          setAlertTypes(data.preferences.alert_types || DEFAULT_ALERT_TYPES);
          setQuietHours(data.preferences.quiet_hours || DEFAULT_QUIET_HOURS);
          setDigestSettings(data.preferences.digest_settings || DEFAULT_DIGEST_SETTINGS);
          setDiscordWebhookUrl(data.preferences.discord_webhook_url || "");
          setIsDefault(data.isDefault);
        }
      }
    } catch (err) {
      console.error("[NotificationPreferences] Fetch failed:", err.message);
    } finally {
      setLoading(false);
      // Mark initial load done on next tick so state updates settle first
      setTimeout(() => { initialLoadDone.current = true; }, 0);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  // Track changes (skip initial load to avoid false-positive "unsaved changes")
  useEffect(() => {
    if (initialLoadDone.current) {
      setHasChanges(true);
    }
  }, [channels, alertTypes, quietHours, digestSettings, discordWebhookUrl]);

  // ── Save handler ──────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channels,
          alert_types: alertTypes,
          quiet_hours: quietHours,
          digest_settings: digestSettings,
          discord_webhook_url: discordWebhookUrl || null,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        notifySuccess("Notification preferences saved!");
        setHasChanges(false);
        setIsDefault(false);
        invalidatePreferenceCache();
      } else {
        notifyError(data.error || "Failed to save preferences");
      }
    } catch (err) {
      notifyError(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Reset handler ─────────────────────────────────────────────────────
  const handleReset = () => {
    setChannels(DEFAULT_CHANNELS);
    setAlertTypes(DEFAULT_ALERT_TYPES);
    setQuietHours(DEFAULT_QUIET_HOURS);
    setDigestSettings(DEFAULT_DIGEST_SETTINGS);
    setDiscordWebhookUrl("");
    setHasChanges(true);
    setDiscordConnected(null);
    setTestResults({});
    notifyInfo("Preferences reset to defaults. Save to apply.");
  };

  // ── Test notification handler ─────────────────────────────────────────
  const handleTest = async (channel) => {
    setTesting((prev) => ({ ...prev, [channel]: true }));
    setTestResults((prev) => ({ ...prev, [channel]: null }));

    try {
      const payload = { channel };
      // Pass custom webhook URL for Discord tests
      if (channel === "discord" && discordWebhookUrl.trim()) {
        payload.webhook_url = discordWebhookUrl.trim();
      }

      const res = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      setTestResults((prev) => ({
        ...prev,
        [channel]: data,
      }));

      if (data.success) {
        notifySuccess(`Test notification sent via ${channel === "in_app" ? "In-App" : channel === "discord" ? "Discord" : "Email"}`);
      } else {
        notifyError(data.error || `Test failed for ${channel}`);
      }
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [channel]: { success: false, error: err.message },
      }));
      notifyError(`Test failed: ${err.message}`);
    } finally {
      setTesting((prev) => ({ ...prev, [channel]: false }));
    }
  };

  // ── Test Discord webhook connection ───────────────────────────────────
  const handleTestDiscordConnection = async () => {
    if (!discordWebhookUrl.trim()) {
      notifyError("Enter a Discord webhook URL first");
      return;
    }

    setDiscordConnected("testing");
    try {
      const res = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "discord", webhook_url: discordWebhookUrl.trim() }),
      });
      const data = await res.json();
      setDiscordConnected(data.success ? "connected" : "failed");
    } catch {
      setDiscordConnected("failed");
    }
  };

  // ── Toggle helper ─────────────────────────────────────────────────────
  const toggleChannel = (key) => {
    if (key === "in_app") return; // Always enabled
    setChannels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAlertType = (key) => {
    setAlertTypes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ── Loading skeleton ──────────────────────────────────────────────────
  if (loading) {
    return <Skeleton />;
  }

  return (
    <div className="space-y-6">
      {/* ── Section Header ────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <span role="img" aria-hidden="true">🔔</span>
          Notification Preferences
        </h2>
        <p className="text-sm text-base-content/60 mt-1">
          Configure how and when you receive notifications from Noble Trader Agent
        </p>
      </div>

      {/* ── Channel Toggles ───────────────────────────────────────────── */}
      <div className="card bg-base-200 shadow">
        <div className="card-body">
          <h3 className="card-title text-base">Notification Channels</h3>
          <p className="text-sm text-base-content/60 -mt-2 mb-3">
            Choose which channels to receive notifications on
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* In-App */}
            <div className="card bg-base-100 shadow-sm">
              <div className="card-body p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📱</span>
                    <span className="font-semibold text-sm">In-App</span>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-sm"
                    checked={true}
                    disabled={true}
                    aria-label="In-App notifications (always enabled)"
                  />
                </div>
                <p className="text-xs text-base-content/60">
                  Always enabled. Notifications appear in the bell icon dropdown and as toast popups.
                </p>
                <button
                  className="btn btn-xs btn-outline btn-primary mt-2"
                  onClick={() => handleTest("in_app")}
                  disabled={testing.in_app}
                >
                  {testing.in_app ? (
                    <><span className="loading loading-spinner loading-xs"></span> Testing</>
                  ) : (
                    "Test In-App"
                  )}
                </button>
                {testResults.in_app && (
                  <div className={`text-xs mt-1 ${testResults.in_app.success ? "text-success" : "text-error"}`}>
                    {testResults.in_app.success ? "✓ Working" : `✗ ${testResults.in_app.error}`}
                  </div>
                )}
              </div>
            </div>

            {/* Discord */}
            <div className="card bg-base-100 shadow-sm">
              <div className="card-body p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">💬</span>
                    <span className="font-semibold text-sm">Discord</span>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-sm"
                    checked={channels.discord}
                    onChange={() => toggleChannel("discord")}
                    aria-label="Discord notifications"
                  />
                </div>
                <p className="text-xs text-base-content/60 mb-2">
                  Send notifications to a Discord channel via webhook.
                </p>

                {/* Webhook URL input */}
                <div className="form-control w-full mb-2">
                  <input
                    type="password"
                    placeholder="https://discord.com/api/webhooks/..."
                    className="input input-bordered input-xs w-full"
                    value={discordWebhookUrl}
                    onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                    aria-label="Discord webhook URL"
                  />
                  <label className="label py-0">
                    <span className="text-[10px] text-base-content/40">
                      Paste your Discord webhook URL
                    </span>
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="btn btn-xs btn-outline"
                    onClick={handleTestDiscordConnection}
                    disabled={!discordWebhookUrl.trim() || discordConnected === "testing"}
                  >
                    {discordConnected === "testing" ? (
                      <><span className="loading loading-spinner loading-xs"></span> Testing</>
                    ) : (
                      "Test Connection"
                    )}
                  </button>
                  <button
                    className="btn btn-xs btn-outline btn-primary"
                    onClick={() => handleTest("discord")}
                    disabled={testing.discord || !channels.discord}
                  >
                    {testing.discord ? (
                      <><span className="loading loading-spinner loading-xs"></span> Sending</>
                    ) : (
                      "Send Test"
                    )}
                  </button>
                </div>

                {discordConnected && discordConnected !== "testing" && (
                  <div className={`text-xs mt-1 ${discordConnected === "connected" ? "text-success" : "text-error"}`}>
                    {discordConnected === "connected" ? "✓ Connected" : "✗ Connection failed"}
                  </div>
                )}
                {testResults.discord && (
                  <div className={`text-xs mt-1 ${testResults.discord.success ? "text-success" : "text-error"}`}>
                    {testResults.discord.success ? "✓ Message sent" : `✗ ${testResults.discord.error}`}
                  </div>
                )}
              </div>
            </div>

            {/* Email */}
            <div className="card bg-base-100 shadow-sm opacity-60">
              <div className="card-body p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📧</span>
                    <span className="font-semibold text-sm">Email</span>
                  </div>
                  <span className="badge badge-xs badge-warning">Coming Soon</span>
                </div>
                <p className="text-xs text-base-content/60">
                  Email notifications are not yet available. Stay tuned for future updates!
                </p>
                <input
                  type="checkbox"
                  className="toggle toggle-sm"
                  checked={false}
                  disabled={true}
                  aria-label="Email notifications (coming soon)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Alert Type Toggles ────────────────────────────────────────── */}
      <div className="card bg-base-200 shadow">
        <div className="card-body">
          <h3 className="card-title text-base">Alert Types</h3>
          <p className="text-sm text-base-content/60 -mt-2 mb-3">
            Choose which types of alerts you want to receive
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(ALERT_TYPE_META).map(([key, meta]) => (
              <div
                key={key}
                className={`flex items-start gap-3 bg-base-100 rounded-lg px-3 py-2.5 transition-colors ${
                  alertTypes[key] ? "ring-1 ring-primary/30" : "opacity-60"
                }`}
              >
                <input
                  type="checkbox"
                  className="toggle toggle-xs toggle-primary mt-0.5 shrink-0"
                  checked={alertTypes[key]}
                  onChange={() => toggleAlertType(key)}
                  aria-label={`Toggle ${meta.label} notifications`}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-sm" role="img" aria-hidden="true">{meta.icon}</span>
                    <span className="font-medium text-sm">{meta.label}</span>
                  </div>
                  <p className="text-[11px] text-base-content/50 leading-tight mt-0.5">
                    {meta.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div className="flex gap-2 mt-3">
            <button
              className="btn btn-xs btn-ghost"
              onClick={() => {
                const allOn = {};
                Object.keys(ALERT_TYPE_META).forEach((k) => { allOn[k] = true; });
                setAlertTypes(allOn);
              }}
            >
              Enable All
            </button>
            <button
              className="btn btn-xs btn-ghost"
              onClick={() => {
                const allOff = {};
                Object.keys(ALERT_TYPE_META).forEach((k) => { allOff[k] = false; });
                setAlertTypes(allOff);
              }}
            >
              Disable All
            </button>
          </div>
        </div>
      </div>

      {/* ── Quiet Hours ───────────────────────────────────────────────── */}
      <div className="card bg-base-200 shadow">
        <div className="card-body">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="card-title text-base">Quiet Hours</h3>
              <p className="text-sm text-base-content/60 -mt-2">
                Suppress non-critical notifications during specified hours
              </p>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-sm"
              checked={quietHours.enabled}
              onChange={() =>
                setQuietHours((prev) => ({ ...prev, enabled: !prev.enabled }))
              }
              aria-label="Enable quiet hours"
            />
          </div>

          {quietHours.enabled && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-medium">Start Time</span>
                </label>
                <input
                  type="time"
                  className="input input-bordered input-sm w-full"
                  value={quietHours.start}
                  onChange={(e) =>
                    setQuietHours((prev) => ({ ...prev, start: e.target.value }))
                  }
                  aria-label="Quiet hours start time"
                />
              </div>
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-medium">End Time</span>
                </label>
                <input
                  type="time"
                  className="input input-bordered input-sm w-full"
                  value={quietHours.end}
                  onChange={(e) =>
                    setQuietHours((prev) => ({ ...prev, end: e.target.value }))
                  }
                  aria-label="Quiet hours end time"
                />
              </div>
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-medium">Timezone</span>
                </label>
                <select
                  className="select select-bordered select-sm w-full"
                  value={quietHours.timezone}
                  onChange={(e) =>
                    setQuietHours((prev) => ({ ...prev, timezone: e.target.value }))
                  }
                  aria-label="Quiet hours timezone"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {quietHours.enabled && (
            <div className="mt-3 text-xs text-base-content/50">
              💡 Critical alerts (kill switch, risk breach) will still be delivered during quiet hours.
            </div>
          )}
        </div>
      </div>

      {/* ── Digest Settings ───────────────────────────────────────────── */}
      <div className="card bg-base-200 shadow">
        <div className="card-body">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="card-title text-base">Digest Summary</h3>
              <p className="text-sm text-base-content/60 -mt-2">
                Receive a periodic summary of notifications instead of individual alerts
              </p>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-sm"
              checked={digestSettings.enabled}
              onChange={() =>
                setDigestSettings((prev) => ({ ...prev, enabled: !prev.enabled }))
              }
              aria-label="Enable digest summary"
            />
          </div>

          {digestSettings.enabled && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-medium">Frequency</span>
                </label>
                <select
                  className="select select-bordered select-sm w-full"
                  value={digestSettings.frequency}
                  onChange={(e) =>
                    setDigestSettings((prev) => ({ ...prev, frequency: e.target.value }))
                  }
                  aria-label="Digest frequency"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-medium">Preferred Time</span>
                </label>
                <input
                  type="time"
                  className="input input-bordered input-sm w-full"
                  value={digestSettings.time}
                  onChange={(e) =>
                    setDigestSettings((prev) => ({ ...prev, time: e.target.value }))
                  }
                  aria-label="Digest delivery time"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Actions ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <button
          className={`btn btn-primary btn-sm ${saving ? "btn-disabled" : ""}`}
          onClick={handleSave}
          disabled={saving || !hasChanges}
        >
          {saving ? (
            <><span className="loading loading-spinner loading-xs"></span> Saving...</>
          ) : (
            "Save Preferences"
          )}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleReset}
          disabled={saving}
        >
          Reset to Defaults
        </button>
        {isDefault && !hasChanges && (
          <span className="badge badge-ghost badge-sm">Using default settings</span>
        )}
        {hasChanges && (
          <span className="badge badge-warning badge-sm">Unsaved changes</span>
        )}
      </div>
    </div>
  );
}
