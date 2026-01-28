import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import LandingNav from "@/components/LandingNav";
import ScrollReveal from "@/components/ScrollReveal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  BarChart3,
  Calculator,
  CheckCircle2,
  Layers,
  LineChart,
  MessageSquareText,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import "@/styles/landing-page.css";

type LandingImage = { src: string; alt: string };

function Img({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={(e) => {
        e.currentTarget.src = "/placeholder.svg";
      }}
    />
  );
}

export default function LandingPage() {
  const [activeFAQ, setActiveFAQ] = useState<number | null>(0);

  // Using images from public/landing-page/
  // - Attached_image.png → Strategy Builder
  // - Attached_image2.png → Pricers
  // - Attached_image3.png → Dashboard
  // - Attached_image4.png → Forex Chat AI
  // - Attached_image5.png → Hedging Instruments
  const shots = useMemo<LandingImage[]>(
    () => [
      { src: "/landing-page/Attached_image.png", alt: "Strategy Builder" },
      { src: "/landing-page/Attached_image2.png", alt: "Pricers" },
      { src: "/landing-page/Attached_image3.png", alt: "Dashboard" },
      { src: "/landing-page/Attached_image4.png", alt: "Forex Chat AI" },
      { src: "/landing-page/Attached_image5.png", alt: "Hedging Instruments" }
    ],
    []
  );

  const modules = useMemo(
    () => [
      {
        title: "Strategy Builder",
        icon: <Layers className="h-5 w-5" />,
        description: "Build structured FX option strategies with clean inputs and synced market data.",
        img: shots[0],
        cta: "Build a strategy"
      },
      {
        title: "Pricers",
        icon: <Calculator className="h-5 w-5" />,
        description: "Price FX options with models, Greeks, and scenarios — consistent spot and rates.",
        img: shots[1],
        cta: "Explore pricing"
      },
      {
        title: "Risk Dashboard",
        icon: <BarChart3 className="h-5 w-5" />,
        description: "Monitor exposures, hedge coverage, and MTM impact in an executive-ready view.",
        img: shots[2],
        cta: "View dashboard"
      },
      {
        title: "Forex Chat AI",
        icon: <MessageSquareText className="h-5 w-5" />,
        description: "Ask about FX hedging, derivatives, and risks — with chat history and context.",
        img: shots[3],
        cta: "Try the assistant"
      }
    ],
    [shots]
  );

  const bullets = useMemo(
    () => [
      "Spot + rates stay synchronized across Strategy Builder, Pricers, and monitoring pages",
      "Multi-currency notionals and MTM, plus totals in a user-selected reference currency",
      "Clear hedging workflow: strategy → pricing → hedging instruments → monitoring",
      "User-friendly design focused on speed and clarity"
    ],
    []
  );

  const faqs = useMemo(
    () => [
      {
        q: "What can I do with FXHedge AI?",
        a: "Build FX option strategies, price instruments, track hedges, and monitor exposures and MTM — all in one consistent platform."
      },
      {
        q: "Do you support multi-currency reporting?",
        a: "Yes. Notionals and MTM are shown in their native currencies, with an optional reference currency for totals."
      },
      {
        q: "Is market data consistent across the app?",
        a: "Yes. The app synchronizes spot prices and rates so results stay aligned between modules."
      },
      {
        q: "Does the AI assistant change pricing or market data?",
        a: "No. The assistant is for guidance and explanations. Pricing and market data are handled by the platform logic."
      }
    ],
    []
  );

  return (
    <div className="landing-root min-h-screen bg-white text-black dark:bg-black dark:text-white">
      <LandingNav />

      {/* HERO */}
      <main className="pt-20">
        <section className="relative overflow-hidden">
          <div className="landing-bg-grid absolute inset-0" aria-hidden="true" />
          <div className="mx-auto max-w-7xl px-6 py-14 md:py-20">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="landing-badge">FX Risk Management Platform</Badge>
                  <span className="landing-pill">
                    <ShieldCheck className="h-4 w-4" />
                    Clean, consistent workflows
                  </span>
                </div>

                <h1 className="mt-6 text-balance text-4xl font-semibold leading-tight md:text-6xl">
                  Build, price, and monitor FX hedging —{" "}
                  <span className="landing-accent">in one place</span>.
                </h1>

                <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-black/70 dark:text-white/70 md:text-lg">
                  Designed for clarity and speed. Keep market data synchronized, generate pricing outputs, and track hedges
                  with multi-currency MTM.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link to="/login?mode=signup">
                    <Button size="lg" className="landing-btn-primary w-full sm:w-auto">
                      Get started
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link to="/login?mode=login">
                    <Button size="lg" variant="outline" className="landing-btn-secondary w-full sm:w-auto">
                      Sign in
                    </Button>
                  </Link>
                </div>

                <div className="mt-10 grid gap-3 sm:grid-cols-2">
                  {bullets.map((b) => (
                    <div key={b} className="flex items-start gap-2 text-sm text-black/70 dark:text-white/70">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-[var(--lime)]" />
                      <span>{b}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative">
                <div className="landing-glow absolute -inset-6" aria-hidden="true" />
                <div className="landing-shot-frame">
                  <Img src={shots[0].src} alt={shots[0].alt} className="h-auto w-full rounded-xl object-cover" />
                </div>
                <div className="pointer-events-none absolute -bottom-8 -right-6 hidden w-64 rotate-2 md:block">
                  <div className="landing-mini-shot">
                    <Img src={shots[1].src} alt={shots[1].alt} className="h-auto w-full rounded-2xl object-cover" />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-12 grid gap-4 md:grid-cols-4">
              {[
                { label: "Workflow", value: "Strategy → Hedge", icon: <Sparkles className="h-4 w-4" /> },
                { label: "Data", value: "Synced Spot & Rates", icon: <LineChart className="h-4 w-4" /> },
                { label: "Reporting", value: "MTM by Currency", icon: <BarChart3 className="h-4 w-4" /> },
                { label: "Assistant", value: "Forex Chat AI", icon: <MessageSquareText className="h-4 w-4" /> }
              ].map((k) => (
                <div key={k.label} className="landing-kpi">
                  <div className="flex items-center gap-2 text-xs font-medium text-black/60 dark:text-white/60">
                    <span className="text-[var(--lime)]">{k.icon}</span>
                    {k.label}
                  </div>
                  <div className="mt-1 text-lg font-semibold dark:text-white">{k.value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PRODUCT */}
        <section id="product" className="bg-white dark:bg-black">
          <div className="mx-auto max-w-7xl px-6 py-16 md:py-24">
            <ScrollReveal>
              <div className="max-w-2xl">
                <Badge className="landing-badge">Product</Badge>
                <h2 className="mt-4 text-3xl font-semibold md:text-4xl dark:text-white">Built to match real treasury workflows</h2>
                <p className="mt-3 text-black/70 dark:text-white/70">
                  Each module is designed to be user-friendly and consistent across the whole application.
                </p>
              </div>
            </ScrollReveal>

            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              {modules.map((m, idx) => (
                <ScrollReveal key={m.title} delay={idx * 80}>
                  <Card className="landing-card border-black/10">
                    <CardContent className="p-0">
                      <div className="grid md:grid-cols-5">
                        <div className="p-6 md:col-span-2">
                          <div className="flex items-center gap-2 text-sm font-semibold dark:text-white">
                            <span className="landing-icon">{m.icon}</span>
                            {m.title}
                          </div>
                          <p className="mt-3 text-sm leading-relaxed text-black/70 dark:text-white/70">{m.description}</p>
                          <div className="mt-5">
                            <Link to="/login?mode=signup">
                              <Button className="landing-btn-primary">
                                {m.cta}
                                <ArrowRight className="ml-2 h-4 w-4" />
                              </Button>
                            </Link>
                          </div>
                        </div>
                        <div className="md:col-span-3">
                          <div className="landing-card-media">
                            <Img src={m.img.src} alt={m.img.alt} className="h-full w-full object-cover" />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* WORKFLOW */}
        <section id="workflow" className="bg-black text-white">
          <div className="mx-auto max-w-7xl px-6 py-16 md:py-24">
            <ScrollReveal>
              <div className="max-w-2xl">
                <Badge className="landing-badge-invert">Workflow</Badge>
                <h2 className="mt-4 text-3xl font-semibold md:text-4xl text-white">A simple, consistent path</h2>
                <p className="mt-3 text-white/70 dark:text-white/70">
                  Build strategies, price precisely, then manage hedges and MTM — without losing consistency.
                </p>
              </div>
            </ScrollReveal>

            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {[
                { title: "Build", icon: <Layers className="h-5 w-5" />, desc: "Create strategies with clean inputs and dates." },
                { title: "Price", icon: <Calculator className="h-5 w-5" />, desc: "Run models and Greeks, validate, iterate." },
                { title: "Monitor", icon: <LineChart className="h-5 w-5" />, desc: "Track hedges and MTM by currency." }
              ].map((s, i) => (
                <ScrollReveal key={s.title} delay={i * 80}>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                    <div className="flex items-center gap-3">
                      <div className="landing-step-icon">{s.icon}</div>
                      <div className="text-lg font-semibold">{s.title}</div>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-white/70">{s.desc}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>

            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              <ScrollReveal direction="left">
                <div className="landing-shot-frame landing-shot-frame--dark">
                  <Img src={shots[4].src} alt={shots[4].alt} className="h-auto w-full rounded-xl object-cover" />
                </div>
              </ScrollReveal>
              <ScrollReveal direction="right">
                <div className="landing-shot-frame landing-shot-frame--dark">
                  <Img src={shots[2].src} alt={shots[2].alt} className="h-auto w-full rounded-xl object-cover" />
                </div>
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="bg-white dark:bg-black">
          <div className="mx-auto max-w-5xl px-6 py-16 md:py-24">
            <ScrollReveal>
              <div className="max-w-2xl">
                <Badge className="landing-badge">FAQ</Badge>
                <h2 className="mt-4 text-3xl font-semibold md:text-4xl dark:text-white">Questions, answered</h2>
                <p className="mt-3 text-black/70 dark:text-white/70">Everything you need to know before getting started.</p>
              </div>
            </ScrollReveal>

            <div className="mt-10 grid gap-4">
              {faqs.map((f, idx) => {
                const isOpen = activeFAQ === idx;
                return (
                  <button
                    key={f.q}
                    type="button"
                    className="landing-faq"
                    onClick={() => setActiveFAQ(isOpen ? null : idx)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-base font-semibold dark:text-white">{f.q}</div>
                        {isOpen && <div className="mt-2 text-sm leading-relaxed text-black/70 dark:text-white/70">{f.a}</div>}
                      </div>
                      <div className={`landing-faq-indicator ${isOpen ? "is-open" : ""}`} aria-hidden="true">
                        {isOpen ? "−" : "+"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA + FOOTER */}
        <section className="bg-black text-white">
          <div className="mx-auto max-w-7xl px-6 py-16">
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <ScrollReveal>
                <div>
                  <Badge className="landing-badge-invert">Get started</Badge>
                  <h2 className="mt-4 text-3xl font-semibold md:text-4xl text-white">Ready to simplify FX hedging?</h2>
                  <p className="mt-3 text-white/70">
                    Create an account to access Strategy Builder, Pricers, hedging instruments, monitoring dashboards, and Forex Chat AI.
                  </p>
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <Link to="/login?mode=signup">
                      <Button size="lg" className="landing-btn-primary w-full sm:w-auto">
                        Create account
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </Button>
                    </Link>
                    <Link to="/login?mode=login">
                      <Button size="lg" variant="outline" className="landing-btn-secondary w-full sm:w-auto text-white">
                        Sign in
                      </Button>
                    </Link>
                  </div>
                </div>
              </ScrollReveal>

              <ScrollReveal direction="right">
                <div className="landing-shot-frame landing-shot-frame--dark">
                  <Img src={shots[3].src} alt={shots[3].alt} className="h-auto w-full rounded-xl object-cover" />
                </div>
              </ScrollReveal>
            </div>

            <div className="mt-14 border-t border-white/10 pt-8 text-sm text-white/60">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <img src="/fx-hedging-logo.png" alt="FXHedge AI" className="h-7 w-7 rounded-md" />
                  <span>FXHedge AI — FX Risk Management Platform</span>
                </div>
                <div className="flex flex-wrap gap-4">
                  <a className="hover:text-white" href="#product">
                    Product
                  </a>
                  <a className="hover:text-white" href="#workflow">
                    Workflow
                  </a>
                  <a className="hover:text-white" href="#faq">
                    FAQ
                  </a>
                  <Link className="hover:text-white" to="/login?mode=login">
                    Sign in
                  </Link>
                </div>
              </div>
              <div className="mt-3">© {new Date().getFullYear()} FXHedge AI. All rights reserved.</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}


