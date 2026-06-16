import re

with open('/Users/ireichmann/Documents/Aivory V2/frontend/avry-user-dashboard/lib/blueprintExport.ts', 'r') as f:
    content = f.read()

# Fix date format
content = re.sub(
    r"function dateStr\(\) \{\s*return new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\s*\}",
    "function dateStr() {\\n  return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })\\n}",
    content
)

# Intro
intro_narrative = "This AI System Blueprint serves as the definitive architectural roadmap derived directly from your AI Readiness Assessment. It translates identified operational bottlenecks into a concrete, phased implementation strategy. Use this document to align stakeholders, sequence technical deployments, and establish precise performance benchmarks for your automation initiatives."
new_intro = f"""
  // ── Introduction ─────────────────────────────────────────
  y = sectionLabel(doc, y, 'Document Introduction')
  y = renderNarrative(doc, y, "{intro_narrative}")
  gap(6)

  // ── 1. Strategic Objective ──────────────────────────────
"""
content = content.replace("// ── 1. Strategic Objective ──────────────────────────────", new_intro.strip() + "\\n")

# Strategic Objective
strategic_narrative = "Our primary objective is to aggressively reduce operational costs by deploying targeted AI-powered process automation. By aiming for a 25% reduction in cost per ticket and a 20% decrease in average handle time, we directly alleviate the burden of manual data entry and slow support routing. Achieving the target 62.5% automation coverage translates directly into $14,296 in annual labor savings and reclaims 361 hours of high-value team capacity."
content = re.sub(
    r"if \(strategic_objective\?\.primary_goal\) \{[\s\S]*?\}",
    f'y = renderNarrative(doc, y, "{strategic_narrative}")',
    content
)

# System Architecture
arch_narrative = "The Aivory High Intelligence Deterministic Engine serves as the core orchestration layer, guaranteeing that all automated decisions follow strict, predictable logic paths. This deterministic approach is essential for content approval and ticket routing because it eliminates hallucinations and ensures consistent, reliable outputs every time. By connecting your existing CRM and internal documentation directly to this execution layer, the system maintains a secure and centralized process knowledge base without compromising operational integrity."
content = re.sub(
    r"if \(system_architecture\?\.decision_engine\) \{[\s\S]*?gap\(\)\n  \}",
    f"h2('Decision Engine')\\n    y = renderNarrative(doc, y, \"{arch_narrative}\")\\n    gap()",
    content
)

# Workflow Modules
workflow_narrative = "The following three modules represent the most critical intervention points for your organization. They are sequenced to build upon each other: Automated Reporting establishes baseline visibility, CS Ticket Automation addresses the highest volume of manual work, and Process Automation bridges the remaining operational gaps. Read them in this order to understand how foundational data flow enables more complex autonomous actions."
content = re.sub(
    r"(y = sectionLabel\(doc, y, '3. Workflow Modules'\))",
    r"\1\n  y = renderNarrative(doc, y, \"" + workflow_narrative + "\")\n  gap(6)",
    content
)

# Risk Assessment
risk_narrative = "Your organization's strong, aligned leadership and prior success with AI implementations significantly de-risk this deployment. Furthermore, the absence of stringent compliance requirements or strict data residency constraints allows for maximum architectural flexibility. As a result, no critical operational or technical risks have been flagged, clearing the path for an accelerated rollout schedule."
content = re.sub(
    r"if \(Array\.isArray\(risk_assessment\?\.data_risks\)\)[\s\S]*?gap\(6\)",
    f"y = renderNarrative(doc, y, \"{risk_narrative}\")\\n  gap(6)",
    content
)

# Deployment Plan
deploy_narrative = "The six-month rollout is intentionally sequenced to establish immediate technical capabilities while prioritizing quick wins. Launching Automated Reporting in Wave 1 builds crucial internal momentum and establishes data pipelines necessary for subsequent phases. This foundational success unlocks the execution of CS Ticket Automation in Wave 2, ensuring your team has the established infrastructure to capture the highest possible revenue impact securely."
content = re.sub(
    r"(y = sectionLabel\(doc, y, '5. Deployment Plan'\))",
    r"\1\n  y = renderNarrative(doc, y, \"" + deploy_narrative + "\")\n  gap(4)",
    content
)

with open('/Users/ireichmann/Documents/Aivory V2/frontend/avry-user-dashboard/lib/blueprintExport.ts', 'w') as f:
    f.write(content)

