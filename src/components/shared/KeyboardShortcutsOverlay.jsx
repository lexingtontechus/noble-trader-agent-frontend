"use client";

/**
 * KeyboardShortcutsOverlay — Beautiful shortcut reference overlay.
 *
 * Triggered by `?` key or `Cmd/Ctrl + /`.
 * Dismissed by `Escape`, clicking outside, or pressing `?` again.
 *
 * Organized by category:
 *   - Navigation (Cmd+1-0)
 *   - Trading (Quick trade, buy, sell)
 *   - Views (Search, settings, etc.)
 *   - General (Help, escape)
 */

import { useEffect, useRef, useCallback } from "react";

// ── Shortcut Definitions ────────────────────────────────────────────────────

const SHORTCUT_CATEGORIES = [
  {
    title: "Navigation",
    icon: "🧭",
    shortcuts: [
      { keys: ["⌘", "1"], description: "Dashboard" },
      { keys: ["⌘", "2"], description: "Prices / Live Charts" },
      { keys: ["⌘", "3"], description: "Orders & Positions" },
      { keys: ["⌘", "4"], description: "Trade Workflow" },
      { keys: ["⌘", "5"], description: "Renko Analysis" },
      { keys: ["⌘", "6"], description: "Simulate" },
      { keys: ["⌘", "7"], description: "Portfolio" },
      { keys: ["⌘", "8"], description: "Search" },
      { keys: ["⌘", "9"], description: "P&L / Operations" },
      { keys: ["⌘", "0"], description: "Admin Panel" },
    ],
  },
  {
    title: "Trading",
    icon: "⚡",
    shortcuts: [
      { keys: ["T"], description: "Quick Trade (FAB)" },
      { keys: ["B"], description: "Quick Buy" },
      { keys: ["S"], description: "Quick Sell" },
    ],
  },
  {
    title: "Views",
    icon: "👁️",
    shortcuts: [
      { keys: ["/"], description: "Focus Search" },
      { keys: ["G", "S"], description: "Go to Settings" },
      { keys: ["G", "D"], description: "Go to Dashboard" },
      { keys: ["G", "P"], description: "Go to Prices" },
      { keys: ["G", "O"], description: "Go to Orders" },
    ],
  },
  {
    title: "General",
    icon: "⌨️",
    shortcuts: [
      { keys: ["?"], description: "Show this help" },
      { keys: ["Esc"], description: "Close modal / overlay" },
    ],
  },
];

// ── Key Combo Display ───────────────────────────────────────────────────────

function KeyBadge({ children }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5
      bg-base-200 border border-base-300 rounded text-xs font-mono font-bold
      text-base-content/70 shadow-sm">
      {children}
    </kbd>
  );
}

function KeyCombo({ keys }) {
  return (
    <div className="flex items-center gap-0.5">
      {keys.map((key, i) => (
        <span key={i} className="flex items-center gap-0.5">
          {i > 0 && <span className="text-base-content/20 text-xs">+</span>}
          <KeyBadge>{key}</KeyBadge>
        </span>
      ))}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function KeyboardShortcutsOverlay({ open, onClose }) {
  const overlayRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    // Use capture phase to beat other Escape handlers
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [open, onClose]);

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e) => {
      if (e.target === overlayRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  if (!open) return null;

  // Detect Mac for ⌘ vs Ctrl display
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  const shortcutCategories = SHORTCUT_CATEGORIES.map((cat) => ({
    ...cat,
    shortcuts: cat.shortcuts.map((s) => ({
      ...s,
      keys: s.keys.map((k) => (k === "⌘" ? (isMac ? "⌘" : "Ctrl") : k)),
    })),
  }));

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div className="bg-base-100 border border-base-300 rounded-2xl shadow-2xl
        w-full max-w-lg max-h-[80vh] overflow-hidden mx-4 animate-scale-in">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-base-300">
          <div className="flex items-center gap-2">
            <span className="text-xl" role="img" aria-hidden="true">⌨️</span>
            <h2 className="text-lg font-bold">Keyboard Shortcuts</h2>
          </div>
          <button
            className="btn btn-ghost btn-sm btn-circle"
            onClick={onClose}
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Shortcut groups */}
        <div className="overflow-y-auto px-6 py-4 space-y-6" style={{ scrollbarWidth: "thin" }}>
          {shortcutCategories.map((category) => (
            <div key={category.title}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base" role="img" aria-hidden="true">
                  {category.icon}
                </span>
                <h3 className="text-sm font-bold text-base-content/60 uppercase tracking-wider">
                  {category.title}
                </h3>
              </div>
              <div className="space-y-2">
                {category.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.keys.join("+")}
                    className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-base-200/50 transition-colors"
                  >
                    <span className="text-sm text-base-content/80">
                      {shortcut.description}
                    </span>
                    <KeyCombo keys={shortcut.keys} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-base-300 bg-base-200/30 text-center">
          <span className="text-xs text-base-content/40">
            Press <KeyBadge>?</KeyBadge> or <KeyBadge>Esc</KeyBadge> to close
          </span>
        </div>
      </div>
    </div>
  );
}
