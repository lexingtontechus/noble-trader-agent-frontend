"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { usePriceFeed } from "@/context/PriceFeedContext";

/**
 * EconomicCalendar — Upcoming economic events from Finnhub.
 *
 * Features:
 *   - Fetches economic calendar from Finnhub API via BFF proxy
 *   - Grouped by date with collapsible sections
 *   - Impact badges (High/Medium/Low) with color coding
 *   - Country flags via emoji
 *   - Estimate vs Actual comparison
 *   - Surprise calculation (actual vs estimate deviation)
 *   - Auto-refresh every 5 minutes
 *   - Filter by impact level
 *   - Responsive: table on desktop, cards on mobile
 */

const IMPACT_STYLES = {
  high: { badge: "badge-error", label: "High", dot: "bg-error" },
  medium: { badge: "badge-warning", label: "Med", dot: "bg-warning" },
  low: { badge: "badge-ghost", label: "Low", dot: "bg-base-content/30" },
};

const COUNTRY_FLAGS = {
  US: "🇺🇸",
  EU: "🇪🇺",
  GB: "🇬🇧",
  JP: "🇯🇵",
  DE: "🇩🇪",
  FR: "🇫🇷",
  CA: "🇨🇦",
  AU: "🇦🇺",
  NZ: "🇳🇿",
  CH: "🇨🇭",
  CN: "🇨🇳",
  KR: "🇰🇷",
  SG: "🇸🇬",
  IN: "🇮🇳",
  BR: "🇧🇷",
  MX: "🇲🇽",
  ZA: "🇿🇦",
  SE: "🇸🇪",
  NO: "🇳🇴",
  HK: "🇭🇰",
};

const FILTER_OPTIONS = [
  { key: "all", label: "All" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium+" },
];

export default function EconomicCalendar() {
  const { connected } = usePriceFeed();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [impactFilter, setImpactFilter] = useState("all");
  const [expandedDates, setExpandedDates] = useState({});

  // Fetch economic calendar
  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const today = new Date();
      const fromDate = today.toISOString().split("T")[0];
      const toDate = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const res = await fetch(
        `/api/prices/economic-calendar?from=${fromDate}&to=${toDate}`
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setEvents(data.events || []);

      // Auto-expand first date
      if (data.events?.length > 0) {
        const firstDate = data.events[0].time?.split(" ")[0];
        if (firstDate) {
          setExpandedDates({ [firstDate]: true });
        }
      }
    } catch (err) {
      console.error("[EconomicCalendar] Fetch error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCalendar();

    // Refresh every 5 minutes
    const timer = setInterval(fetchCalendar, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [fetchCalendar]);

  // Filter events
  const filteredEvents = useMemo(() => {
    if (impactFilter === "all") return events;
    if (impactFilter === "high") return events.filter((e) => e.impact === "high");
    if (impactFilter === "medium") return events.filter((e) => e.impact === "high" || e.impact === "medium");
    return events;
  }, [events, impactFilter]);

  // Group by date
  const groupedByDate = useMemo(() => {
    const groups = {};
    for (const event of filteredEvents) {
      const dateStr = event.time?.split(" ")[0] || "Unknown";
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(event);
    }
    // Sort dates
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredEvents]);

  // Toggle date expansion
  const toggleDate = (date) => {
    setExpandedDates((prev) => ({ ...prev, [date]: !prev[date] }));
  };

  // Calculate surprise (actual vs estimate)
  const getSurprise = (event) => {
    if (event.actual == null || event.estimate == null) return null;
    const actual = parseFloat(event.actual);
    const estimate = parseFloat(event.estimate);
    if (isNaN(actual) || isNaN(estimate) || estimate === 0) return null;
    return ((actual - estimate) / Math.abs(estimate)) * 100;
  };

  // Format date nicely
  const formatDate = (dateStr) => {
    try {
      const date = new Date(dateStr + "T12:00:00");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const eventDate = new Date(date);
      eventDate.setHours(0, 0, 0, 0);

      const diffDays = Math.round((eventDate - today) / (1000 * 60 * 60 * 24));
      const dayLabel = diffDays === 0 ? "Today" : diffDays === 1 ? "Tomorrow" : diffDays === -1 ? "Yesterday" : "";
      const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
      const monthDay = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      return { weekday, monthDay, dayLabel, isToday: diffDays === 0 };
    } catch {
      return { weekday: "", monthDay: dateStr, dayLabel: "", isToday: false };
    }
  };

  // Stats
  const stats = useMemo(() => {
    const high = events.filter((e) => e.impact === "high").length;
    const medium = events.filter((e) => e.impact === "medium").length;
    const low = events.filter((e) => e.impact === "low").length;
    const released = events.filter((e) => e.actual != null).length;
    return { high, medium, low, released, total: events.length };
  }, [events]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 sm:px-4 py-2 border-b border-base-300 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-bold">Economic Calendar</h3>
            <span className="badge badge-xs badge-accent gap-1">Finnhub</span>
          </div>
          <button
            className="btn btn-xs btn-ghost min-h-[36px] sm:min-h-0"
            onClick={fetchCalendar}
            disabled={loading}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Filter + Stats */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                className={`btn btn-xs min-h-[32px] sm:min-h-0 ${impactFilter === opt.key ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setImpactFilter(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-base-content/40">
            <span className="text-error">{stats.high}H</span>
            <span className="text-warning">{stats.medium}M</span>
            <span>{stats.low}L</span>
          </div>
        </div>
      </div>

      {/* Events list */}
      <div className="flex-1 overflow-y-auto">
        {loading && events.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <span className="loading loading-spinner loading-md text-primary"></span>
          </div>
        )}

        {error && (
          <div className="p-4">
            <div className="alert alert-error alert-sm">
              <span className="text-xs">{error}</span>
              <button className="btn btn-xs btn-ghost" onClick={fetchCalendar}>Retry</button>
            </div>
          </div>
        )}

        {!loading && !error && filteredEvents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-base-content/40">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm">No events found</span>
          </div>
        )}

        {groupedByDate.map(([date, dateEvents]) => {
          const dateInfo = formatDate(date);
          const isExpanded = expandedDates[date] !== false; // Default expanded

          return (
            <div key={date} className={`border-b border-base-300 ${dateInfo.isToday ? "bg-primary/5" : ""}`}>
              {/* Date header */}
              <button
                className="w-full flex items-center justify-between px-3 sm:px-4 py-2 hover:bg-base-200/50 transition-colors"
                onClick={() => toggleDate(date)}
              >
                <div className="flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-3.5 w-3.5 text-base-content/30 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-xs font-semibold">
                    {dateInfo.weekday} {dateInfo.monthDay}
                  </span>
                  {dateInfo.dayLabel && (
                    <span className={`badge badge-xs ${dateInfo.isToday ? "badge-primary" : "badge-ghost"}`}>
                      {dateInfo.dayLabel}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-base-content/30">
                  {dateEvents.length} events
                </span>
              </button>

              {/* Events for this date */}
              {isExpanded && (
                <div className="px-3 sm:px-4 pb-2 space-y-1">
                  {dateEvents.map((event, idx) => {
                    const impact = IMPACT_STYLES[event.impact] || IMPACT_STYLES.low;
                    const surprise = getSurprise(event);
                    const timeStr = event.time?.split(" ")[1]?.substring(0, 5) || "";
                    const flag = COUNTRY_FLAGS[event.country] || "";

                    return (
                      <div
                        key={event.id || idx}
                        className={`
                          flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 rounded-lg
                          ${event.impact === "high" ? "bg-error/5 border border-error/10" : "bg-base-200/30"}
                        `}
                      >
                        {/* Time */}
                        <span className="text-[10px] font-mono text-base-content/40 w-10 shrink-0">
                          {timeStr}
                        </span>

                        {/* Country */}
                        <span className="text-sm shrink-0">{flag}</span>

                        {/* Impact badge */}
                        <span className={`badge badge-xs ${impact.badge} shrink-0`}>
                          {impact.label}
                        </span>

                        {/* Event name */}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{event.event}</div>
                          <div className="text-[10px] text-base-content/40">{event.country}</div>
                        </div>

                        {/* Values */}
                        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                          {event.estimate != null && (
                            <div className="text-right hidden sm:block">
                              <div className="text-[9px] text-base-content/30">Est.</div>
                              <div className="text-xs font-mono">{event.estimate}{event.unit || ""}</div>
                            </div>
                          )}
                          {event.actual != null && (
                            <div className="text-right">
                              <div className="text-[9px] text-base-content/30">Actual</div>
                              <div className={`text-xs font-mono font-semibold ${surprise != null ? (surprise >= 0 ? "text-success" : "text-error") : ""}`}>
                                {event.actual}{event.unit || ""}
                              </div>
                            </div>
                          )}
                          {event.prev != null && (
                            <div className="text-right hidden sm:block">
                              <div className="text-[9px] text-base-content/30">Prev</div>
                              <div className="text-xs font-mono text-base-content/50">{event.prev}</div>
                            </div>
                          )}
                          {surprise != null && (
                            <span className={`badge badge-xs font-mono ${surprise >= 0 ? "badge-success" : "badge-error"}`}>
                              {surprise >= 0 ? "+" : ""}{surprise.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-1.5 bg-base-200/30 border-t border-base-300 flex items-center justify-between text-[10px] text-base-content/40">
        <div className="flex items-center gap-2">
          <span>{stats.total} events (2 weeks)</span>
          <span>|</span>
          <span>{stats.released} released</span>
        </div>
        <span>Auto-refresh: 5 min</span>
      </div>
    </div>
  );
}
