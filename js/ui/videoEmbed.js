/**
 * Video embed with a muted, looping preview.
 *
 * When the section approaches the viewport, a muted 15-second segment of the
 * video autoplays and loops in place (no controls, no sound). Clicking the
 * embed swaps it for the regular YouTube player with sound and controls.
 *
 * The preview is created through the YouTube IFrame API so that embed
 * failures (embedding disabled by the owner, video removed, region block)
 * can be detected: on error the preview is removed and the page falls back
 * to the static thumbnail facade instead of showing a player error screen.
 */
const PREVIEW_SECONDS = 15;

let ytApiPromise = null;

/**
 * Lazily loads the YouTube IFrame API the first time a preview starts.
 * @returns {Promise<typeof YT>} resolved once window.YT.Player is usable
 */
function loadYouTubeApi() {
    if (ytApiPromise) return ytApiPromise;
    ytApiPromise = new Promise((resolve) => {
        if (window.YT && window.YT.Player) {
            resolve(window.YT);
            return;
        }
        const previous = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            if (typeof previous === 'function') previous();
            resolve(window.YT);
        };
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(script);
    });
    return ytApiPromise;
}

export function initVideoEmbed(root) {
    for (const embed of root.querySelectorAll('[data-video-embed]')) {
        const facade = embed.querySelector('.video-facade');
        const videoId = embed.dataset.videoId;
        if (!facade || !videoId) continue;

        // Missing maxres thumbnails fall back to the smaller hq variant.
        const img = facade.querySelector('img');
        const useFallbackThumb = () => {
            if (img.dataset.fallbackApplied) return;
            img.dataset.fallbackApplied = 'true';
            img.src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        };
        img.addEventListener('error', useFallbackThumb, { once: true });
        // A 120px-wide image is YouTube's "thumbnail missing" placeholder.
        if (img.complete && img.naturalWidth <= 120) useFallbackThumb();

        // The stage wraps the facade and hosts both the preview and the player.
        const stage = facade.closest('.video-stage') || facade;

        // Preview player handle + loop watchdog, cleaned up on click-through.
        let previewPlayer = null;
        let previewWatchdog = null;

        // Full player: unmuted, with controls, starts on click.
        facade.addEventListener('click', (event) => {
            event.preventDefault();
            if (previewWatchdog) {
                clearInterval(previewWatchdog);
                previewWatchdog = null;
            }
            previewPlayer = null;
            stage.querySelector('.video-preview-frame')?.remove();
            embed.classList.remove('video-embed--preview');
            const iframe = document.createElement('iframe');
            iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0&playsinline=1`;
            iframe.title = facade.getAttribute('aria-label') || 'Video player';
            iframe.allow =
                'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
            iframe.setAttribute('allowfullscreen', '');
            facade.replaceWith(iframe);
        });

        // Muted looping preview: skipped for reduced-motion users, who keep the
        // static thumbnail facade — clicking it still opens the full player.
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) continue;

        const startPreview = () => {
            if (embed.dataset.previewStarted) return;
            embed.dataset.previewStarted = 'true';

            // Holder keeps the styling; the IFrame API replaces the inner div
            // with its own iframe, so the class must live on the wrapper.
            const holder = document.createElement('div');
            holder.className = 'video-preview-frame';
            holder.setAttribute('aria-hidden', 'true');
            const mount = document.createElement('div');
            holder.appendChild(mount);
            stage.appendChild(holder);
            embed.classList.add('video-embed--preview');

            loadYouTubeApi().then((YT) => {
                // The user may have clicked through to the full player while
                // the API was loading — do not resurrect the preview then.
                if (!mount.isConnected) return;
                previewPlayer = new YT.Player(mount, {
                    videoId,
                    playerVars: {
                        autoplay: 1,
                        mute: 1,
                        loop: 1,
                        playlist: videoId, // loop=1 requires playlist for single videos
                        end: PREVIEW_SECONDS,
                        controls: 0,
                        disablekb: 1,
                        fs: 0,
                        iv_load_policy: 3,
                        playsinline: 1,
                        rel: 0,
                    },
                    events: {
                        onReady: (event) => {
                            event.target.playVideo();
                        },
                        onStateChange: (event) => {
                            // Reaching the `end` time fires ENDED. The loop
                            // param alone is unreliable when `end` is set, so
                            // restart the segment explicitly.
                            if (event.data === YT.PlayerState.ENDED) {
                                event.target.seekTo(0, true);
                                event.target.playVideo();
                            }
                        },
                        onError: () => {
                            // Embedding disabled (101/150/153) or video gone:
                            // revert to the static thumbnail facade.
                            holder.remove();
                            embed.classList.remove('video-embed--preview');
                        },
                    },
                });

                // Watchdog: some browser/player combinations stall or pause at
                // the `end` boundary instead of firing ENDED — restart then.
                previewWatchdog = setInterval(() => {
                    if (!holder.isConnected) {
                        clearInterval(previewWatchdog);
                        previewWatchdog = null;
                        return;
                    }
                    const player = previewPlayer;
                    if (!player || typeof player.getCurrentTime !== 'function') return;
                    let time = 0;
                    try {
                        time = player.getCurrentTime();
                    } catch {
                        return; // player not ready yet
                    }
                    if (time >= PREVIEW_SECONDS - 0.25) {
                        try {
                            player.seekTo(0, true);
                            player.playVideo();
                        } catch {
                            /* player tearing down */
                        }
                    }
                }, 1000);
            });
        };

        // Inject the preview only once the section nears the viewport, so the
        // player request is not wasted on a section the visitor never reaches.
        if (!('IntersectionObserver' in window)) {
            startPreview();
            continue;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        observer.disconnect();
                        startPreview();
                    }
                }
            },
            { rootMargin: '240px 0px' }
        );
        observer.observe(embed);
    }
}
