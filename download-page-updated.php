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
// DOWNLOAD COUNTER INTEGRATION
// ===========================
// Get current download count for display
$current_download_count = get_download_count($post_id);

// ===========================
// TELEGRAM LINK (optional)
// ===========================
$telegram_X = 'https://t.me/tvappgrp'; // Still here as it's a static variable for output

// ===========================
// OUTPUT
// ===========================
get_header();
?>

<div class="download-page-container">
    <div class="download-info">
        <h1><?php echo esc_html(get_the_title($post)); ?></h1>
        
        <!-- Download Counter Display -->
        <div class="download-stats">
            <span class="download-count-label">Total Downloads:</span>
            <span class="download-count"><?php echo number_format($current_download_count); ?></span>
        </div>
        
        <!-- Download Button -->
        <div class="download-button-container">
            <a href="<?php echo esc_url($file_url); ?>" 
               class="download-button" 
               target="_blank" 
               rel="nofollow noopener">
                Download Now
            </a>
        </div>
        
        <!-- Additional Info -->
        <?php if (!empty($telegram_X)): ?>
        <div class="telegram-link">
            <a href="<?php echo esc_url($telegram_X); ?>" target="_blank" rel="nofollow noopener">
                Join our Telegram Group
            </a>
        </div>
        <?php endif; ?>
        
        <!-- Post Content (if any) -->
        <?php if (!empty($post->post_content)): ?>
        <div class="download-description">
            <?php echo wp_kses_post($post->post_content); ?>
        </div>
        <?php endif; ?>
    </div>
</div>

<style>
.download-page-container {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    text-align: center;
}

.download-info h1 {
    margin-bottom: 20px;
    color: #333;
}

.download-stats {
    background: #f8f9fa;
    padding: 15px;
    border-radius: 8px;
    margin: 20px 0;
    border-left: 4px solid #007cba;
}

.download-count-label {
    font-weight: bold;
    color: #666;
    margin-right: 10px;
}

.download-count {
    font-size: 1.2em;
    font-weight: bold;
    color: #007cba;
}

.download-button-container {
    margin: 30px 0;
}

.download-button {
    display: inline-block;
    background: #007cba;
    color: white;
    padding: 15px 30px;
    text-decoration: none;
    border-radius: 5px;
    font-size: 1.1em;
    font-weight: bold;
    transition: background-color 0.3s ease;
}

.download-button:hover {
    background: #005a87;
    color: white;
}

.telegram-link {
    margin-top: 20px;
}

.telegram-link a {
    color: #0088cc;
    text-decoration: none;
}

.telegram-link a:hover {
    text-decoration: underline;
}

.download-description {
    margin-top: 30px;
    text-align: left;
    background: #f8f9fa;
    padding: 20px;
    border-radius: 8px;
}
</style>

<script>
// Additional JavaScript for download counter integration
jQuery(document).ready(function($) {
    // Listen for download count updates
    $(document).on('downloadCountUpdated', function(event, newCount) {
        // You can add additional functionality here when count is updated
        console.log('Download count updated to:', newCount);
        
        // Optional: Show a subtle notification
        if (typeof newCount !== 'undefined') {
            // Update any other elements that might show the count
            $('.download-stats').addClass('count-updated');
            setTimeout(function() {
                $('.download-stats').removeClass('count-updated');
            }, 2000);
        }
    });
});
</script>

<style>
.download-stats.count-updated {
    background: #e8f5e8;
    border-left-color: #28a745;
    transition: all 0.3s ease;
}
</style>

<?php
get_footer();
?>