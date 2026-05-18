import type { APIRoute, GetStaticPaths } from 'astro';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const BOLD_FONT = readFileSync(resolve('src/fonts/LiberationSans-Bold.ttf'));
const REG_FONT  = readFileSync(resolve('src/fonts/LiberationSans-Regular.ttf'));

const SERVICE_PAGES = [
  { slug: 'og-iso27001', eyebrow: 'ISO 27001 · AUSTRALIA',          title: 'ISO 27001 Certification',        description: 'Fixed-price, audit-ready in 10–14 weeks. Delivered inside Microsoft 365.' },
  { slug: 'og-iso27701', eyebrow: 'ISO 27701 · PRIVACY · AUSTRALIA', title: 'ISO 27701 Privacy (PIMS)',        description: 'Extend ISO 27001 with privacy controls in 6–10 weeks. DPIAs, ROPAs, rights handling.' },
  { slug: 'og-iso42001', eyebrow: 'ISO 42001 · AI GOVERNANCE',       title: 'ISO 42001 AI Governance',        description: 'AI Management System in 8–12 weeks. EU AI Act aligned. Microsoft 365 native.' },
  { slug: 'og-soc2',     eyebrow: 'SOC 2 · AUSTRALIA',               title: 'SOC 2 Type I & Type II',         description: 'Honest about timelines. Evidence-ready in 8–12 weeks inside Microsoft 365 and your cloud.' },
  { slug: 'og-e8',       eyebrow: 'ESSENTIAL EIGHT · AUSTRALIA',     title: 'Essential Eight ML2 Uplift',     description: 'Most M365 E5 organisations are closer to ML2 than they realise. Fixed-price, 12–16 weeks.' },
  { slug: 'og-disp',     eyebrow: 'DISP · ISM · IRAP · AUSTRALIA',   title: 'DISP / ISM / IRAP Advisory',     description: 'Defence security uplift, ISM alignment and IRAP readiness. Evidence-backed.' },
  { slug: 'og-nist',     eyebrow: 'NIST CSF 2.0 · AUSTRALIA',        title: 'NIST CSF 2.0 Consulting',        description: 'Current & Target Profiles, prioritised roadmap, measurable KPIs. Board-ready.' },
  { slug: 'og-home',     eyebrow: 'COMPLIANCE365 · AUSTRALIA',       title: 'Cyber, Privacy & AI Compliance', description: 'ISO 27001, SOC 2, Essential Eight and ISO 42001 inside your Microsoft 365. Fixed-price.' },
  { slug: 'og-about',    eyebrow: 'ABOUT · COMPLIANCE365',           title: 'Australian Compliance Specialists', description: 'Senior-led. Fixed-price. Evidence-backed. Based in Brisbane, serving organisations nationally.' },
];

const blogFiles = import.meta.glob('/src/content/blog/*.md', { eager: true }) as Record<string, { frontmatter: { title?: string; description?: string; tags?: string[] } }>;
const BLOG_PAGES = Object.entries(blogFiles).map(([path, mod]) => {
  const filename = path.split('/').pop()!.replace(/\.md$/, '');
  const tags = (mod.frontmatter?.tags ?? []).slice(0, 2).join(' · ').toUpperCase();
  return {
    slug: `og-blog-${filename}`,
    eyebrow: tags || 'INSIGHTS · COMPLIANCE365',
    title: mod.frontmatter?.title ?? 'Compliance365 Blog',
    description: mod.frontmatter?.description ?? 'Practical compliance insights for Australian organisations.',
  };
});

const ALL_PAGES = [...SERVICE_PAGES, ...BLOG_PAGES];

export const getStaticPaths: GetStaticPaths = () =>
  ALL_PAGES.map(({ slug, ...props }) => ({ params: { slug }, props }));

function clamp(text: string, max: number) {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

// satori requires display:flex on every element with multiple children
const flex = (style: Record<string, unknown> = {}) => ({ display: 'flex', ...style });

export const GET: APIRoute = async ({ props }) => {
  const { eyebrow, title, description } = props as { eyebrow: string; title: string; description: string };

  const node = {
    type: 'div',
    props: {
      style: flex({ flexDirection: 'column', width: '100%', height: '100%', background: '#ffffff', fontFamily: 'LiberationSans' }),
      children: [
        // Top blue bar
        { type: 'div', props: { style: { width: '100%', height: 12, background: '#1e40af' } } },

        // Main content
        {
          type: 'div',
          props: {
            style: flex({ flexDirection: 'column', flex: 1, padding: '52px 64px 44px', justifyContent: 'space-between' }),
            children: [
              // Eyebrow + title + description
              {
                type: 'div',
                props: {
                  style: flex({ flexDirection: 'column', gap: 20 }),
                  children: [
                    { type: 'div', props: { style: { fontSize: 20, color: '#1e40af', fontWeight: 700, letterSpacing: 2 }, children: clamp(eyebrow, 80) } },
                    { type: 'div', props: { style: { fontSize: 62, color: '#0f172a', fontWeight: 700, lineHeight: 1.1 }, children: clamp(title, 68) } },
                    { type: 'div', props: { style: { fontSize: 27, color: '#475569', lineHeight: 1.45 }, children: clamp(description, 130) } },
                  ],
                },
              },
              // Branding row
              {
                type: 'div',
                props: {
                  style: flex({ alignItems: 'center', justifyContent: 'space-between' }),
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: flex({ alignItems: 'center', gap: 14 }),
                        children: [
                          {
                            type: 'div',
                            props: {
                              style: flex({ width: 48, height: 48, borderRadius: 8, background: '#1e40af', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#ffffff', fontWeight: 700 }),
                              children: 'C',
                            },
                          },
                          { type: 'div', props: { style: { fontSize: 26, fontWeight: 700, color: '#0f172a' }, children: 'Compliance365' } },
                        ],
                      },
                    },
                    { type: 'div', props: { style: { fontSize: 20, color: '#94a3b8' }, children: 'compliance365.com.au' } },
                  ],
                },
              },
            ],
          },
        },

        // Bottom blue bar
        { type: 'div', props: { style: { width: '100%', height: 8, background: '#1e40af' } } },
      ],
    },
  };

  const svg = await satori(node, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'LiberationSans', data: BOLD_FONT, weight: 700, style: 'normal' },
      { name: 'LiberationSans', data: REG_FONT,  weight: 400, style: 'normal' },
    ],
  });

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();

  return new Response(png, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
};
