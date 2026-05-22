"use client";

/**
 * CampaignPanel — Renko tab that integrates the campaign system.
 *
 * Shows:
 *   - "Execute as Batch" button when signals are available
 *   - Active campaign runner if one is running
 *   - List of past campaigns
 */

import { useState, useCallback } from "react";
import BatchConfigModal from "./BatchConfigModal";
import CampaignRunner from "./CampaignRunner";
import CampaignList from "./CampaignList";

export default function CampaignPanel({ signals = [], symbol, stats = {} }) {
  const [showBatchConfig, setShowBatchConfig] = useState(false);
  const [activeCampaignId, setActiveCampaignId] = useState(null);
  const [view, setView] = useState("list"); // "list" | "runner"

  // Filter actionable signals (LONG/SHORT with direction)
  const actionableSignals = signals.filter(
    s => s.direction === "LONG" || s.direction === "BUY" || s.direction === "SHORT" || s.direction === "SELL"
  );

  const handleCampaignCreated = useCallback((campaign) => {
    setActiveCampaignId(campaign.id);
    setView("runner");
    setShowBatchConfig(false);
  }, []);

  const handleSelectCampaign = useCallback((campaignId) => {
    setActiveCampaignId(campaignId);
    setView("runner");
  }, []);

  const handleCloseRunner = useCallback(() => {
    setActiveCampaignId(null);
    setView("list");
  }, []);

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
            <span className="text-xs">🎯</span>
          </div>
          <h4 className="font-semibold text-sm">Trade Campaigns</h4>
          <span className="badge badge-xs badge-ghost">
            {actionableSignals.length} signals
          </span>
        </div>

        <div className="flex items-center gap-2">
          {view === "runner" && (
            <button
              className="btn btn-ghost min-h-[44px] sm:min-h-0 sm:btn-xs"
              onClick={() => setView("list")}
            >
              All Campaigns
            </button>
          )}
          <button
            className="btn btn-primary min-h-[44px] sm:min-h-0 sm:btn-sm"
            onClick={() => setShowBatchConfig(true)}
            disabled={actionableSignals.length === 0}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
            </svg>
            Execute as Batch
          </button>
        </div>
      </div>

      {/* No signals notice */}
      {actionableSignals.length === 0 && (
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body p-6 text-center">
            <div className="text-base-content/20 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-sm text-base-content/40">
              No actionable signals yet
            </p>
            <p className="text-xs text-base-content/30 mt-1">
              Run the Renko pipeline and wait for LONG/SHORT signals to appear,
              then start a batch campaign with risk guards.
            </p>
          </div>
        </div>
      )}

      {/* How it works (show when no active campaign) */}
      {view === "list" && !activeCampaignId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <HowItWorksCard
            step={1}
            icon="📊"
            title="Analyze"
            description="HMM regime detection + Renko pattern signals generate trade directions with confidence scores and Kelly fractions."
          />
          <HowItWorksCard
            step={2}
            icon="🎯"
            title="Configure Batch"
            description="Set max trades (e.g. 10), max consecutive losses (e.g. 3), and drawdown limits. Kelly sizing is automatic."
          />
          <HowItWorksCard
            step={3}
            icon="🤖"
            title="Platform Orchestrates"
            description="Sequential execution with bracket orders (SL/TP). Auto-stops on loss streak or drawdown. Results feed back to strategy evolution."
          />
        </div>
      )}

      {/* Campaign List or Runner */}
      {view === "list" && !activeCampaignId && (
        <CampaignList onSelect={handleSelectCampaign} />
      )}

      {view === "runner" && activeCampaignId && (
        <CampaignRunner
          campaignId={activeCampaignId}
          onClose={handleCloseRunner}
        />
      )}

      {/* Batch Config Modal */}
      {showBatchConfig && (
        <BatchConfigModal
          signals={actionableSignals.map(s => ({
            ...s,
            symbol: s.symbol || symbol,
            sl_price: s.sl_price || s.stop_loss_price,
            tp_price: s.tp_price || s.take_profit_price,
          }))}
          analysisId={null}
          onClose={() => setShowBatchConfig(false)}
          onCreated={handleCampaignCreated}
        />
      )}
    </div>
  );
}

function HowItWorksCard({ step, icon, title, description }) {
  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary">
            {step}
          </span>
          <span className="text-sm">{icon}</span>
          <h5 className="font-semibold text-sm">{title}</h5>
        </div>
        <p className="text-xs text-base-content/50 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}
