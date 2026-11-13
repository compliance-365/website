#!/usr/bin/env bash
# Checkpoint AWS collector: one-step set-up, for AWS CloudShell.
#
# Run it from the folder Checkpoint's download unzips to:
#
#   bash deploy.sh
#
# It creates, in this AWS account and region, everything the collector
# needs, and nothing else:
#
#   IAM role          checkpoint-aws-collector  (the read-only policy in
#                     iam-policy.json, CloudWatch logging, and read
#                     access to the one secret below)
#   Secret            checkpoint/aws-collector/client-secret
#   Lambda function   checkpoint-aws-collector
#   EventBridge rule  checkpoint-aws-collector-daily
#
# then runs the collector once and prints what it reported.
#
# Safe to run again: it updates what is already there. Set
# ROTATE_SECRET=1 to replace the stored client secret, and
# CHECKPOINT_YES=1 to skip the confirmation question.
#
# The client secret is typed here, read without echo, written to a
# private temporary file for the one AWS call that stores it, and never
# placed in the function's settings. Checkpoint never sees it.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
die() { echo "deploy.sh: $*" >&2; exit 1; }

[ -f "$here/checkpoint.env" ] || die "checkpoint.env is missing. Download the collector again from Checkpoint (Integrations, AWS)."
# shellcheck source=/dev/null
. "$here/checkpoint.env"
: "${TENANT_ID:?checkpoint.env has no TENANT_ID}"
: "${CLIENT_ID:?checkpoint.env has no CLIENT_ID. Enter the app registration client ID in Checkpoint and download again.}"
REGION="${REGION:-${AWS_REGION:-ap-southeast-2}}"
NAME="checkpoint-aws-collector"
SECRET_NAME="checkpoint/aws-collector/client-secret"
SCHEDULE="${SCHEDULE:-cron(0 17 * * ? *)}"
RUNTIME="${RUNTIME:-nodejs22.x}"

command -v aws >/dev/null || die "the AWS CLI is not installed. Run this in AWS CloudShell, where it is."
command -v python3 >/dev/null || die "python3 is needed to build the package. AWS CloudShell has it."

account="$(aws sts get-caller-identity --query Account --output text)" || die "not signed in to AWS."
partition="$(aws sts get-caller-identity --query Arn --output text | cut -d: -f2)"

site="${SP_HOSTNAME:-the root SharePoint site}${SP_SITE_PATH:-}"
cat <<SUMMARY

Checkpoint AWS collector
  AWS account      $account
  Region           $REGION
  Writes to        $site
  Entra tenant     $TENANT_ID
  App registration $CLIENT_ID
  Runs             daily, $SCHEDULE (UTC)

SUMMARY
if [ "${CHECKPOINT_YES:-}" != "1" ]; then
  read -rp "Create or update the collector in this account? [y/N] " ok
  case "$ok" in y|Y|yes|YES) ;; *) echo "Nothing changed."; exit 0 ;; esac
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
chmod 700 "$work"

echo "1/5  Client secret"
secret_arn="$(aws secretsmanager describe-secret --region "$REGION" --secret-id "$SECRET_NAME" --query ARN --output text 2>/dev/null || true)"
if [ -z "$secret_arn" ] || [ "$secret_arn" = "None" ] || [ "${ROTATE_SECRET:-}" = "1" ]; then
  read -rsp "     Paste the app registration's client secret (it is not shown): " sec; echo
  [ -n "$sec" ] || die "no secret entered."
  ( umask 077; printf '%s' "$sec" > "$work/secret" )
  unset sec
  if [ -n "$secret_arn" ] && [ "$secret_arn" != "None" ]; then
    aws secretsmanager put-secret-value --region "$REGION" --secret-id "$secret_arn" --secret-string "file://$work/secret" >/dev/null
    echo "     Replaced the stored secret."
  else
    secret_arn="$(aws secretsmanager create-secret --region "$REGION" --name "$SECRET_NAME" \
      --description "Checkpoint AWS collector: Entra app registration client secret" \
      --secret-string "file://$work/secret" --query ARN --output text)"
    echo "     Stored in Secrets Manager."
  fi
  rm -f "$work/secret"
else
  echo "     Using the secret already stored ($SECRET_NAME). ROTATE_SECRET=1 replaces it."
fi

echo "2/5  IAM role (read-only)"
cat > "$work/trust.json" <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON
if aws iam get-role --role-name "$NAME" >/dev/null 2>&1; then
  echo "     Role exists; refreshing its policies."
else
  aws iam create-role --role-name "$NAME" --assume-role-policy-document "file://$work/trust.json" \
    --description "Checkpoint AWS collector: read-only posture checks" >/dev/null
  echo "     Created."
fi
role_arn="$(aws iam get-role --role-name "$NAME" --query Role.Arn --output text)"
aws iam attach-role-policy --role-name "$NAME" --policy-arn "arn:$partition:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
aws iam put-role-policy --role-name "$NAME" --policy-name checkpoint-read-only --policy-document "file://$here/iam-policy.json"
SECRET_ARN="$secret_arn" python3 - > "$work/secret-policy.json" <<'PY'
import json, os
print(json.dumps({"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Action": "secretsmanager:GetSecretValue", "Resource": os.environ["SECRET_ARN"]}]}))
PY
aws iam put-role-policy --role-name "$NAME" --policy-name checkpoint-client-secret --policy-document "file://$work/secret-policy.json"

echo "3/5  Lambda function"
python3 - "$here/collector" "$work/function.zip" <<'PY'
import sys, zipfile, os
src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for name in ("index.mjs", "checks.mjs", "scan-merge.mjs"):
        z.write(os.path.join(src, name), name)
PY
export SP_HOSTNAME="${SP_HOSTNAME:-}" SP_SITE_PATH="${SP_SITE_PATH:-}" LIST_PREFIX="${LIST_PREFIX:-}" MAX_KEY_AGE_DAYS="${MAX_KEY_AGE_DAYS:-}"
TENANT_ID="$TENANT_ID" CLIENT_ID="$CLIENT_ID" SECRET_ARN="$secret_arn" python3 - > "$work/env.json" <<'PY'
import json, os
v = {"TENANT_ID": os.environ["TENANT_ID"], "CLIENT_ID": os.environ["CLIENT_ID"], "CLIENT_SECRET_ARN": os.environ["SECRET_ARN"]}
for k in ("SP_HOSTNAME", "SP_SITE_PATH", "LIST_PREFIX", "MAX_KEY_AGE_DAYS"):
    if os.environ.get(k):
        v[k] = os.environ[k]
print(json.dumps({"Variables": v}))
PY
if aws lambda get-function --region "$REGION" --function-name "$NAME" >/dev/null 2>&1; then
  aws lambda update-function-code --region "$REGION" --function-name "$NAME" --zip-file "fileb://$work/function.zip" >/dev/null
  aws lambda wait function-updated --region "$REGION" --function-name "$NAME"
  aws lambda update-function-configuration --region "$REGION" --function-name "$NAME" --role "$role_arn" \
    --runtime "$RUNTIME" --handler index.handler --timeout 120 --memory-size 256 --environment "file://$work/env.json" >/dev/null
  echo "     Updated."
else
  # A new role takes a few seconds to become usable by Lambda.
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if aws lambda create-function --region "$REGION" --function-name "$NAME" --role "$role_arn" \
        --runtime "$RUNTIME" --handler index.handler --timeout 120 --memory-size 256 \
        --zip-file "fileb://$work/function.zip" --environment "file://$work/env.json" \
        --description "Checkpoint: daily read-only AWS posture checks, written to this tenant's SharePoint" >/dev/null 2>"$work/err"; then
      break
    fi
    grep -q "cannot be assumed" "$work/err" || { cat "$work/err" >&2; die "could not create the function."; }
    [ "$attempt" = 10 ] && { cat "$work/err" >&2; die "the new role was not usable after a minute; run deploy.sh again."; }
    sleep 6
  done
  echo "     Created."
fi
aws lambda wait function-updated --region "$REGION" --function-name "$NAME"
fn_arn="$(aws lambda get-function --region "$REGION" --function-name "$NAME" --query Configuration.FunctionArn --output text)"

echo "4/5  Daily schedule"
rule_arn="$(aws events put-rule --region "$REGION" --name "$NAME-daily" --schedule-expression "$SCHEDULE" --state ENABLED \
  --description "Runs the Checkpoint AWS collector daily" --query RuleArn --output text)"
aws lambda add-permission --region "$REGION" --function-name "$NAME" --statement-id checkpoint-daily \
  --action lambda:InvokeFunction --principal events.amazonaws.com --source-arn "$rule_arn" >/dev/null 2>&1 || true
aws events put-targets --region "$REGION" --rule "$NAME-daily" --targets "Id=collector,Arn=$fn_arn" >/dev/null

echo "5/5  First run"
fn_error="$(aws lambda invoke --region "$REGION" --function-name "$NAME" --cli-read-timeout 180 \
  --query FunctionError --output text "$work/out.json")"
echo "     $(cat "$work/out.json")"
if [ -n "$fn_error" ] && [ "$fn_error" != "None" ]; then
  echo
  echo "The collector was set up but its first run failed. The message above says why; the full log is in"
  echo "CloudWatch, log group /aws/lambda/$NAME. Fix the cause and run deploy.sh again."
  exit 1
fi
echo
echo "Done. Checkpoint shows the AWS checks on the Posture scan screen, and the AWS card on Integrations reads"
echo "Reporting, after its next refresh."
