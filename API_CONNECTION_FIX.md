# API Connection Error - Fix Guide

## Problem Analysis

The "API connection failed" error occurs because the application requires a valid OpenAI API key to function properly. The application uses the OpenAI API for:
- Speech recognition processing
- AI-powered conversation analysis
- Question detection and answering

## Root Causes Identified

1. **Missing or Invalid API Key**: The `.env` file contains a placeholder API key (`your_openai_api_key_here`) instead of a real OpenAI API key
2. **Client-side Configuration**: The application also requires API key configuration in the browser's localStorage
3. **Server Configuration**: The server needs the API key in the environment variables

## Solutions

### Solution 1: Configure OpenAI API Key (Recommended)

#### Step 1: Get an OpenAI API Key
1. Visit https://platform.openai.com/account/api-keys
2. Sign in to your OpenAI account (create one if needed)
3. Click "Create new secret key"
4. Copy the API key (starts with `sk-`)

#### Step 2: Configure Server-side API Key
1. Edit the `.env` file in the project root
2. Replace `your_openai_api_key_here` with your actual API key:
   ```
   OPENAI_API_KEY=sk-your-actual-api-key-here
   ```

#### Step 3: Configure Client-side API Key
1. Open the application in your browser: http://localhost:3000
2. Click the "Settings" button (gear icon)
3. Enter your OpenAI API key in the "OpenAI API Key" field
4. Optionally set a conversation topic
5. Click "Save"

#### Step 4: Restart the Server
```bash
# Stop the current server (if running)
pkill -f "node server.js"

# Start the server again
npm start
```

### Solution 2: Alternative Client-side Only Configuration

If you prefer to use only client-side API calls (bypassing the server proxy):

1. The application can work with just the client-side API key configuration
2. Follow Step 3 from Solution 1 to configure the API key in the browser
3. The AI service will make direct calls to OpenAI's API from the browser

## Verification Steps

1. **Check Server Status**: Ensure the server is running at http://localhost:3000
2. **Test API Connection**: Open the application and click "Start" - it should test the API connection
3. **Check Browser Console**: Look for "API connection test successful" message
4. **Test Functionality**: Try using the speech recognition and AI features

## Common Issues and Troubleshooting

### Issue 1: "API key not configured" Error
- **Cause**: No API key set in localStorage
- **Fix**: Use the settings modal to configure your API key

### Issue 2: "Incorrect API key provided" Error
- **Cause**: Invalid or expired API key
- **Fix**: Verify your API key at https://platform.openai.com/account/api-keys

### Issue 3: "API status 401" Error
- **Cause**: Authentication failed
- **Fix**: Check if your API key is correct and has sufficient credits

### Issue 4: "API status 429" Error
- **Cause**: Rate limit exceeded
- **Fix**: Wait a moment and try again, or upgrade your OpenAI plan

### Issue 5: Network Connection Error
- **Cause**: Internet connectivity issues or firewall blocking
- **Fix**: Check internet connection and firewall settings

## Application Architecture

The application uses a dual approach for API calls:

1. **Server-side Proxy** (`/api/chat` endpoint):
   - Uses API key from `.env` file
   - Handles streaming responses
   - Provides additional security

2. **Client-side Direct Calls**:
   - Uses API key from localStorage
   - Direct browser-to-OpenAI communication
   - Used for connection testing and some operations

## Security Notes

- Never commit real API keys to version control
- Keep your API key secure and don't share it
- Consider using environment variables for production deployments
- Monitor your OpenAI API usage and billing

## Current Status

✅ Server is running successfully at http://localhost:3000
✅ Dependencies are installed
✅ Environment file is created
❌ API key needs to be configured with a real OpenAI API key

## Next Steps

1. Obtain a valid OpenAI API key
2. Configure it in both the `.env` file and the application settings
3. Test the connection by starting speech recognition
4. Monitor the console for successful API connection messages