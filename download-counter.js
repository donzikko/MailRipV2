/**
 * Download Counter AJAX Handler
 * Place this file in your child theme's /js/ directory
 */

(function($) {
    'use strict';
    
    // Configuration
    const config = {
        retryAttempts: 3,
        retryDelay: 1000, // 1 second
        timeout: 10000 // 10 seconds
    };
    
    /**
     * Update download counter via AJAX
     */
    function updateDownloadCounter(attempt = 1) {
        // Don't run if we don't have the required data
        if (typeof downloadCounter === 'undefined' || !downloadCounter.postId) {
            console.warn('Download counter: Missing configuration data');
            return;
        }
        
        // Prepare AJAX data
        const ajaxData = {
            action: 'update_download_counter',
            post_id: downloadCounter.postId,
            nonce: downloadCounter.nonce
        };
        
        // Make AJAX request
        $.ajax({
            url: downloadCounter.ajaxUrl,
            type: 'POST',
            data: ajaxData,
            timeout: config.timeout,
            dataType: 'json',
            success: function(response) {
                if (response.success) {
                    console.log('Download counter updated successfully:', response.message);
                    
                    // Trigger custom event for other scripts to listen to
                    $(document).trigger('downloadCounterUpdated', [response]);
                } else {
                    console.warn('Download counter update failed:', response.message);
                }
            },
            error: function(xhr, textStatus, errorThrown) {
                console.error('Download counter AJAX error:', textStatus, errorThrown);
                
                // Retry on failure
                if (attempt < config.retryAttempts) {
                    console.log(`Retrying download counter update (attempt ${attempt + 1}/${config.retryAttempts})`);
                    setTimeout(function() {
                        updateDownloadCounter(attempt + 1);
                    }, config.retryDelay * attempt); // Exponential backoff
                } else {
                    console.error('Download counter update failed after all retry attempts');
                    
                    // Trigger custom event for error handling
                    $(document).trigger('downloadCounterError', [xhr, textStatus, errorThrown]);
                }
            }
        });
    }
    
    /**
     * Debounced counter update to prevent multiple rapid calls
     */
    let updateTimeout;
    function debouncedUpdateCounter() {
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(updateDownloadCounter, 500);
    }
    
    /**
     * Initialize the download counter
     */
    function initDownloadCounter() {
        // Check if we're on a download page
        if (typeof downloadCounter === 'undefined') {
            return;
        }
        
        // Update counter when page loads (with small delay to ensure page is ready)
        $(window).on('load', function() {
            setTimeout(debouncedUpdateCounter, 1000);
        });
        
        // Also update on visibility change (when user returns to tab)
        // This helps catch cases where the initial load failed
        let hasUpdated = false;
        $(document).on('visibilitychange', function() {
            if (!document.hidden && !hasUpdated) {
                hasUpdated = true;
                debouncedUpdateCounter();
            }
        });
        
        // Fallback: Update on any click (for cases where load event doesn't fire)
        let clickUpdated = false;
        $(document).one('click', function() {
            if (!clickUpdated) {
                clickUpdated = true;
                debouncedUpdateCounter();
            }
        });
    }
    
    /**
     * Optional: Display counter value if element exists
     */
    function displayCounter() {
        const $counterElement = $('.download-counter-display');
        if ($counterElement.length) {
            $(document).on('downloadCounterUpdated', function(event, response) {
                // You can update a display element here if needed
                // $counterElement.text('Downloads: ' + newCount);
            });
        }
    }
    
    // Initialize when document is ready
    $(document).ready(function() {
        initDownloadCounter();
        displayCounter();
    });
    
    // Expose functions globally for debugging
    window.downloadCounterDebug = {
        updateNow: updateDownloadCounter,
        config: config
    };
    
})(jQuery);