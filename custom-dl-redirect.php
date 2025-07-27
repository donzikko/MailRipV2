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
// FAST REDIRECT (NO COUNTER UPDATE HERE)
// ===========================

// Since this is just a redirect, we don't update the counter here
// The counter will be updated on the actual download page (site.com/appname/download/)
// This keeps the redirect super fast and lightweight

// 🚀 Perform the final redirect immediately - no blocking operations!
wp_redirect($final_redirect_url);
exit;