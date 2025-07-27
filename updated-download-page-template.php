<?php
/*
Template Name: Download Page (Optimized)
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
// LOG ACTIVITY (Non-blocking)
// ===========================

// Log activity without blocking the page load
if (function_exists('log_download_activity')) {
    log_download_activity($post_id, $file_url, 'DIRECT');
}

// ===========================
// TELEGRAM LINK (optional)
// ===========================

$telegram_X = 'https://t.me/tvappgrp'; // Still here as it's a static variable for output

// ===========================
// OUTPUT
// ===========================

get_header();

// NOTE: The download counter will be updated via AJAX after page load
// This prevents blocking the page rendering and improves user experience
?>

<div class="download-page-container">
    <div class="download-info">
        <h1><?php echo esc_html(get_the_title($post)); ?></h1>
        
        <!-- Optional: Display current download count -->
        <?php 
        $current_downloads = get_post_meta($post_id, 'total_download', true);
        if ($current_downloads): 
        ?>
        <div class="download-stats">
            <span class="download-counter-display">
                Downloads: <?php echo number_format(intval($current_downloads)); ?>
            </span>
        </div>
        <?php endif; ?>
        
        <!-- Download button/link -->
        <div class="download-action">
            <a href="<?php echo esc_url($file_url); ?>" 
               class="download-button" 
               target="_blank" 
               rel="noopener noreferrer">
                Download Now
            </a>
        </div>
        
        <!-- Optional: Telegram link -->
        <?php if (!empty($telegram_X)): ?>
        <div class="telegram-link">
            <a href="<?php echo esc_url($telegram_X); ?>" target="_blank" rel="noopener noreferrer">
                Join our Telegram Group
            </a>
        </div>
        <?php endif; ?>
    </div>
</div>

<script>
// Optional: Add some basic styling and functionality
document.addEventListener('DOMContentLoaded', function() {
    // Add click tracking for the download button
    const downloadButton = document.querySelector('.download-button');
    if (downloadButton) {
        downloadButton.addEventListener('click', function() {
            // You can add additional tracking here if needed
            console.log('Download initiated for post ID: <?php echo $post_id; ?>');
        });
    }
    
    // Listen for counter update events
    jQuery(document).on('downloadCounterUpdated', function(event, response) {
        console.log('Counter updated via AJAX:', response);
        
        // Update the display if element exists
        const counterDisplay = document.querySelector('.download-counter-display');
        if (counterDisplay && response.newCount) {
            counterDisplay.textContent = 'Downloads: ' + response.newCount.toLocaleString();
        }
    });
});
</script>

<?php
get_footer();
?>