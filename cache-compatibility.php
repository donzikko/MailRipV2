<?php
/**
 * Cache Compatibility Configuration
 * Ensures download counter works with Cloudflare + WP Rocket
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * WP Rocket Compatibility
 */
class DownloadCounterCacheCompat {
    
    public function __construct() {
        add_action('init', array($this, 'init_cache_compatibility'));
        add_filter('rocket_cache_reject_uri', array($this, 'exclude_download_pages'));
        add_filter('rocket_exclude_post_taxonomy', array($this, 'exclude_download_posts'));
        add_action('wp_head', array($this, 'add_cache_headers'), 1);
    }
    
    /**
     * Initialize cache compatibility
     */
    public function init_cache_compatibility() {
        // Exclude AJAX endpoint from caching
        if (defined('DOING_AJAX') && DOING_AJAX) {
            if (isset($_POST['action']) && $_POST['action'] === 'update_download_count') {
                nocache_headers();
                header('Cache-Control: no-cache, no-store, must-revalidate');
                header('Pragma: no-cache');
                header('Expires: 0');
            }
        }
    }
    
    /**
     * Exclude download pages from WP Rocket caching
     */
    public function exclude_download_pages($uri) {
        // Exclude pages with download tokens
        if (isset($_GET['token']) && !empty($_GET['token'])) {
            $uri[] = '(.*)token=(.*)';
        }
        
        // Exclude download page template
        if (is_page_template('download-page.php')) {
            $uri[] = get_permalink();
        }
        
        return $uri;
    }
    
    /**
     * Exclude download posts from caching
     */
    public function exclude_download_posts($post_types) {
        $post_types[] = 'download';
        return $post_types;
    }
    
    /**
     * Add appropriate cache headers for download pages
     */
    public function add_cache_headers() {
        if (isset($_GET['token']) && !empty($_GET['token'])) {
            // Prevent caching of download pages
            nocache_headers();
            header('Cache-Control: no-cache, no-store, must-revalidate, private');
            header('Pragma: no-cache');
            header('Expires: 0');
            
            // Cloudflare specific headers
            header('CF-Cache-Status: BYPASS');
            header('CF-Cache-Control: no-cache');
        }
    }
}

// Initialize cache compatibility
new DownloadCounterCacheCompat();

/**
 * Cloudflare Page Rules Helper
 * Add these rules to your Cloudflare dashboard:
 */
function get_cloudflare_page_rules() {
    return array(
        'rules' => array(
            array(
                'url' => '*yoursite.com/*token=*',
                'settings' => array(
                    'cache_level' => 'bypass',
                    'browser_cache_ttl' => 0
                )
            ),
            array(
                'url' => '*yoursite.com/wp-admin/admin-ajax.php*',
                'settings' => array(
                    'cache_level' => 'bypass'
                )
            )
        ),
        'instructions' => 'Add these page rules to your Cloudflare dashboard to ensure download pages are not cached.'
    );
}

/**
 * WP Rocket Configuration Helper
 * Add this to your wp-config.php or use WP Rocket settings
 */
function get_wp_rocket_config() {
    return array(
        'excluded_files' => array(
            '/wp-admin/admin-ajax.php',
            '(.*)token=(.*)'
        ),
        'excluded_cookies' => array(
            'download_counter_.*'
        ),
        'instructions' => 'Add these exclusions to your WP Rocket settings under "Never Cache URLs" and "Never Cache Cookies".'
    );
}

/**
 * Debug function to check cache status
 */
function debug_cache_status() {
    if (!current_user_can('manage_options')) {
        return;
    }
    
    $debug_info = array(
        'is_download_page' => isset($_GET['token']),
        'cache_headers_sent' => headers_sent(),
        'wp_rocket_active' => function_exists('rocket_init'),
        'cloudflare_detected' => isset($_SERVER['HTTP_CF_RAY']),
        'current_url' => $_SERVER['REQUEST_URI'] ?? '',
        'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? ''
    );
    
    if (isset($_GET['debug_cache']) && current_user_can('manage_options')) {
        wp_die('<pre>' . print_r($debug_info, true) . '</pre>');
    }
    
    return $debug_info;
}

/**
 * Add admin notice for cache configuration
 */
add_action('admin_notices', function() {
    if (!current_user_can('manage_options')) {
        return;
    }
    
    $screen = get_current_screen();
    if ($screen && $screen->id === 'dashboard') {
        echo '<div class="notice notice-info is-dismissible">';
        echo '<p><strong>Download Counter:</strong> Make sure to configure your cache settings for optimal performance.</p>';
        echo '<p><a href="' . admin_url('admin.php?page=download-counter-settings') . '">Configure Cache Settings</a></p>';
        echo '</div>';
    }
});