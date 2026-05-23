"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  pdf,
} from "@react-pdf/renderer";
import { notifySuccess, notifyError } from "@/lib/notifications";

/* ───────────────────────────────────────────────────────────────
   PDF Performance Report — Noble Trader
   Generates a downloadable PDF with account summary, positions,
   equity curve data, and key risk metrics.
   ─────────────────────────────────────────────────────────────── */

// Register fonts for the PDF
Font.register({
  family: "Noto",
  fonts: [
    { src: "/fonts/NotoSansSC[wght].ttf", fontWeight: 400 },
    { src: "/fonts/NotoSansSC[wght].ttf", fontWeight: 700 },
  ],
});

const COLORS = {
  primary: "#0f172a",
  secondary: "#1e293b",
  accent: "#3b82f6",
  success: "#16a34a",
  danger: "#dc2626",
  muted: "#64748b",
  light: "#f1f5f9",
  white: "#ffffff",
  border: "#e2e8f0",
};

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Noto",
    color: COLORS.primary,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    borderBottom: `2px solid ${COLORS.accent}`,
    paddingBottom: 12,
  },
  headerLeft: { flex: 1 },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: COLORS.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.muted,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  badge: {
    backgroundColor: COLORS.accent,
    color: COLORS.white,
    padding: "3 8",
    borderRadius: 3,
    fontSize: 8,
    marginBottom: 4,
  },
  dateText: {
    fontSize: 9,
    color: COLORS.muted,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: COLORS.primary,
    marginTop: 18,
    marginBottom: 8,
    borderLeft: `3px solid ${COLORS.accent}`,
    paddingLeft: 8,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  statCard: {
    width: "23%",
    backgroundColor: COLORS.light,
    borderRadius: 4,
    padding: 10,
    border: `1px solid ${COLORS.border}`,
  },
  statLabel: {
    fontSize: 8,
    color: COLORS.muted,
    marginBottom: 3,
    textTransform: "uppercase",
  },
  statValue: {
    fontSize: 14,
    fontWeight: 700,
    color: COLORS.primary,
  },
  statValueSuccess: {
    fontSize: 14,
    fontWeight: 700,
    color: COLORS.success,
  },
  statValueDanger: {
    fontSize: 14,
    fontWeight: 700,
    color: COLORS.danger,
  },
  table: {
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.secondary,
    borderRadius: 3,
    padding: "6 8",
  },
  tableHeaderCell: {
    fontSize: 8,
    color: COLORS.white,
    fontWeight: 700,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    padding: "5 8",
    borderBottom: `1px solid ${COLORS.border}`,
  },
  tableRowAlt: {
    flexDirection: "row",
    padding: "5 8",
    borderBottom: `1px solid ${COLORS.border}`,
    backgroundColor: COLORS.light,
  },
  tableCell: {
    fontSize: 9,
    color: COLORS.primary,
  },
  cellSuccess: {
    fontSize: 9,
    color: COLORS.success,
    fontWeight: 700,
  },
  cellDanger: {
    fontSize: 9,
    color: COLORS.danger,
    fontWeight: 700,
  },
  riskGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  riskCard: {
    flex: 1,
    backgroundColor: COLORS.light,
    borderRadius: 4,
    padding: 10,
    border: `1px solid ${COLORS.border}`,
  },
  riskLabel: {
    fontSize: 8,
    color: COLORS.muted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  riskValue: {
    fontSize: 16,
    fontWeight: 700,
    color: COLORS.primary,
  },
  riskDesc: {
    fontSize: 7,
    color: COLORS.muted,
    marginTop: 2,
  },
  equityTable: {
    marginBottom: 12,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: `1px solid ${COLORS.border}`,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 7,
    color: COLORS.muted,
  },
  disclaimer: {
    fontSize: 7,
    color: COLORS.muted,
    marginTop: 20,
    lineHeight: 1.4,
    borderTop: `1px solid ${COLORS.border}`,
    paddingTop: 8,
  },
});

// Column widths for positions table (percentage of page width)
const POS_COLS = [0.18, 0.10, 0.16, 0.16, 0.20, 0.20];
const EQUITY_COLS = [0.25, 0.25, 0.25, 0.25];

function fmtCurrency(val) {
  if (val == null) return "—";
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(num);
}

function fmtPct(val) {
  if (val == null) return "—";
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "—";
  const prefix = num >= 0 ? "+" : "";
  return `${prefix}${num.toFixed(2)}%`;
}

function fmtPnl(val) {
  if (val == null) return "—";
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "—";
  const prefix = num >= 0 ? "+$" : "-$";
  return `${prefix}${Math.abs(num).toFixed(2)}`;
}

/* ── PDF Document Component ─────────────────────────────────── */

function PerformanceReportDocument({ account, positions, equityCurve, activities }) {
  const now = new Date();
  const reportDate = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const reportTime = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Computed metrics
  const totalUnrealizedPnl = positions.reduce(
    (sum, p) => sum + (parseFloat(p.unrealized_pl) || 0), 0
  );
  const totalMarketValue = positions.reduce(
    (sum, p) => sum + (parseFloat(p.market_value) || 0), 0
  );
  const dayPnl = account
    ? (parseFloat(account.equity) || 0) - (parseFloat(account.last_equity) || 0)
    : 0;
  const dayPnlPc = account && parseFloat(account.last_equity) > 0
    ? (dayPnl / parseFloat(account.last_equity)) * 100
    : 0;
  const equity = parseFloat(account?.equity) || 0;
  const cash = parseFloat(account?.cash) || 0;
  const buyingPower = parseFloat(account?.buying_power) || 0;
  const longMV = parseFloat(account?.long_market_value) || 0;

  // Risk metrics
  const maxPositionPct = positions.length > 0
    ? Math.max(...positions.map(p => {
        const mv = parseFloat(p.market_value) || 0;
        return totalMarketValue > 0 ? (mv / totalMarketValue) * 100 : 0;
      }))
    : 0;
  const winRate = activities.length > 0
    ? (() => {
        const wins = activities.filter(a => parseFloat(a.price) > 0).length;
        return ((wins / activities.length) * 100).toFixed(1);
      })()
    : "N/A";

  // Equity curve stats
  const equityStart = equityCurve.length > 0 ? equityCurve[0].equity : equity;
  const equityEnd = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].equity : equity;
  const totalReturnPc = equityStart > 0
    ? ((equityEnd - equityStart) / equityStart) * 100
    : 0;
  const maxDrawdown = equityCurve.length > 1
    ? (() => {
        let peak = equityCurve[0].equity;
        let maxDD = 0;
        for (const pt of equityCurve) {
          if (pt.equity > peak) peak = pt.equity;
          const dd = ((peak - pt.equity) / peak) * 100;
          if (dd > maxDD) maxDD = dd;
        }
        return maxDD;
      })()
    : 0;

  // Snapshot equity points for the PDF table (pick at most 12 evenly spaced)
  const equitySnapshots = equityCurve.length > 12
    ? equityCurve.filter((_, i) => i % Math.ceil(equityCurve.length / 12) === 0 || i === equityCurve.length - 1)
    : equityCurve;

  return (
    <Document
      title={`Noble Trader Performance Report — ${reportDate}`}
      author="Noble Trader"
      creator="Z.ai"
      subject="Account Performance Report"
    >
      {/* Page 1: Account Summary & Positions */}
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Performance Report</Text>
            <Text style={styles.subtitle}>Noble Trader — Paper Trading Account</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.badge}>PAPER TRADING</Text>
            <Text style={styles.dateText}>{reportDate}</Text>
            <Text style={styles.dateText}>{reportTime}</Text>
          </View>
        </View>

        {/* Account Summary */}
        <Text style={styles.sectionTitle}>Account Summary</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total Equity</Text>
            <Text style={styles.statValue}>{fmtCurrency(equity)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Cash Balance</Text>
            <Text style={styles.statValue}>{fmtCurrency(cash)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Buying Power</Text>
            <Text style={styles.statValue}>{fmtCurrency(buyingPower)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Long Market Value</Text>
            <Text style={styles.statValue}>{fmtCurrency(longMV)}</Text>
          </View>
        </View>

        {/* P&L Summary */}
        <Text style={styles.sectionTitle}>Profit & Loss</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Day P&L</Text>
            <Text style={dayPnl >= 0 ? styles.statValueSuccess : styles.statValueDanger}>
              {fmtPnl(dayPnl)} ({fmtPct(dayPnlPc)})
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Unrealized P&L</Text>
            <Text style={totalUnrealizedPnl >= 0 ? styles.statValueSuccess : styles.statValueDanger}>
              {fmtPnl(totalUnrealizedPnl)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total Return</Text>
            <Text style={totalReturnPc >= 0 ? styles.statValueSuccess : styles.statValueDanger}>
              {fmtPct(totalReturnPc)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Open Positions</Text>
            <Text style={styles.statValue}>{positions.length}</Text>
          </View>
        </View>

        {/* Open Positions Table */}
        {positions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Open Positions</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { width: `${POS_COLS[0] * 100}%` }]}>Symbol</Text>
                <Text style={[styles.tableHeaderCell, { width: `${POS_COLS[1] * 100}%` }]}>Qty</Text>
                <Text style={[styles.tableHeaderCell, { width: `${POS_COLS[2] * 100}%` }]}>Avg Entry</Text>
                <Text style={[styles.tableHeaderCell, { width: `${POS_COLS[3] * 100}%` }]}>Current</Text>
                <Text style={[styles.tableHeaderCell, { width: `${POS_COLS[4] * 100}%` }]}>Market Value</Text>
                <Text style={[styles.tableHeaderCell, { width: `${POS_COLS[5] * 100}%` }]}>Unrealized P&L</Text>
              </View>
              {positions.slice(0, 15).map((pos, idx) => {
                const unrealizedPl = parseFloat(pos.unrealized_pl) || 0;
                const isAlt = idx % 2 === 1;
                return (
                  <View key={pos.symbol || idx} style={isAlt ? styles.tableRowAlt : styles.tableRow}>
                    <Text style={[styles.tableCell, { width: `${POS_COLS[0] * 100}%`, fontWeight: 700 }]}>
                      {pos.symbol}
                    </Text>
                    <Text style={[styles.tableCell, { width: `${POS_COLS[1] * 100}%` }]}>
                      {pos.qty}
                    </Text>
                    <Text style={[styles.tableCell, { width: `${POS_COLS[2] * 100}%` }]}>
                      {fmtCurrency(pos.avg_entry_price)}
                    </Text>
                    <Text style={[styles.tableCell, { width: `${POS_COLS[3] * 100}%` }]}>
                      {fmtCurrency(pos.current_price)}
                    </Text>
                    <Text style={[styles.tableCell, { width: `${POS_COLS[4] * 100}%` }]}>
                      {fmtCurrency(pos.market_value)}
                    </Text>
                    <Text style={[unrealizedPl >= 0 ? styles.cellSuccess : styles.cellDanger, { width: `${POS_COLS[5] * 100}%` }]}>
                      {fmtPnl(pos.unrealized_pl)}
                      {pos.unrealized_plpc != null && (
                        ` (${fmtPct(parseFloat(pos.unrealized_plpc) * 100)})`
                      )}
                    </Text>
                  </View>
                );
              })}
            </View>
            {positions.length > 15 && (
              <Text style={{ fontSize: 8, color: COLORS.muted, textAlign: "center" }}>
                Showing 15 of {positions.length} positions
              </Text>
            )}
          </>
        )}

        {/* Risk Metrics */}
        <Text style={styles.sectionTitle}>Risk Metrics</Text>
        <View style={styles.riskGrid}>
          <View style={styles.riskCard}>
            <Text style={styles.riskLabel}>Max Drawdown</Text>
            <Text style={[styles.riskValue, { color: COLORS.danger }]}>{maxDrawdown.toFixed(2)}%</Text>
            <Text style={styles.riskDesc}>Largest peak-to-trough decline</Text>
          </View>
          <View style={styles.riskCard}>
            <Text style={styles.riskLabel}>Concentration Risk</Text>
            <Text style={styles.riskValue}>{maxPositionPct.toFixed(1)}%</Text>
            <Text style={styles.riskDesc}>Largest position as % of portfolio</Text>
          </View>
          <View style={styles.riskCard}>
            <Text style={styles.riskLabel}>Cash Ratio</Text>
            <Text style={styles.riskValue}>
              {equity > 0 ? ((cash / equity) * 100).toFixed(1) : "0.0"}%
            </Text>
            <Text style={styles.riskDesc}>Cash as % of total equity</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Noble Trader — Paper Trading Performance Report</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text>
            This report is generated from paper trading data and does not represent real financial results.
            Past performance is not indicative of future results. All data sourced from Alpaca Markets paper trading API.
            This report is for informational purposes only and should not be considered financial advice.
          </Text>
        </View>
      </Page>

      {/* Page 2: Equity Curve & Trade History */}
      <Page size="A4" style={styles.page}>
        {/* Header (mini) */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12, borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 6 }}>
          <Text style={{ fontSize: 14, fontWeight: 700, color: COLORS.primary }}>
            Performance Report — Continued
          </Text>
          <Text style={{ fontSize: 9, color: COLORS.muted }}>{reportDate}</Text>
        </View>

        {/* Equity Curve Table */}
        {equitySnapshots.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Equity Curve</Text>
            <View style={styles.equityTable}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { width: `${EQUITY_COLS[0] * 100}%` }]}>Date</Text>
                <Text style={[styles.tableHeaderCell, { width: `${EQUITY_COLS[1] * 100}%` }]}>Equity</Text>
                <Text style={[styles.tableHeaderCell, { width: `${EQUITY_COLS[2] * 100}%` }]}>P&L</Text>
                <Text style={[styles.tableHeaderCell, { width: `${EQUITY_COLS[3] * 100}%` }]}>Return %</Text>
              </View>
              {equitySnapshots.map((pt, idx) => {
                const isAlt = idx % 2 === 1;
                return (
                  <View key={idx} style={isAlt ? styles.tableRowAlt : styles.tableRow}>
                    <Text style={[styles.tableCell, { width: `${EQUITY_COLS[0] * 100}%` }]}>
                      {pt.date}
                    </Text>
                    <Text style={[styles.tableCell, { width: `${EQUITY_COLS[1] * 100}%` }]}>
                      {fmtCurrency(pt.equity)}
                    </Text>
                    <Text style={[pt.pnl >= 0 ? styles.cellSuccess : styles.cellDanger, { width: `${EQUITY_COLS[2] * 100}%` }]}>
                      {fmtPnl(pt.pnl)}
                    </Text>
                    <Text style={[pt.pnlPc >= 0 ? styles.cellSuccess : styles.cellDanger, { width: `${EQUITY_COLS[3] * 100}%` }]}>
                      {fmtPct(pt.pnlPc)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* Recent Trade Activity */}
        {activities.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Recent Trade Activity</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { width: "25%" }]}>Date</Text>
                <Text style={[styles.tableHeaderCell, { width: "15%" }]}>Symbol</Text>
                <Text style={[styles.tableHeaderCell, { width: "10%" }]}>Side</Text>
                <Text style={[styles.tableHeaderCell, { width: "10%" }]}>Qty</Text>
                <Text style={[styles.tableHeaderCell, { width: "20%" }]}>Price</Text>
                <Text style={[styles.tableHeaderCell, { width: "20%" }]}>Value</Text>
              </View>
              {activities.slice(0, 20).map((act, idx) => {
                const isAlt = idx % 2 === 1;
                const price = parseFloat(act.price) || 0;
                const qty = parseInt(act.qty) || 0;
                return (
                  <View key={idx} style={isAlt ? styles.tableRowAlt : styles.tableRow}>
                    <Text style={[styles.tableCell, { width: "25%" }]}>
                      {act.transaction_time ? new Date(act.transaction_time).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                    </Text>
                    <Text style={[styles.tableCell, { width: "15%", fontWeight: 700 }]}>
                      {act.symbol || "—"}
                    </Text>
                    <Text style={[act.side === "buy" ? styles.cellSuccess : styles.cellDanger, { width: "10%" }]}>
                      {(act.side || "—").toUpperCase()}
                    </Text>
                    <Text style={[styles.tableCell, { width: "10%" }]}>{qty}</Text>
                    <Text style={[styles.tableCell, { width: "20%" }]}>{fmtCurrency(price)}</Text>
                    <Text style={[styles.tableCell, { width: "20%" }]}>{fmtCurrency(price * qty)}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* Portfolio Composition */}
        {positions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Portfolio Composition</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { width: "30%" }]}>Symbol</Text>
                <Text style={[styles.tableHeaderCell, { width: "25%" }]}>Market Value</Text>
                <Text style={[styles.tableHeaderCell, { width: "20%" }]}>Weight</Text>
                <Text style={[styles.tableHeaderCell, { width: "25%" }]}>P&L</Text>
              </View>
              {positions.map((pos, idx) => {
                const isAlt = idx % 2 === 1;
                const mv = parseFloat(pos.market_value) || 0;
                const weight = totalMarketValue > 0 ? (mv / totalMarketValue) * 100 : 0;
                const unrealizedPl = parseFloat(pos.unrealized_pl) || 0;
                return (
                  <View key={pos.symbol || idx} style={isAlt ? styles.tableRowAlt : styles.tableRow}>
                    <Text style={[styles.tableCell, { width: "30%", fontWeight: 700 }]}>
                      {pos.symbol}
                    </Text>
                    <Text style={[styles.tableCell, { width: "25%" }]}>
                      {fmtCurrency(mv)}
                    </Text>
                    <Text style={[styles.tableCell, { width: "20%" }]}>
                      {weight.toFixed(1)}%
                    </Text>
                    <Text style={[unrealizedPl >= 0 ? styles.cellSuccess : styles.cellDanger, { width: "25%" }]}>
                      {fmtPnl(unrealizedPl)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Noble Trader — Paper Trading Performance Report</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/* ── Public Component: Download Button / Trigger ─────────────── */

export default function PerformanceReport({ account, positions, equityCurve, activities }) {
  const [generating, setGenerating] = useState(false);

  const canGenerate = !!account || (positions && positions.length > 0);

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;

    setGenerating(true);
    try {
      const doc = (
        <PerformanceReportDocument
          account={account}
          positions={positions || []}
          equityCurve={equityCurve || []}
          activities={activities || []}
        />
      );

      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      link.download = `noble-trader-performance-${dateStr}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      notifySuccess("Performance report downloaded!");
    } catch (err) {
      console.error("[PerformanceReport] PDF generation failed:", err);
      notifyError(`Failed to generate PDF: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  }, [account, positions, equityCurve, activities, canGenerate]);

  return (
    <div className="card bg-base-200 shadow">
      <div className="card-body p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="card-title text-lg">Performance Report</h2>
          <span className="badge badge-sm badge-ghost">PDF</span>
        </div>

        <p className="text-sm text-base-content/60 mb-3">
          Generate a downloadable PDF report with your account summary, open positions,
          equity curve, trade activity, and risk metrics.
        </p>

        {/* Quick Stats Preview */}
        {account && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <div className="bg-base-300/50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-base-content/50 uppercase">Equity</div>
              <div className="font-mono font-bold text-sm">
                {fmtCurrency(parseFloat(account.equity) || 0)}
              </div>
            </div>
            <div className="bg-base-300/50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-base-content/50 uppercase">Day P&L</div>
              <div className={`font-mono font-bold text-sm ${
                (parseFloat(account.equity) || 0) - (parseFloat(account.last_equity) || 0) >= 0
                  ? "text-success" : "text-error"
              }`}>
                {fmtPnl((parseFloat(account.equity) || 0) - (parseFloat(account.last_equity) || 0))}
              </div>
            </div>
            <div className="bg-base-300/50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-base-content/50 uppercase">Positions</div>
              <div className="font-mono font-bold text-sm">{positions?.length || 0}</div>
            </div>
            <div className="bg-base-300/50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-base-content/50 uppercase">Trades</div>
              <div className="font-mono font-bold text-sm">{activities?.length || 0}</div>
            </div>
          </div>
        )}

        {/* Report Sections */}
        <div className="space-y-1 mb-4">
          <div className="flex items-center gap-2 text-xs text-base-content/50">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Account Summary & P&L
          </div>
          <div className="flex items-center gap-2 text-xs text-base-content/50">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Open Positions Table
          </div>
          <div className="flex items-center gap-2 text-xs text-base-content/50">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Risk Metrics (Max DD, Concentration, Cash Ratio)
          </div>
          <div className="flex items-center gap-2 text-xs text-base-content/50">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Equity Curve & Trade History
          </div>
          <div className="flex items-center gap-2 text-xs text-base-content/50">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Portfolio Composition
          </div>
        </div>

        <button
          className={`btn btn-primary w-full gap-2 ${generating ? "loading" : ""}`}
          onClick={handleGenerate}
          disabled={!canGenerate || generating}
        >
          {generating ? (
            <>
              <span className="loading loading-spinner loading-sm"></span>
              Generating PDF...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download Performance Report
            </>
          )}
        </button>

        {!canGenerate && (
          <p className="text-xs text-base-content/40 text-center mt-2">
            Connect your Alpaca account to generate reports
          </p>
        )}
      </div>
    </div>
  );
}
