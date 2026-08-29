# Deploy the Posture Scan AI Explainer Lambda

Same shape as `lambda/DEPLOY.md` (the chat widget) — a second, independent
Lambda function so the two features can be rate-limited, monitored, and
throttled separately.

## What you need
- Your Anthropic API key (same one used for the chat Lambda)
- Access to AWS Console

## Steps

### 1. Create the Lambda function
1. Go to AWS Console → Lambda → Create function
2. Name: `compliance365-posture-explain`
3. Runtime: **Node.js 20.x**
4. Click **Create function**

### 2. Upload the code
1. In the Lambda editor, click **Upload from** → **.zip file**
2. Zip `explain.js` and upload it, **or** paste the code directly into the inline editor
3. Rename the handler to `index.handler` (Lambda console → Runtime settings → Handler: `index.handler`)

### 3. Set the environment variable
1. Lambda → Configuration → Environment variables → Edit
2. Add: `ANTHROPIC_API_KEY` = `sk-ant-...`
   (Lambda environment variables are per-function — this needs to be set
   here even though the chat Lambda already has it.)

### 4. Add an API Gateway trigger
1. Lambda → Add trigger → API Gateway
2. Choose **HTTP API** (not REST API)
3. Security: **Open** (CORS is handled in the code)
4. Click Add

### 5. Raise the timeout — this one is not optional
1. Lambda → Configuration → General configuration → Edit
2. **Timeout: 30 sec**

AWS defaults every new function to **3 seconds**. This Lambda waits on
an Anthropic Messages API completion, which routinely takes five to
thirty seconds — so on the default it would fail essentially every
call, and fail *invisibly*: the function is killed mid-request with
`Task timed out after 3.00 seconds` and no application error, so
CloudWatch shows nothing that looks like a cause. "Explain this" in the
posture scan just silently does nothing.

Thirty seconds is chosen to sit above a slow completion while still
being well under API Gateway's own 29–30s ceiling, so the caller sees a
clean error rather than a hung request.

### 5. Enable CORS on the route
1. Go to API Gateway → your new API → Routes
2. Click the POST route → CORS
3. Allow origin: `https://www.compliance365.com.au`
4. Allow headers: `content-type`
5. Allow methods: `POST, OPTIONS`

### 6. Throttle the route
Same reasoning as the chat Lambda — the in-memory rate limiter in the code
resets on cold start and is per-container, so it's a speed bump, not real
protection.
1. API Gateway → Stages → your stage → Throttling
2. Set a sensible rate/burst (e.g. 2 rps / 5 burst — each call is one scan's
   worth of gap explanations, not a chat message, so this endpoint should
   see far fewer calls than the chat widget)
3. Add a CloudWatch billing/invocation alarm

### 7. Copy the endpoint URL
The URL looks like:
`https://xxxxxxxxxx.execute-api.ap-southeast-2.amazonaws.com/explain`

### 8. Update the frontend
In `src/pages/posture-scan/index.astro`, replace the `EXPLAIN_API_URL`
constant near the top of the inline `<script type="module">` block:

```js
const EXPLAIN_API_URL = "https://YOUR_ACTUAL_URL_HERE/explain";
```

Until this is set to a real deployed URL, the page detects the placeholder
and skips the network call, falling back to the static remediation copy
already built into each control — the page never looks broken.

### 9. Commit and push
The change will deploy via GitHub Actions automatically.

## Cost estimate
Each posture scan triggers **at most one** call to this Lambda (results are
cached in the visitor's session, so a page refresh never re-triggers it).
A typical gap list (5-15 findings) costs a fraction of a cent on Claude
Haiku. Lambda and API Gateway both have generous free tiers at this volume.
