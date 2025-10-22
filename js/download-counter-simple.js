jQuery(document).ready(function($) {
    
    // Simple function to update download counter via AJAX
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
                    console.log('✅ Download counter updated successfully:', response.data);
                    
                    // Update counter display on page if exists
                    if (response.data.new_count && $('.download-counter').length) {
                        $('.download-counter').text(response.data.new_count);
                        $('.download-counter').fadeOut(100).fadeIn(100); // Small animation
                    }
                } else {
                    console.log('⚠️ Download counter update response:', response.data);
                }
            },
            error: function(xhr, status, error) {
                console.log('❌ AJAX error updating download counter:', error);
            }
        });
    }
    
    // Check if we're on a download page and have a post ID
    var postId = window.downloadPostId;
    var isDownloadPage = window.location.pathname.includes('/download/') || 
                        $('body').hasClass('page-template-download-page');
    
    if (isDownloadPage && postId) {
        console.log('🔄 Download page detected, updating counter for post ID:', postId);
        
        // Wait a bit for page to load, then update counter
        setTimeout(function() {
            updateDownloadCounter(postId);
        }, 800);
    } else if (isDownloadPage && !postId) {
        console.log('⚠️ Download page detected but no post ID found');
    }
    
    // Also handle manual download button clicks (if any)
    $(document).on('click', '.download-link, .download-btn, .dl-button', function(e) {
        var buttonPostId = $(this).data('post-id') || postId;
        if (buttonPostId) {
            console.log('🔄 Download button clicked, updating counter for post ID:', buttonPostId);
            updateDownloadCounter(buttonPostId);
        }
    });
    
});