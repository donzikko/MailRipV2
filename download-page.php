<?php
/*
Template Name: Download Page
Template Post Type: post, page, download
*/

// Security headers
header("X-Robots-Tag: noindex, nofollow", true);
nocache_headers(); // Prevent caching of this page

// ===========================
// EARLY SECURITY CHECKS
// ===========================

// Bot blocking (moved to reusable function)
if (is_bot_request()) {
    wp_die('Page not found.', 'Page not found', ['response' => 404]);
}

// ===========================
// POST LOOKUP
// ===========================

$slug = get_query_var('slug');
if (empty($slug)) {
    wp_die('Invalid request.', 'Error', ['response' => 404]);
}

// Efficient post lookup
$post = get_page_by_path($slug, OBJECT, ['post']);
if (!$post || $post->post_status !== 'publish') {
    // Proper 404 handling
    global $wp_query;
    $wp_query->set_404();
    status_header(404);
    include get_query_template('404');
    exit;
}

// Set up post data for template functions
setup_postdata($post);
$post_id = $post->ID;

// ===========================
// TOKEN VALIDATION
// ===========================

$token = sanitize_text_field($_GET['token'] ?? '');

// Validate token using function from functions.php
$validated_post_id = validate_token($token);
if (!$validated_post_id || $validated_post_id !== $post_id) {
    // Create clean return URL
    $clean_url = get_permalink($post);
    
    wp_die(
        'Page not found.',
        'Page Not Found',
        [
            'response'  => 404,
            'link_url'  => esc_url($clean_url),
            'link_text' => '← Return to post',
        ]
    );
}

// ===========================
// GET DOWNLOAD URL
// ===========================

// Get download link from meta field
$file_url_group = get_post_meta($post_id, 'dllink', true);
$file_url = '';

if (is_array($file_url_group) && !empty($file_url_group['dl1link'])) {
    $file_url = $file_url_group['dl1link'];
} elseif (is_string($file_url_group) && !empty($file_url_group)) {
    // Fallback if it's stored as a simple string
    $file_url = $file_url_group['dl2link'];
}

if (empty($file_url) || !filter_var($file_url, FILTER_VALIDATE_URL)) {
    wp_die('Download link not found or invalid.', 'Error', ['response' => 404]);
}

// ===========================
// SECURITY CHECK FOR DOWNLOAD URL
// ===========================

if (!is_allowed_url($file_url)) {
    wp_die('Download source not allowed.', 'Error', ['response' => 403]);
}

// ===========================
// LOG ACTIVITY
// ===========================

log_download_activity($post_id, $file_url, 'DIRECT');

// ===========================
// TELEGRAM LINK (optional)
// ===========================

$telegram_X = 'https://t.me/tvappgrp'; // Still here as it's a static variable for output

// ===========================
// OUTPUT
// ===========================

get_header();
?>

<script>
// Make post ID available to JavaScript for AJAX counter update
window.downloadPostId = <?php echo intval($post_id); ?>;
</script>

<body class="page-template-download-page" data-post-id="<?php echo intval($post_id); ?>">

<!-- Your existing download page content here -->
<div class="download-container">
    <h1><?php echo esc_html(get_the_title($post)); ?></h1>
    
    <!-- Optional: Display current download count -->
    <div class="download-stats">
        Downloads: <span class="download-counter"><?php echo intval(get_post_meta($post_id, 'total_download', true)); ?></span>
    </div>
    
    <div class="download-links">
        <a href="<?php echo esc_url($file_url); ?>" class="download-link btn btn-primary" target="_blank">
            Download Now
        </a>
    </div>
    
    <?php if (!empty($telegram_X)): ?>
    <div class="telegram-link">
        <a href="<?php echo esc_url($telegram_X); ?>" target="_blank">Join our Telegram</a>
    </div>
    <?php endif; ?>
</div>

<?php get_footer(); ?>