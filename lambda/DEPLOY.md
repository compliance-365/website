# Deploy the AI Chat Lambda

## What you need
- Your Anthropic API key (you have this)
- Access to AWS Console

## Steps

### 1. Create the Lambda function
1. Go to AWS Console → Lambda → Create function
2. Name: `compliance365-chat`
3. Runtime: **Node.js 20.x**
4. Click **Create function**

### 2. Upload the code
1. In the Lambda editor, click **Upload from** → **.zip file**
2. Zip `chat.js` and upload it, **or** paste the code directly into the inline editor
3. Rename the handler to `index.handler` (Lambda console → Runtime settings → Handler: `index.handler`)

### 3. Set the environment variable
1. Lambda → Configuration → Environment variables → Edit
2. Add: `ANTHROPIC_API_KEY` = `sk-ant-...` (your key)

### 4. Add an API Gateway trigger
1. Lambda → Add trigger → API Gateway
2. Choose **HTTP API** (not REST API — it's simpler and cheaper)
3. Security: **Open** (CORS is handled in the code)
4. Click Add

### 5. Enable CORS on the route
1. Go to API Gateway → your new API → Routes
2. Click the POST route → CORS
3. Allow origin: `https://www.compliance365.com.au`
4. Allow headers: `content-type`
5. Allow methods: `POST, OPTIONS`

### 6. Copy the endpoint URL
The URL looks like:
`https://xxxxxxxxxx.execute-api.ap-southeast-2.amazonaws.com/chat`

### 7. Update the frontend
In `src/components/AIChat.astro`, replace the `CHAT_API` value in **two places**:
- The frontmatter constant (line ~3)
- The script constant (line ~180)

```js
var CHAT_API = 'https://YOUR_ACTUAL_URL_HERE/chat';
```

### 8. Commit and push
The change will deploy via GitHub Actions automatically.

## Cost estimate
- Claude Haiku: ~$0.001 per conversation (very cheap)
- Lambda: first 1M requests/month free
- API Gateway: first 1M requests/month free

A busy month with 500 chat conversations costs under $1.
