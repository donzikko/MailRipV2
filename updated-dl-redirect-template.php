<?php
/*
Template Name: Custom DL Redirect (Optimized)
*/

// Block search engines from indexing this redirect page
header("X-Robots-Tag: noindex, nofollow", true);

// ===========================
// EARLY SECURITY CHECKS
// ===========================

// Bot blocking (moved to reusable function)
if (is_bot_request()) {
    wp_die('Page not found.', 'Page not found', ['response' => 404]);
}

// 🔐 Get post ID and download type ('dl1' or 'dl2') from rewrite rule query vars
$post_id = intval(get_query_var('post_id_from_url', 0));
$dl_type = get_query_var('dl_type', ''); // Will be 'dl1' or 'dl2'

// If post ID or download type is missing/invalid, show 404
if (empty($post_id) || empty($dl_type)) {
    wp_die('Page not found.', 'Page Not Found', ['response' => 404]);
}

// Fetch the actual download links from the post's meta fields
$dl_links_group = get_post_meta($post_id, 'dllink', true);
$redirect_url = '';

// Determine which link to use based on $dl_type
if ($dl_type === 'dl1' && !empty($dl_links_group['dl1link'])) {
    $redirect_url = $dl_links_group['dl1link'];
} elseif ($dl_type === 'dl2' && !empty($dl_links_group['dl2link'])) {
    $redirect_url = $dl_links_group['dl2link'];
}

// If no valid URL was found for the requested type, show 404
if (empty($redirect_url)) {
    wp_die('Download link not found or invalid.', 'Error', ['response' => 404]);
}

// ===========================
// SECURITY CHECK FOR DOWNLOAD URL
// ===========================

if (!is_allowed_url($redirect_url)) {
    wp_die('Download source not allowed.', 'Error', ['response' => 403]);
}

// The final URL to redirect to is simply the retrieved $redirect_url.
$final_redirect_url = $redirect_url;

// ===========================
// LOG ACTIVITY (Non-blocking)
// ===========================

// Log activity without blocking the redirect
if (function_exists('log_download_activity')) {
    log_download_activity($post_id, $final_redirect_url, $dl_type);
}

// ===========================
// BACKGROUND COUNTER UPDATE
// ===========================

// Instead of blocking the redirect with the counter update,
// we'll trigger it asynchronously after the redirect

// Option 1: Use WordPress HTTP API for async request (recommended)
if (function_exists('wp_remote_post')) {
    // Prepare the background request
    $background_data = array(
        'action' => 'update_download_counter',
        'post_id' => $post_id,
        'nonce' => wp_create_nonce('download_counter_nonce')
    );
    
    // Make async request (fire and forget)
    wp_remote_post(admin_url('admin-ajax.php'), array(
        'timeout' => 0.01, // Very short timeout to make it non-blocking
        'blocking' => false, // Don't wait for response
        'body' => $background_data,
        'user-agent' => 'WordPress-Background-Counter'
    ));
}

// Option 2: Alternative - Use cURL for completely async request
// This is a fallback if the above doesn't work
if (!function_exists('wp_remote_post') || defined('FORCE_CURL_COUNTER')) {
    $curl_data = http_build_query(array(
        'action' => 'update_download_counter',
        'post_id' => $post_id,
        'nonce' => wp_create_nonce('download_counter_nonce')
    ));
    
    $curl_command = "curl -X POST '" . admin_url('admin-ajax.php') . "' " .
                   "-d '" . $curl_data . "' " .
                   "-A 'WordPress-Background-Counter' " .
                   ">/dev/null 2>&1 &";
    
    // Execute in background (only on Unix-like systems)
    if (function_exists('exec') && !stripos(PHP_OS, 'WIN') === 0) {
        exec($curl_command);
    }
}

// ===========================
// OPTIONAL: DELAYED REDIRECT PAGE
// ===========================

// If you want to show a brief loading page before redirect (optional)
$show_loading_page = false; // Set to true if you want this feature

if ($show_loading_page) {
    ?>
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Redirecting...</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                text-align: center;
                padding: 50px;
                background: #f5f5f5;
            }
            .loading {
                display: inline-block;
                width: 40px;
                height: 40px;
                border: 4px solid #f3f3f3;
                border-top: 4px solid #3498db;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
        <script>
            // Update counter via AJAX while showing loading
            if (typeof jQuery !== 'undefined') {
                jQuery.ajax({
                    url: '<?php echo admin_url('admin-ajax.php'); ?>',
                    type: 'POST',
                    data: {
                        action: 'update_download_counter',
                        post_id: <?php echo $post_id; ?>,
                        nonce: '<?php echo wp_create_nonce('download_counter_nonce'); ?>'
                    },
                    timeout: 5000,
                    complete: function() {
                        // Redirect after counter update (or timeout)
                        window.location.href = '<?php echo esc_js($final_redirect_url); ?>';
                    }
                });
            } else {
                // Fallback redirect if jQuery is not available
                setTimeout(function() {
                    window.location.href = '<?php echo esc_js($final_redirect_url); ?>';
                }, 1000);
            }
        </script>
    </head>
    <body>
        <h2>Preparing your download...</h2>
        <div class="loading"></div>
        <p>You will be redirected automatically.</p>
        <p><a href="<?php echo esc_url($final_redirect_url); ?>">Click here if redirect doesn't work</a></p>
    </body>
    </html>
    <?php
    exit;
}

// ===========================
// IMMEDIATE REDIRECT (Default behavior)
// ===========================

// 🚀 Perform the final redirect immediately
// The counter update happens in the background
wp_redirect($final_redirect_url);
exit;