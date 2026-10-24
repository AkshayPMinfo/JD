<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/75e36b79-e134-4f41-ab00-246b362961a9

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## API tests

```bash
npm run test:api
```

Runs two suites, each against its own copy of the API on a free port (no build or running server needed):

- `tests/api/rules.test.ts`: resume upload and parsing, job description reading, tailoring, the skill checkbox step and the ATS check, in rules mode (no AI calls).
- `tests/api/fallback.test.ts`: the Gemini → Groq fallback, using a fake Groq server (no real keys, no cost).

Test resumes are generated in memory with made-up details. Checks marked **KNOWN** are gaps we already know about; they're reported but don't fail the run. Set `TEST_VERBOSE=1` to see the app's own logs.
