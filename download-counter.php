<?php
/**
 * Download Counter System
 * Works with Cloudflare Cache + WP Rocket
 * Updates post meta "total_download" when users view download page
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

class DownloadCounter {
    
    public function __construct() {
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));
        add_action('wp_ajax_update_download_count', array($this, 'handle_ajax_update'));
        add_action('wp_ajax_nopriv_update_download_count', array($this, 'handle_ajax_update'));
        add_action('wp_head', array($this, 'add_nonce_to_head'));
    }
    
    /**
     * Enqueue scripts for AJAX counter update
     */
    public function enqueue_scripts() {
        // Only load on download pages
        if (is_page_template('download-page.php') || 
            (isset($_GET['token']) && !empty($_GET['token']))) {
            
            wp_enqueue_script('jquery');
            wp_enqueue_script(
                'download-counter',
                get_template_directory_uri() . '/js/download-counter.js',
                array('jquery'),
                '1.0.0',
                true
            );
            
            // Localize script with AJAX URL and nonce
            wp_localize_script('download-counter', 'downloadCounter', array(
                'ajaxurl' => admin_url('admin-ajax.php'),
                'nonce' => wp_create_nonce('download_counter_nonce'),
                'post_id' => get_the_ID()
            ));
        }
    }
    
    /**
     * Add nonce to head for security
     */
    public function add_nonce_to_head() {
        if (is_page_template('download-page.php') || 
            (isset($_GET['token']) && !empty($_GET['token']))) {
            echo '<meta name="download-counter-nonce" content="' . wp_create_nonce('download_counter_nonce') . '">';
        }
    }
    
    /**
     * Handle AJAX request to update download count
     */
    public function handle_ajax_update() {
        // Verify nonce for security
        if (!wp_verify_nonce($_POST['nonce'], 'download_counter_nonce')) {
            wp_die('Security check failed');
        }
        
        $post_id = intval($_POST['post_id']);
        $token = sanitize_text_field($_POST['token']);
        
        // Validate post exists and is published
        $post = get_post($post_id);
        if (!$post || $post->post_status !== 'publish') {
            wp_send_json_error('Invalid post');
            return;
        }
        
        // Validate token (reuse your existing function)
        $validated_post_id = validate_token($token);
        if (!$validated_post_id || $validated_post_id !== $post_id) {
            wp_send_json_error('Invalid token');
            return;
        }
        
        // Check for duplicate counting (prevent rapid clicks)
        $user_ip = $this->get_user_ip();
        $transient_key = 'download_counted_' . $post_id . '_' . md5($user_ip);
        
        if (get_transient($transient_key)) {
            wp_send_json_success(array(
                'message' => 'Already counted',
                'count' => $this->get_download_count($post_id)
            ));
            return;
        }
        
        // Update download count
        $new_count = $this->increment_download_count($post_id);
        
        // Set transient to prevent duplicate counting for 5 minutes
        set_transient($transient_key, true, 300);
        
        // Log the download activity (reuse your existing function)
        $file_url = $this->get_download_url($post_id);
        if (function_exists('log_download_activity')) {
            log_download_activity($post_id, $file_url, 'COUNTED');
        }
        
        wp_send_json_success(array(
            'message' => 'Count updated',
            'count' => $new_count
        ));
    }
    
    /**
     * Increment download count for a post
     */
    private function increment_download_count($post_id) {
        $current_count = get_post_meta($post_id, 'total_download', true);
        $current_count = intval($current_count);
        $new_count = $current_count + 1;
        
        update_post_meta($post_id, 'total_download', $new_count);
        
        return $new_count;
    }
    
    /**
     * Get current download count for a post
     */
    public function get_download_count($post_id) {
        $count = get_post_meta($post_id, 'total_download', true);
        return intval($count);
    }
    
    /**
     * Get download URL from post meta (matching your existing structure)
     */
    private function get_download_url($post_id) {
        $file_url_group = get_post_meta($post_id, 'dllink', true);
        $file_url = '';
        
        if (is_array($file_url_group) && !empty($file_url_group['dl1link'])) {
            $file_url = $file_url_group['dl1link'];
        } elseif (is_string($file_url_group) && !empty($file_url_group)) {
            $file_url = $file_url_group;
        }
        
        return $file_url;
    }
    
    /**
     * Get user IP address (works with Cloudflare)
     */
    private function get_user_ip() {
        // Check for Cloudflare headers first
        if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
            return $_SERVER['HTTP_CF_CONNECTING_IP'];
        }
        
        // Check for other proxy headers
        $headers = array(
            'HTTP_X_FORWARDED_FOR',
            'HTTP_X_REAL_IP',
            'HTTP_CLIENT_IP',
            'REMOTE_ADDR'
        );
        
        foreach ($headers as $header) {
            if (!empty($_SERVER[$header])) {
                $ip = $_SERVER[$header];
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
     * Display download count (for use in templates)
     */
    public static function display_count($post_id = null) {
        if (!$post_id) {
            $post_id = get_the_ID();
        }
        
        $counter = new self();
        $count = $counter->get_download_count($post_id);
        
        return number_format($count);
    }
}

// Initialize the download counter
new DownloadCounter();

/**
 * Helper function to display download count in templates
 */
function get_download_count($post_id = null) {
    return DownloadCounter::display_count($post_id);
}