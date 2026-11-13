// Guided AWS set-up (Integrations > AWS, 1.192.0).
//
// Checkpoint downloads the collector with checkpoint.env (this tenant's
// settings) and deploy.sh, which a client runs in AWS CloudShell. These
// tests pin the two things that matter most: nothing typed into
// Checkpoint can become a shell command through checkpoint.env, and the
// client secret never reaches a command line or the function's settings.
// The last test runs deploy.sh end to end against a fake AWS CLI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const L = createRequire(import.meta.url)('../public/checkpoint/lib.js');
const root = new URL('../public/checkpoint/', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const deploy = read('aws/deploy.sh');
const app = read('app.js');

const TENANT = '11111111-2222-3333-4444-555555555555';
const CLIENT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

test('checkpoint.env holds the settings, single-quoted, and nothing that could run', () => {
  const env = L.awsCollectorEnv({
    tenantId: TENANT, clientId: CLIENT, hostname: 'Contoso.SharePoint.com',
    sitePath: "/sites/grc';rm -rf ~;'$(id)", listPrefix: 'Acme `x` GRC', region: 'eu-west-2'
  });
  assert.match(env, new RegExp("^TENANT_ID='" + TENANT + "'$", 'm'));
  assert.match(env, new RegExp("^CLIENT_ID='" + CLIENT + "'$", 'm'));
  assert.match(env, /^SP_HOSTNAME='contoso\.sharepoint\.com'$/m);
  assert.match(env, /^SP_SITE_PATH='\/sites\/grcrm-rfid'$/m);
  assert.match(env, /^LIST_PREFIX='Acme x GRC'$/m);
  assert.match(env, /^REGION='eu-west-2'$/m);
  for (const line of env.split('\n').filter((l) => l && !l.startsWith('#'))) {
    assert.match(line, /^[A-Z_]+='[^'`$;\\]*'$/, line);
  }
  assert.doesNotMatch(env, /CLIENT_SECRET/);
});

test('an unknown region falls back to Sydney, and the default list prefix is left out', () => {
  const env = L.awsCollectorEnv({ tenantId: TENANT, clientId: CLIENT, region: 'mars-north-1', listPrefix: 'Checkpoint' });
  assert.match(env, /^REGION='ap-southeast-2'$/m);
  assert.match(env, /^LIST_PREFIX=''$/m);
  assert.equal(L.awsCloudShellUrl('nope'), 'https://ap-southeast-2.console.aws.amazon.com/cloudshell/home?region=ap-southeast-2');
});

test('deploy.sh passes the secret by file, never as an argument, and the function gets only its ARN', () => {
  assert.match(deploy, /read -rsp /, 'read without echo');
  const secretCalls = deploy.split('\n').filter((l) => /--secret-string/.test(l));
  assert.ok(secretCalls.length >= 2);
  for (const l of secretCalls) assert.match(l, /--secret-string "file:\/\/\$work\/secret"/, l);
  assert.match(deploy, /"CLIENT_SECRET_ARN": os\.environ\["SECRET_ARN"\]/);
  assert.doesNotMatch(deploy, /"CLIENT_SECRET":/);
  assert.match(deploy, /umask 077/);
});

test('deploy.sh asks before it changes anything', () => {
  const ask = deploy.indexOf('read -rp "Create or update');
  const firstWrite = deploy.search(/aws (secretsmanager create-secret|iam create-role|lambda create-function)/);
  assert.ok(ask > 0 && ask < firstWrite);
});

test('the collector reads the secret from Secrets Manager when given an ARN', () => {
  const idx = read('aws/collector/index.mjs');
  assert.match(idx, /process\.env\.CLIENT_SECRET_ARN/);
  assert.match(idx, /await import\('@aws-sdk\/client-secrets-manager'\)/, 'imported only when needed');
  assert.match(idx, /client_secret: await clientSecret\(\)/);
});

test('every file the download fetches exists', () => {
  const m = /downloadAwsCollector: async function[\s\S]*?var names = (\[[^\]]+\])/.exec(app);
  assert.ok(m);
  for (const n of JSON.parse(m[1].replace(/'/g, '"'))) assert.ok(existsSync(new URL('aws/' + n, root)), n);
});

test('deploy.sh is valid bash', () => {
  execFileSync('bash', ['-n', new URL('aws/deploy.sh', root).pathname]);
});

const FAKE_AWS = `#!/usr/bin/env bash
st="$FAKE_STATE"; printf '%s\\n' "aws $*" >> "$st/log"
case "$1 $2" in
  "sts get-caller-identity") [[ "$*" == *Arn* ]] && echo "arn:aws:iam::123456789012:user/me" || echo 123456789012;;
  "secretsmanager describe-secret") [ -f "$st/secret" ] && echo "arn:aws:secretsmanager:ap-southeast-2:123456789012:secret:cp-AbCd" || exit 254;;
  "secretsmanager create-secret") for a in "$@"; do [[ "$a" == file://* ]] && cp "\${a#file://}" "$st/secret"; done; echo "arn:aws:secretsmanager:ap-southeast-2:123456789012:secret:cp-AbCd";;
  "iam get-role") [ -f "$st/role" ] && echo "arn:aws:iam::123456789012:role/checkpoint-aws-collector" || exit 254;;
  "iam create-role") touch "$st/role";;
  "lambda get-function") [ -f "$st/fn" ] && echo "arn:aws:lambda:ap-southeast-2:123456789012:function:checkpoint-aws-collector" || exit 254;;
  "lambda create-function") n=$(( $(cat "$st/tries" 2>/dev/null || echo 0) + 1 )); echo $n > "$st/tries"
    if [ $n -lt 2 ]; then echo "The role defined for the function cannot be assumed by Lambda." >&2; exit 254; fi
    for a in "$@"; do [[ "$a" == file://*env.json ]] && cp "\${a#file://}" "$st/env.json"; [[ "$a" == fileb://* ]] && cp "\${a#fileb://}" "$st/fn.zip"; done; touch "$st/fn";;
  "events put-rule") echo "arn:aws:events:ap-southeast-2:123456789012:rule/checkpoint-aws-collector-daily";;
  "lambda invoke") echo '{"merged":true,"checks":10}' > "\${@: -1}"; echo None;;
  *) true;;
esac
`;

test('deploy.sh sets everything up against a fake AWS CLI, then updates it on a second run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cp-aws-'));
  const bin = join(dir, 'bin'), pkg = join(dir, 'pkg'), st = join(dir, 'state');
  for (const d of [bin, join(pkg, 'collector'), st]) mkdirSync(d, { recursive: true });
  writeFileSync(join(bin, 'aws'), FAKE_AWS); chmodSync(join(bin, 'aws'), 0o755);
  writeFileSync(join(pkg, 'deploy.sh'), deploy.replace('sleep 6', 'sleep 0'));
  for (const f of ['index.mjs', 'checks.mjs', 'scan-merge.mjs']) copyFileSync(new URL('aws/collector/' + f, root), join(pkg, 'collector', f));
  writeFileSync(join(pkg, 'checkpoint.env'), L.awsCollectorEnv({ tenantId: TENANT, clientId: CLIENT, hostname: 'contoso.sharepoint.com' }));
  writeFileSync(join(pkg, 'iam-policy.json'), '{}');
  const run = (input) => spawnSync('bash', [join(pkg, 'deploy.sh')], { input, encoding: 'utf8', env: { ...process.env, PATH: bin + ':' + process.env.PATH, FAKE_STATE: st } });

  const first = run('y\nvery-secret-value\n');
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /"checks":10/);
  assert.equal(readFileSync(join(st, 'secret'), 'utf8'), 'very-secret-value');
  assert.doesNotMatch(readFileSync(join(st, 'log'), 'utf8'), /very-secret-value/, 'never on a command line');
  const env = JSON.parse(readFileSync(join(st, 'env.json'), 'utf8')).Variables;
  assert.equal(env.TENANT_ID, TENANT);
  assert.equal(env.CLIENT_SECRET_ARN, 'arn:aws:secretsmanager:ap-southeast-2:123456789012:secret:cp-AbCd');
  assert.equal(env.CLIENT_SECRET, undefined);
  assert.equal(readFileSync(join(st, 'tries'), 'utf8').trim(), '2', 'retried while the new role propagated');

  const second = run('y\n');
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /Using the secret already stored/);
  assert.match(readFileSync(join(st, 'log'), 'utf8'), /lambda update-function-code/);

  const declined = run('n\n');
  assert.match(declined.stdout, /Nothing changed\./);
});
