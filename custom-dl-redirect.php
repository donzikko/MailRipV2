<?php
/*
Template Name: Custom DL Redirect
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
// LOG ACTIVITY
// ===========================

log_download_activity($post_id, $final_redirect_url, $dl_type);

// ===========================
// OPTIMIZED COUNTER UPDATE
// ===========================

// Instead of blocking the redirect, schedule the counter update as a background task
// This approach is much faster and doesn't delay the user's download

// Option 1: Use WordPress cron (recommended for high traffic)
wp_schedule_single_event(time(), 'update_download_counter_background', array($post_id));

// Option 2: Alternative - Use async flag for immediate but non-blocking update
// update_download_counter_with_ip_check($post_id, true);

// Add the cron handler to functions.php if using Option 1
add_action('update_download_counter_background', function($post_id) {
    update_download_counter_with_ip_check($post_id);
});

// ===========================
// FAST REDIRECT
// ===========================

// 🚀 Perform the final redirect immediately - no more blocking!
wp_redirect($final_redirect_url);
exit;