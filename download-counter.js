/**
 * Download Counter JavaScript
 * Handles AJAX updates for download counting
 * Works with caching systems (Cloudflare + WP Rocket)
 */

jQuery(document).ready(function($) {
    'use strict';
    
    // Only run if we have the necessary data
    if (typeof downloadCounter === 'undefined') {
        return;
    }
    
    // Get token from URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    // Only proceed if we have a valid token
    if (!token) {
        return;
    }
    
    // Track if we've already sent the request
    let countUpdated = false;
    
    /**
     * Update download count via AJAX
     */
    function updateDownloadCount() {
        // Prevent multiple requests
        if (countUpdated) {
            return;
        }
        
        countUpdated = true;
        
        $.ajax({
            url: downloadCounter.ajaxurl,
            type: 'POST',
            data: {
                action: 'update_download_count',
                nonce: downloadCounter.nonce,
                post_id: downloadCounter.post_id,
                token: token
            },
            success: function(response) {
                if (response.success) {
                    console.log('Download count updated:', response.data.count);
                    
                    // Update any download count display elements
                    $('.download-count').text(response.data.count.toLocaleString());
                    
                    // Trigger custom event for other scripts
                    $(document).trigger('downloadCountUpdated', [response.data.count]);
                } else {
                    console.log('Download count update failed:', response.data);
                }
            },
            error: function(xhr, status, error) {
                console.log('AJAX error:', error);
                countUpdated = false; // Allow retry on error
            }
        });
    }
    
    /**
     * Trigger count update when page is fully loaded
     * This ensures the user actually viewed the download page
     */
    $(window).on('load', function() {
        // Small delay to ensure page is fully rendered
        setTimeout(updateDownloadCount, 500);
    });
    
    /**
     * Also trigger on visibility change (when user returns to tab)
     * This helps catch cases where the initial load might have failed
     */
    let visibilityChangeTriggered = false;
    $(document).on('visibilitychange', function() {
        if (!document.hidden && !visibilityChangeTriggered) {
            visibilityChangeTriggered = true;
            setTimeout(updateDownloadCount, 1000);
        }
    });
    
    /**
     * Fallback: trigger on user interaction if other methods fail
     */
    let interactionTriggered = false;
    $(document).one('click scroll touchstart', function() {
        if (!interactionTriggered && !countUpdated) {
            interactionTriggered = true;
            setTimeout(updateDownloadCount, 200);
        }
    });
});