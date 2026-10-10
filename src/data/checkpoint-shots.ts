// Real Checkpoint screenshots, taken from the public demo tenant by
// scripts/capture-site-shots.mjs (which also writes the sizes file).
// `view` and `fw` open the demo on the same screen, so a visitor can
// check the picture against the product.
import sizes from './checkpoint-shot-sizes.json';

export interface CheckpointShot {
  file: string;
  view: string;
  fw?: string;
  alt: string;
  width: number;
  height: number;
}

const shot = (file: keyof typeof sizes, view: string, alt: string, fw?: string): CheckpointShot =>
  ({ file, view, fw, alt, ...sizes[file] });

export const SHOTS = {
  riskRegister: shot('risk-register', 'risks',
    'Checkpoint risk register: summary tiles for open, high and above-appetite risks, then each risk with its category, CIA impact, inherent and residual score, review date, treatment progress, owner and status'),
  soaIso27001: shot('soa-iso27001', 'soa',
    'Checkpoint Statement of Applicability for ISO 27001: each Annex A control with its scope, implementation status, the other frameworks it also satisfies, owner, assurance, verification date and evidence link', 'iso27001'),
  soaIso27701: shot('soa-iso27701', 'soa',
    'Checkpoint Statement of Applicability for ISO 27701: privacy controls with scope, status, cross-framework mappings, owner, assurance and evidence', 'iso27701'),
  soaIso42001: shot('soa-iso42001', 'soa',
    'Checkpoint Statement of Applicability for ISO 42001: AI management system controls with scope, status, cross-framework mappings, owner, assurance and evidence', 'iso42001'),
  soaEssential8: shot('soa-essential8', 'soa',
    'Checkpoint Essential Eight tracker: each mitigation strategy with its maturity level requirements (ML1, ML2) underneath, the status of each, owner, assurance and evidence', 'essential8'),
  soaNistCsf: shot('soa-nistcsf', 'soa',
    'Checkpoint NIST CSF 2.0 view: categories across Govern, Identify, Protect, Detect, Respond and Recover with status, cross-framework mappings, owner, assurance and evidence', 'nistcsf'),
  soaDispIrap: shot('soa-dispirap', 'soa',
    'Checkpoint DISP and IRAP view: ISM-aligned controls with scope, status, cross-framework mappings, owner, assurance and evidence', 'dispirap'),
  soaSoc2: shot('soa-soc2', 'soa',
    'Checkpoint SOC 2 view: Trust Services Criteria with scope, status, the ISO 27001 controls they map to, owner, assurance and evidence', 'soc2'),
  postureScan: shot('posture-scan', 'scan',
    'Checkpoint Microsoft 365 posture scan: an overall score, counts of checks needing attention, to review and clear, and the failing checks to fix first'),
};

export type ShotId = keyof typeof SHOTS;
