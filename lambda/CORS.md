# CORS on these Lambdas — read this before wiring up any browser-called endpoint

Every Lambda in this directory that a browser calls sets its own CORS
headers in code, correctly, on every return path.

**That does not mean CORS works.** The moment CORS is switched on at the
API Gateway level, the gateway owns CORS and *strips* whatever the
integration returned. The Lambda's headers never reach the browser. So
the source reads correct, review passes, and the browser is still
blocked.

## Why this is so easy to miss

The request **succeeds**. The Lambda runs, returns 200 and real data, the
gateway passes the body through — and the browser throws the whole
response away because one header is absent. Nothing is logged server
side that says so. CloudWatch shows a clean invocation. The only place
the failure exists is the browser console:

```
Origin https://www.compliance365.com.au is not allowed by
Access-Control-Allow-Origin. Status code: 200
```

`Status code: 200` is the tell. The call worked; the browser discarded it.

Three separate misconfigurations were found by hand in one session,
each a **different** missing field, and two on endpoints nobody knew
were broken:

| endpoint | what was wrong |
|---|---|
| threat intel | CORS enabled, `Allow-Origin` never populated |
| provision | origin and methods set, `Allow-Headers` left empty |
| marketplace | CORS never configured at all |

Reading the Lambda source would not have found any of them.

## The asymmetry that makes it worse

A **plain `GET` with no custom headers is a "simple request"** — the
browser sends it without a preflight, so `Allow-Headers` is never
consulted. The threat-intel feed is exactly that, and it works fine with
an empty `Allow-Headers`.

Every other endpoint here is a `POST` sending `Content-Type:
application/json`, which is **not** simple: the browser preflights, and
the preflight fails unless `Allow-Headers` lists every header the request
carries. Several also send `Authorization`.

So "the threat-intel feed loads, therefore CORS is configured" is a wrong
inference, and it is the inference that let two endpoints stay broken.

## What to set

In API Gateway → your API → **CORS** (HTTP API), or the resource →
**Actions → Enable CORS** (REST API). For a `POST` endpoint that sends a
bearer token:

```
Access-Control-Allow-Origin:  https://www.compliance365.com.au
Access-Control-Allow-Methods: OPTIONS, POST
Access-Control-Allow-Headers: authorization, content-type
Access-Control-Max-Age:       300
Access-Control-Allow-Credentials: No
```

Drop `authorization` for an endpoint that doesn't send a bearer token
(error reporting). Use `GET, OPTIONS` and no headers for a plain feed
(threat intel).

Notes that have each cost time at least once:

- **`Allow-Headers` is a separate field from `Allow-Origin`.** Setting the
  origin alone fixes nothing if the headers list is empty — and an
  origin of `*` already permits your site, so "the origin looks right"
  is not evidence the endpoint works.
- **On a REST API, save is not enough** — **Actions → Deploy API** to the
  stage, or the change never goes live. On an HTTP API with a `$default`
  stage it applies immediately.
- **`Max-Age: 0` is the console default** and means every single call
  pays a second round trip for the preflight. `300` is free latency.
- Adding values in the console sometimes needs Enter/Add per value. If a
  setting reads back unchanged afterwards, it did not save.

## Check it, don't assume it

```
npm run check:cors
```

`scripts/check-endpoint-cors.mjs` reads the URLs straight out of
`public/checkpoint/config.js`, sends each endpoint the exact preflight
the app really sends, and names the missing field. It only sends
`OPTIONS` — a metadata question — so it is safe against production and
cannot provision, sign, charge or mutate anything. Exit code is 1 on
failure, so it works as a deploy gate.

Run it after touching a gateway, and before any release that depends on
one. It is deliberately not part of `npm test`, which must stay offline
and deterministic.

To check a single endpoint by hand:

```
curl -sS -D - -o /dev/null -X OPTIONS \
  -H 'Origin: https://www.compliance365.com.au' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,authorization' \
  <endpoint-url> | grep -i access-control
```

A working endpoint returns all four `access-control-*` headers. A broken
one returns `204` and nothing else.
