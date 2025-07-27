jQuery(document).ready(function($) {
    
    // Function to update download counter via AJAX
    function updateDownloadCounter(postId) {
        $.ajax({
            url: downloadCounter.ajax_url,
            type: 'POST',
            data: {
                action: 'update_download_counter',
                post_id: postId,
                nonce: downloadCounter.nonce
            },
            success: function(response) {
                if (response.success) {
                    console.log('Download counter updated:', response.data);
                    
                    // Optional: Update counter display on page if exists
                    if (response.data.new_count && $('.download-counter').length) {
                        $('.download-counter').text(response.data.new_count);
                    }
                } else {
                    console.log('Download counter update failed:', response.data);
                }
            },
            error: function(xhr, status, error) {
                console.log('AJAX error:', error);
            }
        });
    }
    
    // For download page template - trigger when page loads
    if ($('body').hasClass('page-template-download-page')) {
        var postId = $('body').data('post-id') || window.downloadPostId;
        if (postId) {
            // Delay the AJAX call slightly to not block page rendering
            setTimeout(function() {
                updateDownloadCounter(postId);
            }, 500);
        }
    }
    
    // For direct download links - trigger on click
    $(document).on('click', '.download-link, .dl-button', function(e) {
        var postId = $(this).data('post-id');
        if (postId) {
            updateDownloadCounter(postId);
        }
    });
    
    // Alternative method: Auto-trigger based on URL pattern
    if (window.location.pathname.includes('/dl/')) {
        // Extract post ID from URL or get from global variable
        var postId = window.downloadPostId;
        if (postId) {
            setTimeout(function() {
                updateDownloadCounter(postId);
            }, 300);
        }
    }
    
});