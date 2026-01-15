import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BookOpen, TrendingUp, Calculator, Layers } from "lucide-react";

const METHODS_DOCUMENTATION = [
  {
    id: "standard",
    title: "Standard Methods",
    icon: Calculator,
    methods: [
      {
        name: "Simple/Linear",
        description: "Linear interpolation between data points",
        process: [
          "1. Sort all points (swaps and futures) by tenor",
          "2. Force swaps as exact calibration points",
          "3. Adjust futures between two swaps if necessary",
          "4. Calculate zero rates by linear interpolation between each pair of points",
          "5. Calculate DF(t) = exp(-r(t) × t) for each point",
        ],
        pros: ["Simple and fast", "No oscillation risk"],
        cons: ["Non-smooth curve", "Discontinuous forwards"],
        formula: "r(t) = r₁ + (r₂ - r₁) × (t - t₁) / (t₂ - t₁)",
      },
      {
        name: "Cubic Spline",
        description: "Natural cubic spline interpolation for a smooth curve",
        process: [
          "1. Prepare points (swaps priority, adjusted futures)",
          "2. Build a tridiagonal matrix for natural splines",
          "3. Solve the system to obtain coefficients for each segment",
          "4. Interpolate with C² continuity (continuous second derivatives)",
          "5. Calculate discount factors from smoothed rates",
        ],
        pros: ["Perfectly smooth curve", "Continuous derivatives"],
        cons: ["May oscillate at extremities", "Forwards sometimes non-monotone"],
        formula: "S(t) = aᵢ + bᵢ(t-tᵢ) + cᵢ(t-tᵢ)² + dᵢ(t-tᵢ)³",
      },
      {
        name: "Nelson-Siegel",
        description: "4-parameter parametric model capturing level, slope, curvature",
        process: [
          "1. Define NS function: r(t) = β₀ + β₁[(1-e^(-t/λ))/(t/λ)] + β₂[(1-e^(-t/λ))/(t/λ) - e^(-t/λ)]",
          "2. Optimize 4 parameters (β₀, β₁, β₂, λ) by weighted least squares",
          "3. Swaps receive higher weight in optimization",
          "4. Use gradient descent to minimize error",
          "5. Generate complete curve with optimal parameters",
        ],
        pros: ["Clear economic interpretation", "Always smooth curve", "Few parameters"],
        cons: ["Limited flexibility", "May poorly fit complex data"],
        formula: "r(τ) = β₀ + β₁(1-e^(-τ/λ))/(τ/λ) + β₂[(1-e^(-τ/λ))/(τ/λ) - e^(-τ/λ)]",
      },
    ],
  },
  {
    id: "bloomberg",
    title: "Bloomberg Method",
    icon: TrendingUp,
    methods: [
      {
        name: "Bloomberg (Log-Linear DF + Forward Smoothing)",
        description: "Professional approach: forces all swaps, uses futures as guides, smooths forwards",
        process: [
          "1. Initial bootstrap: calculate DFs from swaps (absolute priority)",
          "2. Interpolate log(DF) linearly between swap points",
          "3. Insert futures as intermediate guides",
          "4. Apply smoothing on implicit forward curve",
          "5. Monotonicity constraint: forwards ≥ 0 and controlled growth",
          "6. Recalculate final DFs consistent with smoothed forwards",
        ],
        pros: [
          "Recognized market standard",
          "Smooth and monotone forwards",
          "No arbitrage",
          "Curve stability",
        ],
        cons: ["Complex to implement", "May deviate slightly from futures"],
        formula: "log(DF(t)) = log(DF(t₁)) + [log(DF(t₂)) - log(DF(t₁))] × (t - t₁)/(t₂ - t₁)",
      },
    ],
  },
  {
    id: "quantlib",
    title: "QuantLib Methods",
    icon: Layers,
    methods: [
      {
        name: "QuantLib Log-Linear Discount",
        description: "PiecewiseLogLinearDiscount - Linear interpolation on log(DF)",
        process: [
          "1. Sequential bootstrap of discount factors from instruments",
          "2. Interpolate linearly on log(DF) between pillars",
          "3. Guarantees positive forwards (log-linearity → constant forward per segment)",
          "4. Fast and stable method",
        ],
        pros: ["Always positive forwards", "Simple and stable", "QuantLib standard"],
        cons: ["Step-wise forwards (non-smooth)"],
        formula: "log(DF(t)) linearly interpolated → f(t) = -∂log(DF)/∂t constant per segment",
      },
      {
        name: "QuantLib Monotonic Convex",
        description: "Hagan-West Monotonic Convex - Preserves forward monotonicity with convexity",
        process: [
          "1. Initial bootstrap with monotonicity constraints",
          "2. Apply Hagan-West algorithm to preserve convexity",
          "3. Iteratively adjust to avoid negative forwards",
          "4. Ensure consistency with all calibration instruments",
          "5. Produce monotone and convex forward curve",
        ],
        pros: [
          "Always monotone forwards",
          "No oscillations",
          "Robust to noisy data",
          "Professional standard",
        ],
        cons: ["Algorithmically complex", "Slower"],
        formula: "Constraints: f'(t) ≥ 0 (monotonicity) + Hagan-West convexity conditions",
      },
    ],
  },
];

const GENERAL_CONCEPTS = [
  {
    title: "Discount Factor (DF)",
    description: "Present value of €1 received at date t. DF(t) = exp(-r(t) × t) in continuous compounding.",
  },
  {
    title: "Zero Rate",
    description: "Actuarial rate for an investment from 0 to t. r(t) = -ln(DF(t))/t",
  },
  {
    title: "Forward Rate",
    description: "Implicit rate between two future dates. f(t₁,t₂) = [r(t₂)×t₂ - r(t₁)×t₁]/(t₂-t₁)",
  },
  {
    title: "Swaps vs Futures Priority",
    description: "Swaps are exact calibration points (forced). Futures serve as guides between swaps and are adjusted if inconsistent.",
  },
];

export function BootstrappingDocumentation() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Fundamental Concepts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {GENERAL_CONCEPTS.map((concept) => (
              <div key={concept.title} className="p-4 border rounded-lg bg-muted/30">
                <h4 className="font-semibold text-sm mb-2">{concept.title}</h4>
                <p className="text-sm text-muted-foreground">{concept.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {METHODS_DOCUMENTATION.map((category) => (
        <Card key={category.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <category.icon className="w-5 h-5" />
              {category.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple" className="space-y-2">
              {category.methods.map((method, idx) => (
                <AccordionItem key={idx} value={`${category.id}-${idx}`} className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{method.name}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-2">
                    <p className="text-muted-foreground">{method.description}</p>

                    <div>
                      <h5 className="text-sm font-semibold mb-2">Calculation Process:</h5>
                      <ol className="space-y-1">
                        {method.process.map((step, stepIdx) => (
                          <li key={stepIdx} className="text-sm text-muted-foreground pl-2">
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>

                    <div className="p-3 bg-muted/50 rounded-lg font-mono text-sm">
                      <span className="text-xs text-muted-foreground block mb-1">Key Formula:</span>
                      {method.formula}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h5 className="text-sm font-semibold text-green-600 mb-2">Pros</h5>
                        <ul className="space-y-1">
                          {method.pros.map((pro, i) => (
                            <li key={i} className="text-sm text-muted-foreground flex items-start gap-1">
                              <span className="text-green-500">✓</span> {pro}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h5 className="text-sm font-semibold text-orange-600 mb-2">Cons</h5>
                        <ul className="space-y-1">
                          {method.cons.map((con, i) => (
                            <li key={i} className="text-sm text-muted-foreground flex items-start gap-1">
                              <span className="text-orange-500">−</span> {con}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Best Practices</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 border-l-4 border-blue-500 bg-blue-500/10 rounded-r-lg">
            <h4 className="font-semibold mb-2">Golden Rule</h4>
            <p className="text-sm text-muted-foreground">
              Always force swaps as exact calibration points. Futures only serve 
              as guides between swaps and must be adjusted if their implied rates create 
              inconsistencies (negative forwards, oscillations).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <Badge variant="default" className="mb-2">Production</Badge>
              <p className="text-sm text-muted-foreground">
                Use Bloomberg or QuantLib Monotonic Convex for stable and professional curves.
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <Badge variant="secondary" className="mb-2">Analysis</Badge>
              <p className="text-sm text-muted-foreground">
                Nelson-Siegel for economic interpretation (level, slope, curvature).
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <Badge variant="outline" className="mb-2">Speed</Badge>
              <p className="text-sm text-muted-foreground">
                Log-Linear for fast calculations with guaranteed positive forwards.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

