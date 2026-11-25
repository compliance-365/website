#!/usr/bin/env python3
"""Add the ISM's PROTECTED baseline to the DISP/IRAP content pack.

Reads the ACSC's official OSCAL release of the Information Security
Manual (https://github.com/AustralianCyberSecurityCentre/ism-oscal) and
writes every control that applies at PROTECTED into
checkpoint-content/dispirap.json as `extra.ismControls`. Those rows are
not seeded into a client's register automatically: a DISP/IRAP client
adds them by switching on "Prepare for an IRAP assessment" (see
ensureDispIsm() in store.js), the same way NIST CSF subcategories work.

Each row is keyed DISP-ISM-<number> so it never collides with the RFFR
module's ISM-<number> rows. Codes are append-only (client records are
keyed to them): a control the ACSC withdraws is kept, marked withdrawn,
rather than dropped.

    python3 scripts/build_disp_ism.py <path-to-ism-oscal-checkout>
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else sys.exit("usage: build_disp_ism.py <ism-oscal checkout>")
PACK = os.path.join(ROOT, 'checkpoint-content', 'dispirap.json')

# Guideline -> category key. The same keys the RFFR pack uses, so the
# SoA's guideline filter pills and labels are shared (system access is
# new in the September 2026 ISM, so it has its own key).
GUIDELINE_CAT = {
    "Guidelines for cyber security roles": "roles",
    "Guidelines for cyber security incidents": "incidents",
    "Guidelines for procurement and outsourcing": "procurement",
    "Guidelines for cyber security documentation": "documentation",
    "Guidelines for physical security": "physical",
    "Guidelines for personnel security": "personnel",
    "Guidelines for communications infrastructure": "comms-infra",
    "Guidelines for communications systems": "comms-systems",
    "Guidelines for enterprise mobility": "mobility",
    "Guidelines for evaluated products": "evaluated",
    "Guidelines for information technology equipment": "it-equipment",
    "Guidelines for media": "media",
    "Guidelines for system hardening": "hardening",
    "Guidelines for system management": "sys-mgmt",
    "Guidelines for system access": "sys-access",
    "Guidelines for security assurance": "assurance",
    "Guidelines for software development": "software-dev",
    "Guidelines for database systems": "database",
    "Guidelines for email": "email",
    "Guidelines for networking": "networking",
    "Guidelines for cryptography": "cryptography",
    "Guidelines for gateways": "gateways",
    "Guidelines for data transfers": "data-transfers",
}


def props(x, name):
    return [p['value'] for p in x.get('props', []) if p['name'] == name]


cat = json.load(open(os.path.join(SRC, 'ISM_catalog.json')))['catalog']
version = cat['metadata']['version']
title = cat['metadata']['title']
rows = []


def walk(group, path):
    for c in group.get('controls', []):
        if c.get('class') != 'ISM-control':
            continue
        if 'P' not in props(c, 'applicability'):
            continue
        prose = next((p.get('prose', '') for p in c.get('parts', []) if p.get('name') == 'statement'), '').strip()
        num = c['id'].split('-')[1]
        g = path[0]
        if g not in GUIDELINE_CAT:
            sys.exit('unmapped guideline: ' + g)
        e8 = props(c, 'essential-eight-applicability')
        rows.append({
            'code': 'DISP-ISM-' + num, 'ism': 'ISM-' + num, 't': prose,
            'cat': GUIDELINE_CAT[g], 'sec': path[1] if len(path) > 1 else '', 'topic': path[2] if len(path) > 2 else '',
            'rev': props(c, 'revision')[0] if props(c, 'revision') else '', 'updated': props(c, 'updated')[0] if props(c, 'updated') else '',
            'e8': e8,
        })
    for s in group.get('groups', []):
        walk(s, path + [s.get('title')])


for g in cat['groups']:
    if g['title'].startswith('Guidelines for'):
        walk(g, [g['title']])

pack = json.load(open(PACK))
prev = {r['code']: r for r in (pack.get('extra') or {}).get('ismControls', [])}
now = {r['code'] for r in rows}
for code, r in prev.items():
    if code not in now:
        r = dict(r, withdrawn=True)
        rows.append(r)
rows.sort(key=lambda r: int(r['code'].rsplit('-', 1)[1]))

pack.setdefault('extra', {})['ismControls'] = rows
pack['extra']['ismVersion'] = version
pack['sourceRef'] = dict(pack.get('sourceRef') or {},
    ismSource='ACSC ' + title + ' ' + version + ' (OSCAL release, github.com/AustralianCyberSecurityCentre/ism-oscal), controls applicable at PROTECTED',
    ismAttribution='Information Security Manual © Commonwealth of Australia, licensed under CC BY 4.0')
with open(PACK, 'w') as f:
    json.dump(pack, f, indent=2, ensure_ascii=False)
    f.write('\n')
print(len(rows), 'ISM controls at PROTECTED, ISM', version)
