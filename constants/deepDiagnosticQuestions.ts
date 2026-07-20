import { PhaseConfig } from '@/types/deepDiagnostic'

/**
 * Deep Diagnostic Phase Questions
 * Four sequential phases assessing business operations maturity — with AI
 * positioned as the execution layer, not the headline (ops-transformation
 * narrative, see docs/OPS-TRANSFORMATION-NARRATIVE-BRIEF.md).
 *
 * ⚠️ Question `id`s and OPTION STRINGS are load-bearing: the deterministic
 * scorer, risk classifier, and score-driver table in
 * services/deepDiagnostic.ts match on the literal option text, and stored
 * answers (localStorage resume + Postgres) contain the old strings. Reword
 * question/title/description/helperText/placeholder freely; never change
 * ids or option strings without a synchronized scorer change +
 * methodologyVersion bump.
 */
export const DEEP_DIAGNOSTIC_PHASES: PhaseConfig[] = [
  {
    id: 'business_objective_kpi',
    title: 'Business Objective & KPI',
    description: 'Define your business goals and how you measure success',
    questions: [
      {
        id: 'currency',
        question: 'Which currency do you want to use for cost and ROI estimates?',
        type: 'select',
        options: [
          'USD — US Dollar ($)',
          'EUR — Euro (€)',
          'GBP — British Pound (£)',
          'IDR — Indonesian Rupiah (Rp)',
          'SGD — Singapore Dollar (S$)',
          'MYR — Malaysian Ringgit (RM)',
          'AUD — Australian Dollar (A$)',
          'JPY — Japanese Yen (¥)',
          'INR — Indian Rupee (₹)',
          'Other'
        ],
        required: true
      },
      {
        id: 'industry',
        question: 'What industry does your company operate in?',
        type: 'select',
        options: [
          'Technology / Software',
          'E-commerce / Retail',
          'Financial Services / Fintech',
          'Healthcare / Medtech',
          'Manufacturing',
          'Food & Beverages',
          'Logistics / Supply Chain',
          'Education / Edtech',
          'Media / Entertainment',
          'Real Estate / Property',
          'Professional Services / Consulting',
          'Government / Public Sector',
          'Non-profit / NGO',
          'Other'
        ],
        required: true
      },
      {
        id: 'company_size',
        question: 'What is the size of your company?',
        type: 'radio',
        options: [
          'Solo / Freelancer (1 person)',
          'Micro (2–10 employees)',
          'Small (11–50 employees)',
          'Medium (51–250 employees)',
          'Large (251–1,000 employees)',
          'Enterprise (1,000+ employees)'
        ],
        required: true
      },
      {
        id: 'annual_revenue',
        question: 'What is your approximate annual revenue?',
        type: 'select',
        options: [
          'Pre-revenue / Startup',
          'Under $100k',
          '$100k – $500k',
          '$500k – $1M',
          '$1M – $5M',
          '$5M – $20M',
          '$20M – $100M',
          'Over $100M',
          'Prefer not to say'
        ],
        helperText: 'This helps calibrate ROI estimates to your scale',
        required: false
      },
      {
        id: 'primary_objective',
        question: 'What is the primary business outcome you want to improve?',
        type: 'textarea',
        placeholder: 'Describe your main goal (e.g., reduce operational costs, improve customer experience)',
        helperText: 'Be as specific as possible',
        required: true,
        validation: {
          minLength: 20,
          maxLength: 500
        }
      },
      {
        id: 'quantified_goal',
        question: 'Do you have a quantified target for this objective?',
        type: 'radio',
        options: [
          'Yes, with specific metrics (e.g., reduce costs by 20%)',
          'Yes, but not quantified (e.g., improve efficiency)',
          'No, still exploring'
        ],
        required: true
      },
      {
        id: 'target_metrics',
        question: 'If yes, what are your target metrics?',
        type: 'textarea',
        placeholder: 'e.g., Reduce processing time by 30%, Increase accuracy to 95%',
        helperText: 'Leave blank if not applicable',
        required: false
      },
      {
        id: 'kpi_tracking',
        question: 'How do you currently track these KPIs?',
        type: 'select',
        options: [
          'Automated dashboards',
          'Manual reports',
          'Spreadsheets',
          'Not currently tracked',
          'Other'
        ],
        required: true
      },
      {
        id: 'kpi_baseline',
        question: 'What are the current baseline values for your most important operational KPIs?',
        type: 'textarea',
        placeholder: 'e.g., Order cycle time ~3 days; error rate ~4%; ~1,200 invoices/month',
        helperText: 'Optional — lets the report anchor improvements against your real numbers (not scored)',
        required: false
      },
      {
        id: 'success_timeline',
        question: 'What is your expected timeline for achieving these goals?',
        type: 'select',
        options: [
          '1-3 months',
          '3-6 months',
          '6-12 months',
          '12+ months',
          'Flexible/Ongoing'
        ],
        required: true
      }
    ]
  },
  {
    id: 'data_process_readiness',
    title: 'Operations & Data Foundation',
    description: 'Assess how your core processes and data actually run today',
    questions: [
      {
        id: 'data_centralization',
        question: 'How centralized is your data?',
        type: 'radio',
        options: [
          'Fully centralized in a data warehouse/lake',
          'Partially centralized across some systems',
          'Siloed across departments',
          'No centralization'
        ],
        required: true
      },
      {
        id: 'data_quality',
        question: 'How would you rate your data quality?',
        type: 'radio',
        options: [
          'High quality, clean, and consistent',
          'Good quality with minor issues',
          'Moderate quality, needs cleanup',
          'Poor quality, significant issues'
        ],
        required: true
      },
      {
        id: 'process_documentation',
        question: 'What percentage of your key processes are documented?',
        type: 'select',
        options: [
          '0-25%',
          '25-50%',
          '50-75%',
          '75-100%'
        ],
        required: true
      },
      {
        id: 'workflow_standardization',
        question: 'How standardized are your workflows?',
        type: 'radio',
        options: [
          'Fully standardized with clear procedures',
          'Mostly standardized with some variations',
          'Some standardization, mostly ad-hoc',
          'Completely ad-hoc'
        ],
        required: true
      },
      {
        id: 'process_ownership',
        question: 'Who owns your core processes day-to-day?',
        type: 'radio',
        options: [
          'Clear owners with documented accountability',
          'Owners exist but accountability is informal',
          'Key processes depend on one or two specific people',
          'No clear ownership'
        ],
        helperText: 'Optional — person-dependency is a key operational risk signal (not scored)',
        required: false
      },
      {
        id: 'system_integration',
        question: 'What is your current level of system integration?',
        type: 'radio',
        options: [
          'Fully integrated with APIs and automation',
          'Some integration between key systems',
          'Disconnected systems with manual data transfer',
          'No integration'
        ],
        required: true
      },
      {
        id: 'automation_current',
        question: 'What percentage of your processes are currently automated?',
        type: 'select',
        options: [
          '0-10%',
          '10-25%',
          '25-50%',
          '50-75%',
          '75-100%'
        ],
        required: true
      },
      {
        id: 'manual_hours_weekly',
        question: 'Approximately how many manual hours per week does your team spend on repetitive tasks?',
        type: 'select',
        options: [
          'Under 10 hours/week',
          '10-25 hours/week',
          '25-50 hours/week',
          '50-100 hours/week',
          'Over 100 hours/week',
          'Not sure'
        ],
        helperText: 'Across all team members in scope — used to calculate ROI projections',
        required: false
      },
      {
        id: 'fte_count',
        question: 'How many full-time employees (FTEs) are in scope for automation?',
        type: 'select',
        options: [
          '1-5 FTEs',
          '6-15 FTEs',
          '16-50 FTEs',
          '51-200 FTEs',
          'Over 200 FTEs',
          'Not sure'
        ],
        helperText: 'Used to calibrate ROI and savings estimates',
        required: false
      },
      {
        id: 'data_infrastructure',
        question: 'What best describes your current data infrastructure?',
        type: 'radio',
        options: [
          'Spreadsheets / manual files',
          'Databases (SQL / NoSQL)',
          'Data warehouse or data lake',
          'Modern data platform (streaming, catalog, governance)'
        ],
        helperText: 'Higher-maturity data platforms shorten automation time-to-value',
        required: false
      }
    ]
  },
  {
    id: 'risk_constraints',
    title: 'Risk & Constraints',
    description: 'Identify potential risks and organizational constraints',
    questions: [
      {
        id: 'budget_allocated',
        question: 'Do you have a dedicated budget for operational improvement and automation?',
        type: 'radio',
        options: [
          'Yes, with specific allocation',
          'Yes, but flexible/exploratory',
          'No, but exploring options',
          'No budget currently'
        ],
        required: true
      },
      {
        id: 'budget_range',
        question: 'If yes, what is your budget range?',
        type: 'select',
        options: [
          'Under $10k',
          '$10k - $50k',
          '$50k - $100k',
          '$100k - $500k',
          'Over $500k',
          'Not applicable'
        ],
        required: false
      },
      {
        id: 'leadership_alignment',
        question: 'How aligned is your leadership on operational transformation?',
        type: 'radio',
        options: [
          'Fully aligned and championing',
          'Supportive but cautious',
          'Some interest, needs convincing',
          'No alignment or interest'
        ],
        required: true
      },
      {
        id: 'change_readiness',
        question: 'How ready is your organization for change?',
        type: 'radio',
        options: [
          'Embracing change actively',
          'Open to change with proper planning',
          'Cautious about change',
          'Resistant to change'
        ],
        required: true
      },
      {
        id: 'compliance_requirements',
        question: 'Do you have specific compliance or regulatory requirements?',
        type: 'multiselect',
        options: [
          'GDPR',
          'HIPAA',
          'SOC 2',
          'ISO 27001',
          'Industry-specific regulations',
          'None',
          'Other'
        ],
        helperText: 'Select all that apply',
        required: true
      },
      {
        id: 'risk_tolerance',
        question: 'What is your organization\'s risk tolerance for operational change and automation?',
        type: 'radio',
        options: [
          'High - willing to experiment and iterate',
          'Moderate - balanced approach',
          'Low - prefer proven solutions',
          'Very low - extremely cautious'
        ],
        required: true
      },
      {
        id: 'target_automation',
        question: 'What is your target automation level within 12 months?',
        type: 'select',
        options: [
          '10-25%',
          '25-50%',
          '50-75%',
          '75-90%',
          '90%+'
        ],
        helperText: 'Used to calculate projected ROI and savings',
        required: false
      },
      {
        id: 'data_residency',
        question: 'Do you have data residency or data sovereignty requirements?',
        type: 'radio',
        options: [
          'Yes — data must stay in-country',
          'Yes — specific cloud regions required',
          'No specific requirements',
          'Not sure'
        ],
        helperText: 'Affects which AI infrastructure options are available',
        required: false
      },
      {
        id: 'ai_governance',
        question: 'Do you have AI governance or an oversight process?',
        type: 'radio',
        options: [
          'No AI governance',
          'Informal / ad-hoc oversight',
          'Formal AI governance & oversight'
        ],
        helperText: 'Governance is a gating factor for enterprise AI adoption',
        required: false
      },
      {
        id: 'ai_data_privacy',
        question: 'How do you handle data privacy & security for AI systems?',
        type: 'radio',
        options: [
          'No formal data privacy policy',
          'Basic privacy policy',
          'Formal privacy policy with controls (DPIA, access controls, audit)'
        ],
        helperText: 'Privacy controls determine which data can be used for AI',
        required: false
      }
    ]
  },
  {
    id: 'ai_opportunity_mapping',
    title: 'Bottlenecks & Opportunities',
    description: 'Pinpoint what slows the business down and where to improve first',
    questions: [
      {
        id: 'pain_points',
        question: 'What are your top 3 operational pain points?',
        type: 'textarea',
        placeholder: 'List your biggest challenges (one per line)',
        helperText: 'Be specific about what causes delays, errors, or inefficiencies',
        required: true,
        validation: {
          minLength: 30,
          maxLength: 1000
        }
      },
      {
        id: 'manual_processes',
        question: 'Which processes consume the most manual effort?',
        type: 'textarea',
        placeholder: 'Describe time-consuming manual tasks',
        helperText: 'Include approximate time spent per week if known',
        required: true,
        validation: {
          minLength: 20,
          maxLength: 1000
        }
      },
      {
        id: 'pain_point_hours',
        question: 'Roughly how many hours per week go into each pain point above?',
        type: 'textarea',
        placeholder: 'e.g., Invoice entry ~10 hrs/week; chasing approvals ~5 hrs/week',
        helperText: 'Optional — sharpens the bottleneck cost estimates in your report (not scored)',
        required: false
      },
      {
        id: 'decision_speed',
        question: 'How fast can your organization make decisions on new initiatives?',
        type: 'radio',
        options: [
          'Hours to days',
          'Days to weeks',
          'Weeks to months',
          'Months or longer'
        ],
        required: true
      },
      {
        id: 'internal_capability',
        question: 'What is your internal technical capability for automation and AI?',
        type: 'radio',
        options: [
          'Strong AI team with experience',
          'Some AI knowledge, need guidance',
          'Limited technical skills',
          'No technical team'
        ],
        required: true
      },
      {
        id: 'preferred_approach',
        question: 'What is your preferred approach to implementing these improvements?',
        type: 'radio',
        options: [
          'Build in-house with internal team',
          'Partner with external experts',
          'Hybrid approach (internal + external)',
          'Not sure yet'
        ],
        required: true
      },
      {
        id: 'priority_areas',
        question: 'Which areas are highest priority for operational improvement?',
        type: 'multiselect',
        options: [
          'Customer service/support',
          'Sales and marketing',
          'Operations and logistics',
          'Finance and accounting',
          'HR and recruitment',
          'Product development',
          'Data analysis and reporting',
          'Other'
        ],
        helperText: 'Select all that apply',
        required: true
      },
      {
        id: 'prior_ai_attempts',
        question: 'Have you previously attempted AI or automation implementation?',
        type: 'radio',
        options: [
          'Yes — successful, currently in use',
          'Yes — partially successful, some still running',
          'Yes — unsuccessful or abandoned',
          'No — this is our first attempt',
          'Currently in pilot/evaluation'
        ],
        helperText: 'Prior experience helps calibrate implementation risk',
        required: false
      },
      {
        id: 'delay_consequence',
        question: 'What is the consequence of delaying these operational improvements by 6-12 months?',
        type: 'radio',
        options: [
          'Significant competitive disadvantage',
          'Continued operational inefficiency and cost',
          'Missed revenue or growth opportunity',
          'Minimal impact — timing is flexible',
          'Not sure'
        ],
        required: false
      }
    ]
  }
]
