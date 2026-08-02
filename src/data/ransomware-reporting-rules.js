/**
 * ransomware-reporting-rules.js
 * ===============================
 * Rule constants for the Ransomware Payment Reporting Checker
 * (/ransomware-payment-reporting-checker/).
 *
 * Scope: the *ransomware/cyber extortion payment* reporting obligation
 * introduced by the Cyber Security Act 2024 (Cth) and the Cyber Security
 * (Ransomware Payment Reporting) Rules 2025 — triggered by making (or
 * becoming aware of) a payment/benefit to an extorting party. This is a
 * SEPARATE obligation from the existing SOCI Act mandatory cyber security
 * INCIDENT reporting duty that critical infrastructure entities already
 * have (12hrs for a significant impact, 72hrs for a relevant impact) —
 * that duty applies regardless of any payment, and this tool does not
 * assess it. That distinction is surfaced in the tool's caveats.
 *
 * Sourced from (cross-checked across multiple corroborating summaries;
 * the Home Affairs/CISC PDFs themselves returned HTTP 403 to automated
 * fetch, so treat the dollar penalty figure and any other numbers here as
 * due for a compliance/legal re-check against the primary sources before
 * this page goes live, and periodically thereafter):
 *  - Cyber Security (Ransomware Payment Reporting) Rules 2025 (F2025L00278),
 *    Federal Register of Legislation: https://www.legislation.gov.au/F2025L00278/asmade/text
 *  - MinterEllison: https://www.minterellison.com/articles/mandatory-ransomware-payment-reporting-obligations-in-force
 *  - Gadens: https://www.gadens.com/legal-insights/new-mandatory-ransomware-payment-reporting-obligations-now-in-force/
 *  - Australian Industry Group: https://www.australianindustrygroup.com.au/news/blogs/2025/mandatory-ransomware-payment-reporting/
 *  - Bright Law: https://www.brightlaw.com.au/cyber-security-ransomware-payment-reporting-rules/
 *  - Home Affairs factsheet (referenced by multiple summaries; blocked on
 *    direct automated fetch): https://www.homeaffairs.gov.au/cyber-security-subsite/files/factsheet-ransomware-payment-reporting.pdf
 *
 * Last reviewed against sources: 2026-08-02. Obligation commenced
 * 30 May 2025; Home Affairs ran an "education-first" enforcement posture
 * from commencement to 31 December 2025 — full enforcement applies from
 * 1 January 2026, i.e. now.
 */

export const RULES = {
  turnoverThresholdAUD: 3_000_000,
  reportWindowHours: 72,
  penaltyUnits: 60,
  reportUrl: 'https://www.cyber.gov.au/report',
  ncscUrl: 'https://www.homeaffairs.gov.au/about-us/our-portfolios/cyber-security/incident-response/national-cyber-security-coordinator',
  sociInfoUrl: 'https://www.cisc.gov.au/',
  lastReviewed: '2026-08-02',
};

export const CRITICAL_INFRA_SECTORS = [
  'Communications', 'Data storage or processing', 'Defence industry',
  'Energy', 'Financial services & markets', 'Food & grocery',
  'Health care & medical', 'Higher education & research', 'Space technology',
  'Transport', 'Water & sewerage',
];
