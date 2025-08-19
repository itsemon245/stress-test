# Quick Bunny.net CDN Setup Guide

## 1. Get Your Bunny.net Credentials

### From Storage Zone:

1. Go to **Bunny.net Dashboard** → **Storage** → Your zone
2. Click **FTP & HTTP API** tab
3. Copy the **ReadWrite Password** (this is your `BUNNY_STORAGE_PASSWORD`)
4. Note your **Storage Zone Name** and **Region**

### From API:

1. Go to **Account** → **API Keys**
2. Copy your **API Key** (this is your `BUNNY_API_KEY`)

## 2. Configure Environment Variables

Add to `/var/www/dev.artistly.ai/webroot/.env`:

```bash
# Replace with your actual values
ASSET_URL=https://cdn.artistly.ai
CDN_BASE_URL=https://cdn.artistly.ai/

BUNNY_STORAGE_ZONE=your-actual-storage-zone-name
BUNNY_STORAGE_PASSWORD=your-actual-readwrite-password
BUNNY_API_KEY=your-actual-api-key
BUNNY_STORAGE_REGION=ny  # or your actual region (ny, la, sg, de, etc.)
```

## 3. Deploy Script Configuration

Update these variables in `deploy-to-cdn.sh`:

```bash
BUNNY_STORAGE_ZONE="your-actual-storage-zone-name"
BUNNY_STORAGE_PASSWORD="your-actual-readwrite-password"
BUNNY_API_KEY="your-actual-api-key"
BUNNY_STORAGE_REGION="ny"  # or your actual region
```

## 4. Test Upload

```bash
# Test the API connection first
curl --request PUT \
     --url https://ny.bunnycdn.com/your-storage-zone/test.txt \
     --header 'AccessKey: your-storage-password' \
     --header 'Content-Type: application/octet-stream' \
     --header 'accept: application/json' \
     --data 'test content'

# Should return 201 Created
```

## 5. Deploy Assets

```bash
cd /var/www/dev.artistly.ai/webroot
./deploy-to-cdn.sh
```

## 6. Verify CDN is Working

```bash
# Test if assets are accessible
curl -I https://cdn.artistly.ai/build/manifest.json

# Load your app and check browser dev tools
# All asset URLs should now point to cdn.artistly.ai
```

## 7. Expected Load Testing Improvement

**Before CDN:**

- Asset bottleneck at ~250 concurrent connections
- Client canceled stream errors

**After CDN:**

- Should handle 800-1500+ concurrent connections
- No more asset serving load on main server
- Clean load testing results

## Troubleshooting

**Upload Errors:**

- Verify storage zone name is exact match from dashboard
- Check region is correct (ny, la, sg, de, sy, br)
- Verify ReadWrite password (not ReadOnly)

**CDN Access Errors:**

- Check DNS propagation for cdn.artistly.ai
- Verify pull zone configuration in Bunny.net dashboard
- Ensure custom hostname is properly configured
