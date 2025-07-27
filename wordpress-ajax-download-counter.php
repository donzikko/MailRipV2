<?php
/**
 * Optimized AJAX Download Counter System
 * Add this to your child theme's functions.php
 */

// ===========================
// AJAX HANDLERS
// ===========================

// Handle AJAX request for logged-in users
add_action('wp_ajax_update_download_counter', 'ajax_update_download_counter');
// Handle AJAX request for non-logged-in users
add_action('wp_ajax_nopriv_update_download_counter', 'ajax_update_download_counter');

/**
 * AJAX handler for updating download counter
 */
function ajax_update_download_counter() {
    // Verify nonce for security
    if (!wp_verify_nonce($_POST['nonce'] ?? '', 'download_counter_nonce')) {
        wp_die(json_encode(['success' => false, 'message' => 'Security check failed']));
    }
    
    $post_id = intval($_POST['post_id'] ?? 0);
    
    if (!$post_id) {
        wp_die(json_encode(['success' => false, 'message' => 'Invalid post ID']));
    }
    
    // Use the optimized counter function
    $result = update_download_counter_with_ip_check_optimized($post_id);
    
    wp_die(json_encode([
        'success' => true,
        'updated' => $result,
        'message' => $result ? 'Counter updated' : 'Duplicate prevented'
    ]));
}

/**
 * Optimized download counter function with better performance
 */
function update_download_counter_with_ip_check_optimized($post_id) {
    if (!$post_id) return false;
    
    // Get user IP with better handling for proxies
    $user_ip = get_user_ip_address();
    
    // Use a more efficient transient key
    $transient_key = "dl_ip_{$post_id}_" . md5($user_ip);
    
    // Check if this IP has downloaded recently (using object cache if available)
    $recent_download = wp_cache_get($transient_key, 'download_counter');
    if ($recent_download === false) {
        $recent_download = get_transient($transient_key);
        if ($recent_download !== false) {
            wp_cache_set($transient_key, $recent_download, 'download_counter', 3600);
        }
    }
    
    if (!$recent_download) {
        // Get current count with caching
        $cache_key = "download_count_{$post_id}";
        $current_count = wp_cache_get($cache_key, 'download_counter');
        
        if ($current_count === false) {
            $current_count = get_post_meta($post_id, 'total_download', true);
            $current_count = intval($current_count);
            if ($current_count === 0) {
                $current_count = 307;
            }
            wp_cache_set($cache_key, $current_count, 'download_counter', 300); // Cache for 5 minutes
        }
        
        $new_count = $current_count + 1;
        
        // Update post meta
        $updated = update_post_meta($post_id, 'total_download', $new_count);
        
        if ($updated) {
            // Update cache
            wp_cache_set($cache_key, $new_count, 'download_counter', 300);
            
            // Set transient to prevent duplicates
            set_transient($transient_key, true, 3600);
            wp_cache_set($transient_key, true, 'download_counter', 3600);
            
            // Log if debug is enabled (optimized logging)
            if (defined('WP_DEBUG') && WP_DEBUG) {
                log_download_counter_activity($post_id, $user_ip, $current_count, $new_count, 'updated');
            }
        }
        
        return $updated;
    } else {
        // Log duplicate if debug is enabled
        if (defined('WP_DEBUG') && WP_DEBUG) {
            log_download_counter_activity($post_id, $user_ip, 0, 0, 'duplicate');
        }
        return false;
    }
}

/**
 * Get user IP address with proxy support
 */
function get_user_ip_address() {
    $ip_keys = ['HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'HTTP_CLIENT_IP', 'REMOTE_ADDR'];
    
    foreach ($ip_keys as $key) {
        if (!empty($_SERVER[$key])) {
            $ip = $_SERVER[$key];
            // Handle comma-separated IPs (from proxies)
            if (strpos($ip, ',') !== false) {
                $ip = trim(explode(',', $ip)[0]);
            }
            if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                return $ip;
            }
        }
    }
    
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

/**
 * Optimized logging function
 */
function log_download_counter_activity($post_id, $user_ip, $old_count, $new_count, $action) {
    static $log_buffer = [];
    
    $log_entry = [
        'timestamp' => current_time('Y-m-d H:i:s'),
        'action' => $action,
        'post_id' => $post_id,
        'ip' => $user_ip,
        'old_count' => $old_count,
        'new_count' => $new_count
    ];
    
    $log_buffer[] = $log_entry;
    
    // Write logs in batches to improve performance
    if (count($log_buffer) >= 10 || $action === 'force_write') {
        $log_content = '';
        foreach ($log_buffer as $entry) {
            if ($entry['action'] === 'updated') {
                $log_content .= "{$entry['timestamp']} | Download Counter Updated | Post ID: {$entry['post_id']} | IP: {$entry['ip']} | Old: {$entry['old_count']} | New: {$entry['new_count']}\n";
            } else {
                $log_content .= "{$entry['timestamp']} | Duplicate Download Blocked | Post ID: {$entry['post_id']} | IP: {$entry['ip']}\n";
            }
        }
        
        $log_file = wp_upload_dir()['basedir'] . '/download-counter-log.txt';
        file_put_contents($log_file, $log_content, FILE_APPEND | LOCK_EX);
        $log_buffer = [];
    }
}

// ===========================
// ENQUEUE SCRIPTS
// ===========================

/**
 * Enqueue AJAX script for download pages
 */
function enqueue_download_counter_script() {
    // Only load on download pages
    if (is_page_template('page-download.php') || is_page_template('page-dl-redirect.php')) {
        wp_enqueue_script(
            'download-counter-ajax',
            get_stylesheet_directory_uri() . '/js/download-counter.js',
            ['jquery'],
            '1.0.0',
            true
        );
        
        // Localize script with AJAX URL and nonce
        wp_localize_script('download-counter-ajax', 'downloadCounter', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('download_counter_nonce'),
            'postId' => get_the_ID()
        ]);
    }
}
add_action('wp_enqueue_scripts', 'enqueue_download_counter_script');

// ===========================
// CLEANUP FUNCTIONS
// ===========================

/**
 * Clean up old transients (run daily)
 */
function cleanup_download_transients() {
    global $wpdb;
    
    // Clean up old download IP transients
    $wpdb->query($wpdb->prepare("
        DELETE FROM {$wpdb->options} 
        WHERE option_name LIKE %s 
        AND option_value < %d
    ", '_transient_timeout_dl_ip_%', time()));
}

// Schedule cleanup if not already scheduled
if (!wp_next_scheduled('cleanup_download_transients')) {
    wp_schedule_event(time(), 'daily', 'cleanup_download_transients');
}
add_action('cleanup_download_transients', 'cleanup_download_transients');

/**
 * Force write any remaining logs on shutdown
 */
function force_write_download_logs() {
    log_download_counter_activity(0, '', 0, 0, 'force_write');
}
add_action('shutdown', 'force_write_download_logs');