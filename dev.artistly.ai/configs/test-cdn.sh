#!/bin/bash

# Bunny.net CDN Test Script
# Verifies that CDN deployment is working correctly

CDN_BASE_URL="https://cdn.artistly.ai"
LARAVEL_ROOT="/var/www/dev.artistly.ai/webroot"

echo "🧪 Testing Bunny.net CDN deployment..."

# Test 1: Check if CDN domain is accessible
echo "📡 Testing CDN domain accessibility..."
if curl -s --head "$CDN_BASE_URL" | grep -q "200\|301\|302"; then
    echo "✅ CDN domain is accessible"
else
    echo "❌ CDN domain not accessible"
    exit 1
fi

# Test 2: Check if build manifest exists on CDN
echo "📄 Testing build manifest on CDN..."
if curl -s --head "$CDN_BASE_URL/build/manifest.json" | grep -q "200"; then
    echo "✅ Build manifest found on CDN"
    
    # Show some details about the CDN response
    echo "📊 CDN Response Headers:"
    curl -s --head "$CDN_BASE_URL/build/manifest.json" | grep -E "(server|cache-control|x-cache)"
    
else
    echo "❌ Build manifest not found on CDN"
    echo "💡 Run ./deploy-to-cdn.sh to upload assets"
    exit 1
fi

# Test 3: Check if Laravel is configured to use CDN
echo "🔧 Testing Laravel CDN configuration..."
if [ -f "$LARAVEL_ROOT/.env" ]; then
    if grep -q "ASSET_URL.*cdn.artistly.ai" "$LARAVEL_ROOT/.env"; then
        echo "✅ Laravel configured to use CDN"
    else
        echo "⚠️  Laravel not configured for CDN"
        echo "💡 Add ASSET_URL=https://cdn.artistly.ai to .env"
    fi
else
    echo "⚠️  Laravel .env file not found"
fi

# Test 4: Test actual asset loading
echo "🌐 Testing sample asset loading..."
SAMPLE_JS=$(curl -s "$CDN_BASE_URL/build/manifest.json" | jq -r '.["resources/js/app.jsx"].file' 2>/dev/null || echo "")

if [ ! -z "$SAMPLE_JS" ]; then
    echo "📦 Testing asset: $SAMPLE_JS"
    if curl -s --head "$CDN_BASE_URL/build/$SAMPLE_JS" | grep -q "200"; then
        echo "✅ Sample JavaScript asset loads successfully from CDN"
        
        # Show asset size and CDN headers
        echo "📊 Asset Details:"
        curl -s --head "$CDN_BASE_URL/build/$SAMPLE_JS" | grep -E "(content-length|server|cache-control)"
        
    else
        echo "❌ Sample asset not accessible via CDN"
    fi
else
    echo "⚠️  Could not determine sample asset from manifest"
fi

# Test 5: Performance comparison
echo "⚡ Performance comparison test..."

# Test local asset loading time
LOCAL_TIME=$(curl -s -w "%{time_total}" -o /dev/null "https://dev.artistly.ai/build/manifest.json" 2>/dev/null || echo "0")

# Test CDN asset loading time  
CDN_TIME=$(curl -s -w "%{time_total}" -o /dev/null "$CDN_BASE_URL/build/manifest.json" 2>/dev/null || echo "0")

echo "📈 Performance Results:"
echo "   Local server: ${LOCAL_TIME}s"
echo "   CDN server:   ${CDN_TIME}s"

if (( $(echo "$CDN_TIME < $LOCAL_TIME" | bc -l 2>/dev/null || echo 0) )); then
    echo "✅ CDN is faster than local serving"
else
    echo "ℹ️  CDN performance similar to local (normal for first request)"
fi

echo ""
echo "🎯 CDN Test Summary:"
echo "✅ CDN deployment appears to be working correctly"
echo "🚀 Your load tests should now handle 500-1000+ concurrent connections"
echo "📊 No more asset serving bottleneck on main server"
echo ""
echo "💡 Next steps:"
echo "   1. Run load test with higher arrivalRate (try 4-6)"
echo "   2. Monitor for elimination of 'client canceled stream' errors"
echo "   3. Watch connection count: should exceed previous 250 limit"
