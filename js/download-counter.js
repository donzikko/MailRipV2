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
    
    // For download page template (site.com/appname/download/) - trigger when page loads
    if ($('body').hasClass('page-template-download-page') || window.location.pathname.includes('/download/')) {
        var postId = $('body').data('post-id') || window.downloadPostId;
        if (postId) {
            // Delay the AJAX call slightly to not block page rendering
            setTimeout(function() {
                updateDownloadCounter(postId);
                console.log('Download counter triggered for post ID:', postId);
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
    
    // Auto-detect download page by URL pattern (fallback method)
    if (window.location.pathname.match(/\/[^\/]+\/download\/?$/)) {
        var postId = window.downloadPostId;
        if (postId) {
            setTimeout(function() {
                updateDownloadCounter(postId);
                console.log('Download counter triggered via URL pattern for post ID:', postId);
            }, 300);
        }
    }
    
});