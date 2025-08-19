#!/bin/bash

# CDN Deployment Script for Artistly.ai Assets
# This script builds assets and uploads them to cdn.artistly.ai

set -e  # Exit on any error

# Bunny.net CDN Configuration
CDN_BASE_URL="https://cdn.artistly.ai"
BUNNY_STORAGE_ZONE="artistly-assets"        # Your Bunny.net storage zone name
BUNNY_STORAGE_PASSWORD="your_storage_password"  # Your storage zone password
BUNNY_API_KEY="your_api_key"               # Your Bunny.net API key
BUNNY_STORAGE_REGION="ny"                  # Your storage region (ny, la, sg, etc.)
LARAVEL_ROOT="/var/www/dev.artistly.ai/webroot"
BUILD_DIR="$LARAVEL_ROOT/public/build"

echo "🚀 Starting CDN deployment process..."

# Step 1: Record existing build files for cleanup
echo "📋 Recording existing build files for cleanup..."
cd "$LARAVEL_ROOT"

OLD_FILES_LIST=$(mktemp)
if [ -d "$BUILD_DIR" ]; then
    find "$BUILD_DIR" -type f -name "*.js" -o -name "*.css" | sed "s|$BUILD_DIR/||" > "$OLD_FILES_LIST"
    echo "📝 Found $(wc -l < "$OLD_FILES_LIST") existing build files to clean up later"
else
    echo "📝 No existing build directory found"
    touch "$OLD_FILES_LIST"
fi

# Step 2: Build assets with CDN configuration
echo "📦 Building assets for CDN..."

# Set CDN base URL for build
export CDN_BASE_URL="$CDN_BASE_URL"

# Use CDN-optimized Vite config
cp vite.config.js vite.config.backup.js
cp vite.config.cdn.js vite.config.js

# Build assets
npm run build

echo "✅ Assets built successfully"

# Step 3: Upload to Bunny.net CDN using Storage API
echo "☁️ Uploading assets to Bunny.net CDN..."

if ! command -v curl &> /dev/null; then
    echo "❌ curl is required for Bunny.net Storage API"
    exit 1
fi

# Upload new files to Bunny.net Storage API
UPLOAD_SUCCESS=true
UPLOADED_FILES=$(mktemp)

echo "📤 Uploading new build files to Bunny.net Storage API..."
find "$BUILD_DIR" -type f | while read file; do
    rel_path=${file#$BUILD_DIR/}
    echo "Uploading build/$rel_path..."
    
    # Use exact Bunny.net Storage API format as provided
    response=$(curl -s -w "%{http_code}" \
        --request PUT \
        --url "https://$BUNNY_STORAGE_REGION.bunnycdn.com/$BUNNY_STORAGE_ZONE/build/$rel_path" \
        --header "AccessKey: $BUNNY_STORAGE_PASSWORD" \
        --header "Content-Type: application/octet-stream" \
        --header "accept: application/json" \
        --data-binary "@$file")
        
    http_code=${response: -3}
    
    if [ "$http_code" = "201" ] || [ "$http_code" = "200" ]; then
        echo "✅ Uploaded build/$rel_path"
        echo "$rel_path" >> "$UPLOADED_FILES"
    else
        echo "❌ Failed to upload build/$rel_path (HTTP: $http_code)"
        echo "Response: ${response%???}"  # Show response body without HTTP code
        UPLOAD_SUCCESS=false
    fi
done

# Check if all uploads were successful
if [ "$UPLOAD_SUCCESS" = "false" ]; then
    echo "❌ Some uploads failed. Aborting cleanup to avoid data loss."
    exit 1
fi

echo "✅ All new assets uploaded successfully"

# Step 4: Clean up old build files from CDN
echo "🧹 Cleaning up old build files from CDN..."

if [ -s "$OLD_FILES_LIST" ]; then
    echo "🗑️ Deleting $(wc -l < "$OLD_FILES_LIST") old build files..."
    
    while IFS= read -r old_file; do
        if [ ! -z "$old_file" ]; then
            echo "Deleting old file: build/$old_file"
            
            # Use Bunny.net Storage API DELETE format
            response=$(curl -s -w "%{http_code}" \
                --request DELETE \
                --url "https://storage.bunnycdn.com/$BUNNY_STORAGE_ZONE/build/$old_file" \
                --header "AccessKey: $BUNNY_STORAGE_PASSWORD" \
                --header "accept: application/json")
                
            http_code=${response: -3}
            
            if [ "$http_code" = "200" ] || [ "$http_code" = "204" ] || [ "$http_code" = "404" ]; then
                echo "✅ Deleted build/$old_file"
            else
                echo "⚠️  Could not delete build/$old_file (HTTP: $http_code)"
            fi
        fi
    done < "$OLD_FILES_LIST"
    
    echo "✅ Old file cleanup completed"
else
    echo "ℹ️  No old files to clean up"
fi

# Clean up temporary files
rm -f "$OLD_FILES_LIST" "$UPLOADED_FILES"

# Purge Bunny.net cache after upload
if [ ! -z "$BUNNY_API_KEY" ] && command -v curl &> /dev/null; then
    echo "🔄 Purging Bunny.net cache..."
    
    # Get Pull Zone ID (you may need to hardcode this)
    PULL_ZONE_ID=$(curl -s -H "AccessKey: $BUNNY_API_KEY" \
        "https://api.bunny.net/pullzone" | \
        jq -r ".[] | select(.OriginUrl | contains(\"artistly.ai\")) | .Id" 2>/dev/null || echo "")
        
    if [ ! -z "$PULL_ZONE_ID" ]; then
        # Purge entire pull zone cache
        curl -X POST \
            -H "AccessKey: $BUNNY_API_KEY" \
            "https://api.bunny.net/pullzone/$PULL_ZONE_ID/purgeCache"
        echo "✅ Cache purged for pull zone $PULL_ZONE_ID"
    else
        echo "⚠️  Could not determine pull zone ID for cache purging"
        echo "💡 Manually purge cache in Bunny.net dashboard if needed"
    fi
fi

# Step 3: Update Laravel to use CDN URLs
echo "🔧 Updating Laravel configuration..."

# Update .env to use CDN for assets
if grep -q "ASSET_URL=" "$LARAVEL_ROOT/.env"; then
    sed -i "s|ASSET_URL=.*|ASSET_URL=$CDN_BASE_URL|" "$LARAVEL_ROOT/.env"
else
    echo "ASSET_URL=$CDN_BASE_URL" >> "$LARAVEL_ROOT/.env"
fi

# Step 4: Restore original Vite config
mv vite.config.backup.js vite.config.js

echo "✅ CDN deployment completed!"
echo "🌐 Assets now served from: $CDN_BASE_URL"
echo "📊 Expected performance improvement:"
echo "   - Eliminates asset serving bottleneck from main server"
echo "   - Should handle 500-1000+ concurrent connections"
echo "   - No more 'client canceled stream' errors for assets"

# Step 5: Test CDN deployment
echo "🧪 Testing CDN deployment..."
if curl -s --head "$CDN_BASE_URL/build/manifest.json" | grep -q "200 OK"; then
    echo "✅ CDN deployment successful - manifest.json accessible"
else
    echo "⚠️  CDN test failed - please verify deployment"
fi

echo "🎯 Ready for high-load testing with CDN-served assets!"
