export const marketingNavigation = [
  { href: "/", label: "Home" },
  { href: "/amazon-launch", label: "Amazon Launch" },
  { href: "/channel-control", label: "Channel Control" },
  { href: "/services", label: "Services" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" }
] as const;

export const sitemapPaths = marketingNavigation.map((item) => item.href);
export const marketingRoutePaths = [...sitemapPaths, "/assessment", "/strategy", "/results"];

export const siteContent = {
  brand: {
    name: "Rykas Inc.",
    shortName: "Rykas",
    siteUrl: "https://example.com",
    email: "strategy@example.com",
    phone: "(555) 555-0140",
    location: "Remote-first, supporting consumer brands and commercial teams across North America",
    description:
      "Amazon launch, cleanup, and channel management partner for brands that want stronger execution and more control."
  },
  hero: {
    eyebrow: "Amazon Strategy For Brands",
    title: "Scale on Amazon Without Losing Control of Your Brand",
    description:
      "We help brands launch, clean up, and scale on Amazon with better execution and a more disciplined channel strategy.",
    primaryCta: { label: "Book a Strategy Call", href: "/contact#contact-form" },
    secondaryCta: { label: "Get an Amazon Channel Assessment", href: "/assessment" },
    proofPoints: [
      "Built for brands that want Amazon done right",
      "Launch, cleanup, advertising, listings, and channel control in one operating model",
      "Strategic enough for leadership, operational enough for day-to-day execution"
    ],
    metrics: [
      { label: "Brand entry points we support", value: "3" },
      { label: "Need for a large internal Amazon team", value: "Less" },
      { label: "Core objective", value: "Control" }
    ]
  },
  trustStrip: {
    label: "Built for brands that want Amazon done right",
    items: ["Consumer brands", "Manufacturers", "Shopify brands", "Retail-driven teams", "Channel leaders"]
  },
  marketRealityCards: [
    {
      title: "Amazon is too important to handle reactively",
      description:
        "For most consumer brands, Amazon is either already influencing the market or will soon become impossible to ignore."
    },
    {
      title: "Unstructured entry often creates channel problems later",
      description:
        "Brands that drift onto Amazon through uncontrolled third-party seller activity or inconsistent internal ownership usually lose pricing discipline and brand consistency."
    },
    {
      title: "The goal is growth with brand integrity",
      description:
        "Amazon should support the broader brand, not create price erosion, marketplace chaos, or channel conflict."
    }
  ],
  problems: [
    {
      title: "No clear Amazon strategy",
      description: "The channel is important, but no one owns the roadmap, standards, or day-to-day operating model."
    },
    {
      title: "Too many third-party sellers",
      description: "Multiple third-party sellers create pricing inconsistency, weak accountability, and poor brand presentation."
    },
    {
      title: "MAP violations and price erosion",
      description: "Discounting and undercutting start damaging both margin structure and brand perception."
    },
    {
      title: "Poor listings and weak content",
      description: "Product pages underperform because the catalog, creative, and conversion strategy are not being managed tightly."
    },
    {
      title: "Internal team overload",
      description: "Amazon becomes too operationally complex for a lean team already managing DTC, retail, and broader commercial priorities."
    },
    {
      title: "Retail and channel conflict",
      description: "A messy Amazon presence starts creating tension across retail relationships, pricing strategy, and broader channel plans."
    }
  ],
  solutionHighlights: [
    {
      title: "Amazon launch strategy",
      description: "Plan the channel properly before it becomes a patchwork of third-party sellers, weak listings, and reactive decisions."
    },
    {
      title: "Listings, catalog, and conversion",
      description: "Build stronger product pages, cleaner catalog structure, and a better conversion foundation."
    },
    {
      title: "Advertising and growth management",
      description: "Support sales growth with a disciplined ad strategy tied to real channel goals."
    },
    {
      title: "Cleanup and channel control",
      description: "Audit pricing, third-party seller activity, listings, and operational friction to regain structure."
    },
    {
      title: "Inventory and Amazon fulfillment coordination",
      description: "Align Amazon operations with inventory realities so the channel stays stable as demand grows."
    },
    {
      title: "Preferred partner model",
      description: "Operate as a brand-safe Amazon partner who can reduce internal burden while improving control."
    }
  ],
  lifecycleStages: [
    {
      id: "before-launch",
      title: "Before Launch",
      kicker: "Pre-launch stage",
      summary:
        "The brand is growing through DTC, retail, or other channels and needs a deliberate Amazon decision instead of accidental marketplace exposure.",
      signals: [
        "Strong traction outside Amazon",
        "No clear Amazon owner internally",
        "Concern about protecting pricing and retail relationships"
      ],
      opportunity:
        "We step in as the launch partner who can design the channel before it becomes messy.",
      outcome: "A cleaner, more controlled Amazon entry."
    },
    {
      id: "early-growth",
      title: "Early Growth",
      kicker: "Momentum stage",
      summary:
        "The brand has some Amazon presence, but listings, catalog structure, advertising, and inventory flow still need stronger operating discipline.",
      signals: ["Inconsistent listing quality", "Limited reporting visibility", "Unclear growth strategy"],
      opportunity:
        "We tighten execution early so the channel can grow without creating downstream control problems.",
      outcome: "Stronger performance with better structure."
    },
    {
      id: "channel-cleanup",
      title: "Channel Cleanup",
      kicker: "Chaos stage",
      summary:
        "Amazon starts filling with too many third-party sellers, pricing inconsistency, and uneven representation of the brand.",
      signals: ["Undercutting", "MAP pressure", "Multiple third-party sellers on core listings"],
      opportunity:
        "We diagnose third-party seller activity, pricing issues, and content gaps so the channel stops drifting.",
      outcome: "A marketplace that is easier to govern."
    },
    {
      id: "strategic-reset",
      title: "Strategic Reset",
      kicker: "Control stage",
      summary:
        "The brand is ready to rethink how Amazon is managed and whether a tighter partner model would create better outcomes.",
      signals: ["Need for a clearer operating model", "Desire to reduce marketplace sprawl", "Interest in a preferred partner approach"],
      opportunity:
        "We help design a more disciplined Amazon model focused on growth, control, and long-term brand health.",
      outcome: "An Amazon presence that supports the broader business."
    }
  ],
  services: [
    {
      slug: "amazon-channel-launch",
      name: "Amazon Channel Launch",
      audience: "Brands preparing to enter Amazon or formalize a small early presence",
      summary:
        "Launch planning, channel structure, marketplace setup, and operational guidance so Amazon starts with intention instead of randomness.",
      outcome: "A cleaner launch with better control from the start.",
      cta: "Plan your launch"
    },
    {
      slug: "amazon-listing-optimization",
      name: "Amazon Listing Optimization",
      audience: "Brands with catalog pages that need stronger conversion and presentation",
      summary:
        "Listing copy, image direction, content structure, and merchandising improvements designed to improve both clarity and conversion.",
      outcome: "Product pages that represent the brand better and sell more effectively.",
      cta: "Improve listings"
    },
    {
      slug: "brand-registry-catalog-support",
      name: "Brand Registry & Catalog Support",
      audience: "Brands that need better catalog control and marketplace structure",
      summary:
        "Support around catalog integrity, brand registry workflows, variation structure, and cleaner marketplace administration.",
      outcome: "Stronger control over how the brand appears and operates on Amazon.",
      cta: "Strengthen catalog control"
    },
    {
      slug: "amazon-advertising-management",
      name: "Amazon Advertising Management",
      audience: "Brands that need a more disciplined advertising approach",
      summary:
        "Advertising strategy and ongoing management aligned to product priorities, margin realities, and brand goals.",
      outcome: "A more accountable ad program tied to real channel growth.",
      cta: "Refine advertising"
    },
    {
      slug: "channel-cleanup-marketplace-control",
      name: "Channel Cleanup & Marketplace Control",
      audience: "Brands dealing with too many third-party sellers, pricing pressure, or marketplace disorder",
      summary:
        "An operational cleanup process focused on diagnosing third-party seller sprawl, pricing problems, listing inconsistency, and channel noise.",
      outcome: "A more orderly Amazon channel with clearer controls.",
      cta: "Clean up the channel"
    },
    {
      slug: "inventory-amazon-fulfillment-coordination",
      name: "Inventory & Amazon Fulfillment Coordination",
      audience: "Brands that need Amazon inventory handled more predictably",
      summary:
        "Operational support for inventory planning, replenishment rhythm, and Amazon fulfillment coordination so availability improves without unnecessary chaos.",
      outcome: "A steadier fulfillment foundation for Amazon growth.",
      cta: "Stabilize operations"
    },
    {
      slug: "ongoing-amazon-channel-management",
      name: "Ongoing Amazon Channel Management",
      audience: "Brands that want a reliable partner managing Amazon on an ongoing basis",
      summary:
        "A more complete operating layer across listings, ads, channel oversight, and marketplace execution.",
      outcome: "Less internal burden and a more consistent Amazon channel.",
      cta: "Discuss ongoing management"
    },
    {
      slug: "preferred-partner-strategy",
      name: "Preferred Partner Strategy",
      audience: "Brands ready to consider a tighter partner model for Amazon",
      summary:
        "A strategic path toward a more controlled partner relationship where Amazon is handled with clearer accountability and brand alignment.",
      outcome: "A stronger long-term operating model for Amazon.",
      cta: "Explore partnership options"
    }
  ],
  whyChooseUs: [
    {
      title: "Strategy plus execution",
      description: "Brands do not just need channel opinions. They need a partner who can help get the work done."
    },
    {
      title: "Brand-safe operating mindset",
      description: "The focus is not reckless growth. It is controlled growth that respects pricing, positioning, and channel integrity."
    },
    {
      title: "Less internal complexity",
      description: "Amazon can be handled well without forcing the brand to stand up a large internal marketplace team."
    },
    {
      title: "Calm, commercially credible partnership",
      description: "The tone is practical, low-hype, and built for real operating environments."
    }
  ],
  testimonials: [
    {
      quote:
        "Illustrative placeholder: we needed Amazon handled in a way that supported the broader brand, not just short-term marketplace sales.",
      author: "Brand Founder",
      role: "Illustrative placeholder testimonial"
    },
    {
      quote:
        "Illustrative placeholder: the biggest value was bringing structure to a channel that had become too operationally noisy for our internal team.",
      author: "Ecommerce Director",
      role: "Illustrative placeholder testimonial"
    },
    {
      quote:
        "Illustrative placeholder: the strategy felt brand-safe, commercially credible, and much more aligned with how we wanted Amazon represented.",
      author: "Consumer Products Executive",
      role: "Illustrative placeholder testimonial"
    }
  ],
  about: {
    principles: [
      "Understands both brand expectations and Amazon marketplace realities",
      "Focused on long-term channel health, not marketplace shortcuts",
      "Combines strategy, execution, and operational follow-through",
      "Helps brands grow without sacrificing control"
    ],
    story:
      "Rykas is positioned as a premium Amazon partner for brands that want the channel handled with more structure, stronger execution, and clearer accountability. The model is built for companies that need Amazon to perform without letting the channel create unnecessary internal complexity.",
    philosophy:
      "Amazon should support the broader brand. That means better listings, cleaner channel control, stronger operational discipline, and a channel approach leadership can trust."
  },
  contact: {
    headline: "Book a strategy call around launch, cleanup, or a stronger Amazon operating plan.",
    description:
      "Share a few details about the brand and where Amazon feels blocked. We use that context to focus the conversation quickly.",
    qualificationPrompts: [
      "Are you preparing to launch or already active on Amazon?",
      "Are multiple third-party sellers or pricing drift part of the problem?",
      "Is the need launch support, cleanup, or ongoing management?",
      "What would a healthier Amazon channel look like over the next year?"
    ],
    calendarNote:
      "Calendar embed placeholder: replace this panel with your Calendly, SavvyCal, or preferred scheduling embed once your booking link is ready."
  },
  assessment: {
    headline: "Get an Amazon Channel Assessment",
    description:
      "Share a few details about your brand and current Amazon situation. We use the intake to frame the right next conversation around launch, cleanup, or ongoing management.",
    reassurance: "Short intake. Clear next steps. Built for brands, not reseller training.",
    signals: ["Launch readiness", "Cleanup priorities", "Marketplace control", "Ongoing management fit"]
  },
  leadMagnet: {
    title: "Amazon Launch & Channel Control Brief",
    description:
      "A concise brief for brands that want a cleaner Amazon entry, a better operating model, or a path out of marketplace disorder.",
    bullets: [
      "What a clean Amazon launch should cover",
      "How uncontrolled marketplace growth usually starts",
      "Questions to ask before choosing an Amazon partner"
    ]
  },
  launchPage: {
    whyAmazon: [
      {
        title: "Amazon shapes the market whether you manage it or not",
        description: "Customers, retailers, and competitors are already using Amazon as a reference point for the brand."
      },
      {
        title: "A clean launch protects future options",
        description: "The earlier the structure is set, the easier it is to avoid pricing and channel issues later."
      },
      {
        title: "Brands should not let the channel develop through uncontrolled sellers",
        description: "Unmanaged entry often creates long-term operational noise that is harder to fix than to prevent."
      }
    ],
    mistakes: [
      "Letting Amazon emerge without a clear owner or channel plan",
      "Entering without clear listing standards or catalog structure",
      "Treating ads, inventory, and pricing as separate problems instead of one operating model",
      "Waiting too long to define who actually owns the channel"
    ],
    cleanLaunch: [
      "Clear channel goals and role definition",
      "Stronger listing and content foundation",
      "Brand-safe catalog and marketplace setup",
      "Advertising and inventory aligned to the launch plan",
      "A more controlled path for Amazon growth"
    ],
    process: [
      {
        title: "Assess the brand and channel context",
        description: "Understand where Amazon fits within DTC, retail, and broader brand strategy."
      },
      {
        title: "Design the launch model",
        description: "Set the listing, catalog, pricing, operational, and growth foundations before execution begins."
      },
      {
        title: "Build the marketplace presence",
        description: "Stand up the channel with stronger pages, cleaner structure, and a more deliberate operating cadence."
      },
      {
        title: "Manage the early growth phase",
        description: "Monitor performance, tighten execution, and prevent Amazon from drifting into avoidable chaos."
      }
    ]
  },
  cleanupPage: {
    painPoints: [
      "Too many third-party sellers and uneven pricing",
      "MAP violations and margin pressure",
      "Poor listing quality and weak content",
      "Underperforming advertising",
      "Retail conflict and internal frustration",
      "An Amazon channel that feels harder to control each month"
    ],
    approach: [
      {
        title: "Audit the current channel",
        description: "Review third-party seller activity, pricing behavior, listings, ads, and operational friction."
      },
      {
        title: "Identify what is driving disorder",
        description: "Separate the true control problems from surface-level symptoms so the response is more strategic."
      },
      {
        title: "Improve structure and representation",
        description: "Tighten listings, catalog hygiene, channel oversight, and marketplace standards."
      },
      {
        title: "Move toward a cleaner operating model",
        description: "Reduce chaos and create the conditions for a more accountable Amazon channel over time."
      }
    ],
    outcomes: [
      "Better visibility into third-party seller and pricing issues",
      "A cleaner Amazon presentation for the brand",
      "More structure around ads, listings, and operations",
      "A path toward a preferred or tighter partner model if appropriate"
    ]
  }
} as const;

export type LifecycleStage = (typeof siteContent.lifecycleStages)[number];
