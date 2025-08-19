# Bunny.net CDN Setup for Asset Serving

This setup will eliminate your asset serving bottleneck by serving all JavaScript/CSS files from Bunny.net CDN instead of your main server.

## 1. Bunny.net Configuration

### Step 1: Create Storage Zone

1. Go to **Bunny.net Dashboard** → **Storage**
2. Create new storage zone: `artistly-assets`
3. Choose region closest to your users (e.g., `ny` for US East)
4. Note the **Storage Zone Password** (you'll need this)

### Step 2: Create Pull Zone

1. Go to **Storage** → Your zone → **Pull Zones**
2. Create pull zone with hostname: `cdn.artistly.ai`
3. Set **Origin URL**: `https://dev.artistly.ai` (fallback for non-CDN assets)
4. Enable **Cache Everything** for maximum performance

### Step 3: Get API Credentials

1. Go to **Account** → **API**
2. Copy your **API Key**
3. Save both Storage Password and API Key securely

## 2. DNS Configuration

Add CNAME record in your DNS:

```
cdn.artistly.ai → your-pullzone.b-cdn.net
```

(Replace with actual pull zone hostname from Bunny.net)

## 3. SSL Certificate

Bunny.net handles SSL automatically for custom domains. Verify in dashboard that SSL is enabled for `cdn.artistly.ai`.

## 4. Server Configuration

### Install FTP Client (recommended method)

```bash
# On staging server
sudo apt-get update
sudo apt-get install lftp
```

### Update Environment Variables

Add to `/var/www/dev.artistly.ai/webroot/.env`:

```bash
# CDN Configuration
ASSET_URL=https://cdn.artistly.ai
CDN_BASE_URL=https://cdn.artistly.ai/

# Bunny.net Credentials (replace with your actual values)
BUNNY_STORAGE_ZONE=artistly-assets
BUNNY_STORAGE_PASSWORD=your_storage_zone_password
BUNNY_API_KEY=your_bunny_api_key
BUNNY_STORAGE_REGION=ny

VITE_CDN_ENABLED=true
```

### Copy Configuration Files

```bash
# On staging server
cd /var/www/dev.artistly.ai/webroot
cp path/to/vite.config.cdn.js ./
cp path/to/deploy-to-cdn.sh ./
chmod +x deploy-to-cdn.sh
```

### Update Nginx Configuration

Your nginx config is already updated to redirect `/build/assets/*` to CDN.

## 5. Deploy Assets to CDN

```bash
# On staging server
cd /var/www/dev.artistly.ai/webroot
./deploy-to-cdn.sh
```

## 6. Verify CDN Deployment

### Test CDN URLs

```bash
# Check if assets are accessible via CDN
curl -I https://cdn.artistly.ai/build/manifest.json

# Should return 200 OK
```

### Test Application

```bash
# Load your application and check browser dev tools
# All /build/assets/* URLs should now point to cdn.artistly.ai
```

## 7. Expected Performance Improvement

### Before CDN:

- Asset serving bottleneck at ~250 concurrent connections
- "Client canceled stream" errors for JS/CSS files
- High server load from static file serving

### After CDN:

- **No asset serving load** on main server
- **500-2000+ concurrent connection capacity**
- **No more asset timeout errors** during load testing
- **Server focuses** only on dynamic content + WebSocket proxy

## 8. Automated Deployment Workflow

### Option 1: Manual Deployment

```bash
# After any frontend changes
./deploy-to-cdn.sh
```

### Option 2: Automated via CI/CD

Add to your deployment pipeline:

```bash
# In your GitHub Actions, GitLab CI, etc.
- name: Deploy to CDN
  run: |
    cd /var/www/dev.artistly.ai/webroot
    ./deploy-to-cdn.sh
```

### Option 3: Laravel Deployment Hook

Add to your Laravel deployment script:

```bash
# After composer install and before cache clear
./deploy-to-cdn.sh
```

## 9. Load Testing with CDN

Once CDN is active, you should be able to test much higher loads:

```yaml
# In personal-designs.yml - much higher capacity expected
phases:
  - duration: 90
    arrivalRate: 3
    rampTo: 8
  - duration: 240
    arrivalRate: 8 # Should handle 1600+ WebSocket connections cleanly
```

## 10. Monitoring & Troubleshooting

### Check CDN Status

```bash
# Verify CDN is serving files
curl -I https://cdn.artistly.ai/build/assets/app-[hash].js

# Should show Bunny.net headers like:
# server: BunnyCDN-Edge
# cache-control: max-age=31536000
```

### Common Issues

- **404 errors**: Assets not uploaded properly → Re-run deployment script
- **CORS errors**: Configure CORS in Bunny.net pull zone settings
- **Cache issues**: Purge cache via API or dashboard after deployment

### Bunny.net Dashboard Monitoring

- Monitor bandwidth usage
- Check cache hit ratio (should be >95% after initial deployment)
- Monitor edge server performance
