# WebSocket Server Setup Instructions

## 1. DNS Configuration

Add DNS record for the WebSocket subdomain:

```bash
# Add A record in your DNS provider:
ws.artistly.ai → 216.18.195.195  # Same IP as dev.artistly.ai
```

## 2. SSL Certificate

Obtain SSL certificate for the WebSocket domain:

```bash
# On staging server
sudo certbot certonly --nginx -d ws.artistly.ai

# Or if you have wildcard cert:
# sudo certbot certonly --nginx -d *.artistly.ai
```

## 3. Enable WebSocket Server Configuration

```bash
# On staging server
sudo ln -sf /etc/nginx/sites-available/030_ws.artistly.ai.conf /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl reload nginx
```

## 4. Update Laravel Environment Variables

```bash
# In /var/www/dev.artistly.ai/webroot/.env
# Change:
VITE_REVERB_HOST="dev.artistly.ai"

# To:
VITE_REVERB_HOST="ws.artistly.ai"
```

## 5. Rebuild Frontend Assets

```bash
# On staging server, rebuild with new WebSocket host
cd /var/www/dev.artistly.ai/webroot
npm run build
```

## 6. Update Artillery Test Configuration

In your personal-designs.yml, you can now test higher loads:

```yaml
phases:
  # Higher arrival rates now possible with dedicated WebSocket server
  - duration: 60
    arrivalRate: 2
    rampTo: 4
  - duration: 180
    arrivalRate: 4 # Should handle 800+ WebSocket connections cleanly
```

## 7. Expected Performance Improvement

**Before (combined server):**

- Asset timeouts at 250+ connections
- Resource competition between WebSocket and static files

**After (separated servers):**

- WebSocket capacity: 500-1000+ connections
- No more asset cancellation errors
- Independent scaling of both services

## 8. Monitoring

```bash
# Monitor WebSocket connections on dedicated server
watch -n 2 'ss -an | grep :7001 | wc -l'

# Check WebSocket server status
curl https://ws.artistly.ai/health
```
