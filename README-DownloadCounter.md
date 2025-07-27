# WordPress Download Counter System

A robust download counter system that works seamlessly with Cloudflare cache and WP Rocket, updating the `total_download` post meta when users view download pages.

## Features

- ✅ Updates `total_download` post meta field
- ✅ Works with Cloudflare cache and WP Rocket
- ✅ AJAX-based counting (cache-friendly)
- ✅ Duplicate counting prevention (5-minute cooldown per IP)
- ✅ Bot detection and filtering
- ✅ Secure token validation
- ✅ Real-time counter display updates
- ✅ Cloudflare IP detection support
- ✅ Clean, modern UI

## Installation

### 1. Upload Files

Upload these files to your WordPress theme directory:

```
your-theme/
├── download-counter.php
├── js/download-counter.js
├── cache-compatibility.php
└── download-page-updated.php (replace your existing download page template)
```

### 2. Include in functions.php

Add this to your theme's `functions.php` file:

```php
// Include download counter system
require_once get_template_directory() . '/download-counter.php';
require_once get_template_directory() . '/cache-compatibility.php';
```

### 3. Create JavaScript Directory

Create a `js` folder in your theme directory and place `download-counter.js` inside it.

## Configuration

### Cloudflare Setup

Add these Page Rules in your Cloudflare dashboard:

1. **Rule 1:** `*yoursite.com/*token=*`
   - Cache Level: Bypass
   - Browser Cache TTL: Respect Existing Headers

2. **Rule 2:** `*yoursite.com/wp-admin/admin-ajax.php*`
   - Cache Level: Bypass

### WP Rocket Setup

In WP Rocket settings, add these exclusions:

**Never Cache URLs:**
```
/wp-admin/admin-ajax.php
(.*)token=(.*)
```

**Never Cache Cookies:**
```
download_counter_.*
```

### WordPress Configuration

No additional WordPress configuration is needed. The system automatically:
- Creates/updates the `total_download` post meta field
- Handles AJAX requests securely
- Prevents duplicate counting
- Integrates with your existing token validation

## Usage

### In Templates

Display the download count anywhere in your templates:

```php
// Get download count for current post
$count = get_download_count();
echo "Downloads: " . number_format($count);

// Get download count for specific post
$count = get_download_count($post_id);
echo "Downloads: " . number_format($count);
```

### In the Download Page

The updated download page template automatically:
- Displays the current download count
- Updates the count via AJAX when users view the page
- Shows visual feedback when the count is updated
- Maintains all your existing security and validation

## How It Works

1. **User visits download page** with valid token
2. **JavaScript triggers** after page load
3. **AJAX request** sent to update counter
4. **Server validates** token and post
5. **Checks for duplicates** using IP-based transients
6. **Updates** `total_download` post meta
7. **Returns new count** to display

## Security Features

- **Nonce verification** for all AJAX requests
- **Token validation** using your existing system
- **IP-based duplicate prevention** (5-minute cooldown)
- **Bot detection** integration
- **Sanitized inputs** and secure data handling

## Cache Compatibility

### Why AJAX?

Traditional server-side counting doesn't work with caching because:
- Cached pages don't execute PHP
- Same cached content served to all users
- No way to update database from cached pages

### Our Solution

- **AJAX requests** bypass cache systems
- **Client-side JavaScript** triggers after page load
- **Server-side validation** ensures security
- **Transient-based** duplicate prevention

## Troubleshooting

### Counter Not Updating

1. Check browser console for JavaScript errors
2. Verify AJAX endpoint is accessible: `/wp-admin/admin-ajax.php`
3. Ensure jQuery is loaded
4. Check if download page has valid token

### Cache Issues

1. Clear all caches (WP Rocket + Cloudflare)
2. Verify Page Rules in Cloudflare
3. Check WP Rocket exclusions
4. Test with cache disabled

### Debug Mode

Add `?debug_cache=1` to any download URL (admin only) to see cache status information.

## File Structure

```
download-counter-system/
├── download-counter.php          # Main counter class
├── download-counter.js           # AJAX functionality
├── cache-compatibility.php      # Cache system integration
├── download-page-updated.php     # Updated template
└── README-DownloadCounter.md     # This file
```

## Database Schema

The system uses the existing WordPress post meta table:

```sql
wp_postmeta
├── meta_key: 'total_download'
├── meta_value: [integer count]
└── post_id: [your download post ID]
```

## Customization

### Styling

Customize the download counter display by modifying the CSS in `download-page-updated.php`:

```css
.download-stats {
    background: #f8f9fa;
    padding: 15px;
    border-radius: 8px;
    border-left: 4px solid #007cba;
}
```

### JavaScript Events

Listen for counter updates in your own scripts:

```javascript
jQuery(document).on('downloadCountUpdated', function(event, newCount) {
    console.log('New download count:', newCount);
    // Your custom functionality here
});
```

### Cooldown Period

Change the duplicate prevention cooldown (default: 5 minutes):

```php
// In download-counter.php, line ~95
set_transient($transient_key, true, 300); // 300 = 5 minutes
```

## Support

For issues or questions:
1. Check browser console for JavaScript errors
2. Verify all files are uploaded correctly
3. Ensure cache exclusions are configured
4. Test with caching temporarily disabled

## Changelog

### Version 1.0.0
- Initial release
- AJAX-based counting system
- Cloudflare + WP Rocket compatibility
- Security features and validation
- Real-time counter updates