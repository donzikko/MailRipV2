<?php
// Improved download counter function - now lighter for direct calls
if (!function_exists('update_download_counter_with_ip_check')) {
    function update_download_counter_with_ip_check($post_id, $async = false) {
        if (!$post_id) return false;

        // If async is true, just increment without IP check for performance
        if ($async) {
            $current_count = get_post_meta($post_id, 'total_download', true);
            $current_count = intval($current_count);
            
            if ($current_count === 0) {
                $current_count = 307;
            }
            
            $new_count = $current_count + 1;
            return update_post_meta($post_id, 'total_download', $new_count);
        }

        // Original logic for synchronous calls
        $user_ip = $_SERVER['REMOTE_ADDR'] ?? '';
        $recent_download = get_transient("download_ip_{$post_id}_{$user_ip}");

        if (!$recent_download) {
            $current_count = get_post_meta($post_id, 'total_download', true);
            $current_count = intval($current_count);
            
            if ($current_count === 0) {
                $current_count = 307;
            }
            
            $new_count = $current_count + 1;
            $updated = update_post_meta($post_id, 'total_download', $new_count);
            set_transient("download_ip_{$post_id}_{$user_ip}", true, 3600);
            
            if (defined('WP_DEBUG') && WP_DEBUG) {
                $log = date("Y-m-d H:i:s") . " | Download Counter Updated | Post ID: $post_id | IP: $user_ip | Old: $current_count | New: $new_count\n";
                file_put_contents(__DIR__ . "/download-counter-log.txt", $log, FILE_APPEND);
            }
            
            return $updated;
        } else {
            if (defined('WP_DEBUG') && WP_DEBUG) {
                $log = date("Y-m-d H:i:s") . " | Duplicate Download Blocked | Post ID: $post_id | IP: $user_ip\n";
                file_put_contents(__DIR__ . "/download-counter-log.txt", $log, FILE_APPEND);
            }
            return false;
        }
    }
}

// AJAX handler for download counter
add_action('wp_ajax_update_download_counter', 'ajax_update_download_counter');
add_action('wp_ajax_nopriv_update_download_counter', 'ajax_update_download_counter');

function ajax_update_download_counter() {
    // Verify nonce for security
    if (!wp_verify_nonce($_POST['nonce'], 'download_counter_nonce')) {
        wp_die('Security check failed');
    }
    
    $post_id = intval($_POST['post_id']);
    
    if (!$post_id) {
        wp_send_json_error('Invalid post ID');
        return;
    }
    
    // Check IP-based duplicate prevention
    $user_ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $recent_download = get_transient("download_ip_{$post_id}_{$user_ip}");
    
    if (!$recent_download) {
        $current_count = get_post_meta($post_id, 'total_download', true);
        $current_count = intval($current_count);
        
        if ($current_count === 0) {
            $current_count = 307;
        }
        
        $new_count = $current_count + 1;
        $updated = update_post_meta($post_id, 'total_download', $new_count);
        
        // Set transient to prevent duplicate downloads
        set_transient("download_ip_{$post_id}_{$user_ip}", true, 3600);
        
        if (defined('WP_DEBUG') && WP_DEBUG) {
            $log = date("Y-m-d H:i:s") . " | AJAX Download Counter Updated | Post ID: $post_id | IP: $user_ip | Old: $current_count | New: $new_count\n";
            file_put_contents(__DIR__ . "/download-counter-log.txt", $log, FILE_APPEND);
        }
        
        wp_send_json_success([
            'message' => 'Counter updated',
            'new_count' => $new_count,
            'updated' => $updated
        ]);
    } else {
        if (defined('WP_DEBUG') && WP_DEBUG) {
            $log = date("Y-m-d H:i:s") . " | AJAX Duplicate Download Blocked | Post ID: $post_id | IP: $user_ip\n";
            file_put_contents(__DIR__ . "/download-counter-log.txt", $log, FILE_APPEND);
        }
        
        wp_send_json_success([
            'message' => 'Duplicate download blocked',
            'blocked' => true
        ]);
    }
}

// Enqueue AJAX script and CSS for download pages
add_action('wp_enqueue_scripts', 'enqueue_download_counter_assets');

function enqueue_download_counter_assets() {
    // Only load on download pages (not on redirect pages)
    if (is_page_template('download-page.php') || strpos($_SERVER['REQUEST_URI'], '/download/') !== false) {
        wp_enqueue_script('jquery');
        wp_enqueue_script(
            'download-counter-ajax',
            get_template_directory_uri() . '/js/download-counter-simple.js',
            array('jquery'),
            '1.0.1',
            true
        );
        
        // Enqueue CSS
        wp_enqueue_style(
            'download-counter-css',
            get_template_directory_uri() . '/css/download-counter.css',
            array(),
            '1.0.0'
        );
        
        // Localize script with AJAX URL and nonce
        wp_localize_script('download-counter-ajax', 'downloadCounter', array(
            'ajax_url' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('download_counter_nonce')
        ));
    }
}

// Background cron handler for download counter updates
add_action('update_download_counter_background', 'handle_background_download_counter');

function handle_background_download_counter($post_id) {
    if ($post_id) {
        update_download_counter_with_ip_check($post_id);
    }
}
?>