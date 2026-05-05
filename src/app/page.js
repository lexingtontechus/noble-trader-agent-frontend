"use client";

import { Show, SignIn } from "@clerk/nextjs";
import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Dashboard from "@/components/dashboard/Dashboard";
import OrdersPage from "@/components/orders/OrdersPage";
import SimulatePage from "@/components/simulation/SimulatePage";
import PortfolioOverview from "@/components/portfolio/PortfolioOverview";
import SearchPage from "@/components/search/SearchPage";
import { StreamProvider } from "@/context/StreamContext";

export default function Home() {
  const [activeView, setActiveView] = useState("dashboard");

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;
      if ((e.metaKey || e.ctrlKey) && e.key === "1") {
        e.preventDefault();
        setActiveView("dashboard");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "2") {
        e.preventDefault();
        setActiveView("orders");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "3") {
        e.preventDefault();
        setActiveView("simulate");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "4") {
        e.preventDefault();
        setActiveView("portfolio");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "5") {
        e.preventDefault();
        setActiveView("search");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <Show
      when="signed-out"
      fallback={
        <StreamProvider>
          <div className="min-h-screen flex flex-col">
            <Navbar activeView={activeView} setActiveView={setActiveView} />
            <main className="flex-1 container mx-auto px-4 py-6">
              <div key={activeView} className="animate-fade-in-up">
                {activeView === "dashboard" && <Dashboard />}
                {activeView === "orders" && <OrdersPage />}
                {activeView === "simulate" && <SimulatePage />}
                {activeView === "portfolio" && <PortfolioOverview />}
                {activeView === "search" && <SearchPage />}
              </div>
            </main>
            <Footer />
          </div>
        </StreamProvider>
      }
    >
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <div className="card w-full max-w-md bg-base-100 shadow-xl">
          <div className="card-body items-center text-center">
            <h1 className="text-3xl font-bold text-primary">Noble Trader</h1>
            <p className="text-base-content/60 mt-2">
              Dynamic Regime Risk Management Platform
            </p>
            <div className="divider text-base-content/40">
              Sign In to Continue
            </div>
            <SignIn />
          </div>
        </div>
      </div>
    </Show>
  );
}
