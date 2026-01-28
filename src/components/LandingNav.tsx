import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Menu, X, ArrowRight } from "lucide-react";

const scrollToId = (hash: string) => {
  const id = hash.replace("#", "");
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
};

export default function LandingNav() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = useMemo(
    () => [
      { name: "Product", href: "#product" },
      { name: "Workflow", href: "#workflow" },
      { name: "FAQ", href: "#faq" }
    ],
    []
  );

  return (
    <nav
      className={`landing-nav fixed inset-x-0 top-0 z-50 transition-all ${
        isScrolled ? "landing-nav--scrolled" : ""
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-3">
          <img src="/fx-hedging-logo.png" alt="FXHedge AI" className="h-9 w-9 rounded-lg" />
          <div className="leading-tight">
            <div className="text-sm font-semibold text-black dark:text-white">FXHedge AI</div>
            <div className="text-xs text-black/60 dark:text-white/60">FX Risk Management Platform</div>
          </div>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a
              key={l.name}
              href={l.href}
              className="text-sm font-medium text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white"
              onClick={(e) => {
                e.preventDefault();
                scrollToId(l.href);
              }}
            >
              {l.name}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle />
          <Link to="/login?mode=login">
            <Button variant="outline" size="sm" className="landing-nav-btn-secondary">
              Sign in
            </Button>
          </Link>
          <Link to="/login?mode=signup">
            <Button size="sm" className="landing-nav-btn-primary">
              Get started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-lg border border-black/10 bg-white p-2 text-black md:hidden"
          onClick={() => setIsMobileOpen((v) => !v)}
          aria-label={isMobileOpen ? "Close menu" : "Open menu"}
        >
          {isMobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {isMobileOpen && (
        <div className="border-t border-black/10 bg-white md:hidden">
          <div className="mx-auto max-w-7xl px-6 py-4">
            <div className="flex flex-col gap-2">
              {links.map((l) => (
                <a
                  key={l.name}
                  href={l.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-black/80 dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/5"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsMobileOpen(false);
                    scrollToId(l.href);
                  }}
                >
                  {l.name}
                </a>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <div className="flex justify-center">
                <ThemeToggle />
              </div>
              <Link to="/login?mode=login" onClick={() => setIsMobileOpen(false)}>
                <Button variant="outline" className="w-full landing-nav-btn-secondary">
                  Sign in
                </Button>
              </Link>
              <Link to="/login?mode=signup" onClick={() => setIsMobileOpen(false)}>
                <Button className="w-full landing-nav-btn-primary">
                  Get started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
