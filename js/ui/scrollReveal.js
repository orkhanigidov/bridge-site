/**
 * Scroll-reveal animations: sections fade/slide in as they enter the viewport.
 * Uses IntersectionObserver with graceful fallback (content shown immediately).
 * All animations are disabled via CSS for prefers-reduced-motion users.
 */
export function initScrollReveal(root) {
    const targets = root.querySelectorAll('.band, .hero');

    // Fallback: no IntersectionObserver support -> show everything immediately
    if (!('IntersectionObserver' in window)) {
        for (const el of targets) el.classList.add('reveal', 'is-visible');
        return;
    }

    const observer = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            }
        },
        { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    for (const el of targets) {
        el.classList.add('reveal');
        observer.observe(el);
    }
}
