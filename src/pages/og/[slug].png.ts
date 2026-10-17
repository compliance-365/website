import type { APIRoute, GetStaticPaths } from 'astro';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getPosts } from '../../lib/blog';

/* Brand fonts as static instances (satori cannot read woff2 or variable
   fonts): Bricolage Grotesque for the headline, Manrope for the rest.
   Both are SIL Open Font License; see src/fonts/OFL-*.txt. */
const DISPLAY_FONT = readFileSync(resolve('src/fonts/Bricolage-SemiBold.ttf'));
const BOLD_FONT = readFileSync(resolve('src/fonts/Manrope-Bold.ttf'));
const REG_FONT  = readFileSync(resolve('src/fonts/Manrope-Regular.ttf'));
// The mark on the dark card: cream ring, brand-orange dot, no tile.
const MARK_DATA = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path d="M176.2,56 A88,88 0 1,0 176.2,144" fill="none" stroke="#FAF7F1" stroke-width="18" stroke-linecap="round"/><circle cx="188" cy="100" r="15" fill="#BE4A1E"/></svg>').toString('base64');

const SERVICE_PAGES = [
  { slug: 'og-iso27001', eyebrow: 'ISO 27001 · AUSTRALIA',          title: 'ISO 27001 Certification',        description: 'Fixed-price, audit-ready in 10–14 weeks. Delivered inside Microsoft 365.' },
  { slug: 'og-iso27701', eyebrow: 'ISO 27701 · PRIVACY · AUSTRALIA', title: 'ISO 27701 Privacy (PIMS)',        description: 'Privacy information management to ISO 27701:2025. DPIAs, records of processing, rights handling.' },
  { slug: 'og-iso42001', eyebrow: 'ISO 42001 · AI GOVERNANCE',       title: 'ISO 42001 AI Governance',        description: 'AI Management System in 8–12 weeks. EU AI Act aligned. Microsoft 365 native.' },
  { slug: 'og-soc2',     eyebrow: 'SOC 2 · AUSTRALIA',               title: 'SOC 2 Type I & Type II',         description: 'Honest about timelines. Evidence-ready in 8–12 weeks inside Microsoft 365 and your cloud.' },
  { slug: 'og-e8',       eyebrow: 'ESSENTIAL EIGHT · AUSTRALIA',     title: 'Essential Eight ML2 Uplift',     description: 'Most M365 E5 organisations are closer to ML2 than they realise. Fixed-price, 12–16 weeks.' },
  { slug: 'og-disp',     eyebrow: 'DISP · ISM · IRAP · AUSTRALIA',   title: 'DISP / ISM / IRAP Advisory',     description: 'Defence security uplift, ISM alignment and IRAP readiness. Evidence-backed.' },
  { slug: 'og-is18',     eyebrow: 'IS18 · QGEA · QUEENSLAND',        title: 'IS18 Compliance (QGEA)',         description: 'ISO 27001-aligned ISMS + Essential Eight + the annual return — inside your own tenant.' },
  { slug: 'og-rffr',     eyebrow: 'RFFR · ISM SoA · DEWR',           title: 'Right Fit For Risk (RFFR)',      description: 'The full ISM Statement of Applicability on an ISO 27001 ISMS with Essential Eight — assessed from your tenant.' },
  { slug: 'og-nist',     eyebrow: 'NIST CSF 2.0 · AUSTRALIA',        title: 'NIST CSF 2.0 Consulting',        description: 'Current & Target Profiles, prioritised roadmap, measurable KPIs. Board-ready.' },
  { slug: 'og-home',     eyebrow: 'COMPLIANCE365 · AUSTRALIA',       title: 'Audit-ready, inside your own Microsoft 365.', accentFrom: 13, description: 'ISO 27001, SOC 2, Essential Eight, ISO 27701 and ISO 42001. Fixed-price.' },
  { slug: 'og-checkpoint', eyebrow: 'CHECKPOINT · COMPLIANCE CONSOLE', title: 'The compliance console that never leaves your tenant.', description: 'Posture scans, risk register, live SoA and audit reports, all in your own SharePoint.' },
  { slug: 'og-about',    eyebrow: 'ABOUT · COMPLIANCE365',           title: 'Australian Compliance Specialists', description: 'Senior-led. Fixed-price. Evidence-backed. Based in Brisbane, serving organisations nationally.' },
];

export const getStaticPaths: GetStaticPaths = async () => {
  const BLOG_PAGES = (await getPosts()).map((post) => ({
    slug: `og-blog-${post.id}`,
    eyebrow: post.data.tags.slice(0, 2).join(' · ').toUpperCase() || 'INSIGHTS · COMPLIANCE365',
    title: post.data.title,
    description: post.data.description,
  }));
  return [...SERVICE_PAGES, ...BLOG_PAGES].map(({ slug, ...props }) => ({ params: { slug }, props }));
};

function clamp(text: string, max: number) {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

// satori requires display:flex on every element with multiple children
const flex = (style: Record<string, unknown> = {}) => ({ display: 'flex', ...style });

export const GET: APIRoute = async ({ props }) => {
  const { eyebrow, title, description, accentFrom } = props as { eyebrow: string; title: string; description: string; accentFrom?: number };
  const t = clamp(title, 68);
  /* The headline: cream, with the part after accentFrom on its own line in
     pale orange (the brand's text orange on dark, as the "365" in the header). */
  const head = accentFrom && accentFrom < t.length
    ? [{ type: 'div', props: { children: t.slice(0, accentFrom).trim() } }, { type: 'div', props: { style: { color: '#F0A97F' }, children: t.slice(accentFrom).trim() } }]
    : t;
  const ring = (size: number, right: number, top: number, alpha: number) => ({ type: 'div', props: { style: { position: 'absolute', width: size, height: size, right, top, borderRadius: size, border: `1.5px solid rgba(240,169,127,${alpha})` } } });

  const node = {
    type: 'div',
    props: {
      style: flex({ position: 'relative', flexDirection: 'column', width: '100%', height: '100%', background: '#0B0B0C',
        backgroundImage: 'radial-gradient(circle at 92% 8%, rgba(190,74,30,0.42) 0%, rgba(190,74,30,0) 48%)', fontFamily: 'Manrope', color: '#FAF7F1' }),
      children: [
        ring(520, -170, -190, 0.26),
        ring(780, -300, -320, 0.12),
        {
          type: 'div',
          props: {
            style: flex({ flexDirection: 'column', flex: 1, padding: '56px 72px 52px', justifyContent: 'space-between' }),
            children: [
              // Mark + wordmark
              {
                type: 'div',
                props: {
                  style: flex({ alignItems: 'center', gap: 16 }),
                  children: [
                    { type: 'img', props: { src: MARK_DATA, width: 50, height: 50, style: { display: 'block' } } },
                    { type: 'div', props: { style: flex({ alignItems: 'baseline', fontSize: 27, letterSpacing: 4 }), children: [
                      { type: 'div', props: { style: { fontWeight: 400, color: '#FAF7F1' }, children: 'COMPLIANCE' } },
                      { type: 'div', props: { style: { fontWeight: 700, color: '#F0A97F', letterSpacing: 0, marginLeft: 4 }, children: '365' } },
                    ] } },
                  ],
                },
              },
              // Eyebrow, headline, description
              {
                type: 'div',
                props: {
                  style: flex({ flexDirection: 'column', gap: 22, maxWidth: 1000 }),
                  children: [
                    { type: 'div', props: { style: { fontSize: 21, color: '#F0A97F', fontWeight: 700, letterSpacing: 3 }, children: clamp(eyebrow, 60) } },
                    { type: 'div', props: { style: flex({ flexDirection: accentFrom ? 'column' : 'row', flexWrap: 'wrap', fontFamily: 'Bricolage', fontSize: 66, fontWeight: 600, lineHeight: 1.06, letterSpacing: -1 }), children: head } },
                    { type: 'div', props: { style: { fontSize: 28, color: 'rgba(250,247,241,0.78)', lineHeight: 1.4 }, children: clamp(description, 120) } },
                  ],
                },
              },
              // Rule + site
              {
                type: 'div',
                props: {
                  style: flex({ alignItems: 'center', justifyContent: 'space-between' }),
                  children: [
                    { type: 'div', props: { style: { width: 64, height: 4, borderRadius: 2, background: '#BE4A1E' } } },
                    { type: 'div', props: { style: { fontSize: 24, fontWeight: 700, color: 'rgba(250,247,241,0.8)' }, children: 'compliance365.com.au' } },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  };

  const svg = await satori(node, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Bricolage', data: DISPLAY_FONT, weight: 600, style: 'normal' },
      { name: 'Manrope', data: BOLD_FONT, weight: 700, style: 'normal' },
      { name: 'Manrope', data: REG_FONT,  weight: 400, style: 'normal' },
    ],
  });

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();

  return new Response(png, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
};
