/* ==========================================================================
   Preside by Side — Interactions
   - Desktop: bar click toggles inline expansion (same-side bars push down)
   - Mobile:  bar click opens a full-screen modal sheet
   ========================================================================== */

(function () {
    'use strict';

    const MOBILE_QUERY = '(max-width: 768px)';
    const isMobile = () => window.matchMedia(MOBILE_QUERY).matches;

    // Modal elements
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalDescription = document.getElementById('modal-description');
    const modalSeverity = document.getElementById('modal-severity');
    const modalSourcesList = document.getElementById('modal-sources-list');

    // Track currently expanded bar (desktop) so we can collapse it
    let currentlyExpanded = null;

    /* --------------------------------------------------------------------------
       Bar click handlers
       -------------------------------------------------------------------------- */
    const allBarFills = document.querySelectorAll('.bar-fill');

    allBarFills.forEach((fill) => {
        fill.addEventListener('click', () => {
            const bar = fill.closest('.bar');
            if (!bar) return;

            if (isMobile()) {
                openModal(bar);
            } else {
                toggleExpand(bar);
            }
        });
    });

    /* --------------------------------------------------------------------------
       Desktop: inline expansion
       -------------------------------------------------------------------------- */
    function toggleExpand(bar) {
        const fill = bar.querySelector('.bar-fill');
        const detail = bar.querySelector('.bar-detail');
        const isOpen = bar.classList.contains('expanded');

        // Collapse any other open bar (single-open behavior keeps the page tidy)
        if (currentlyExpanded && currentlyExpanded !== bar) {
            collapseBar(currentlyExpanded);
        }

        if (isOpen) {
            collapseBar(bar);
            currentlyExpanded = null;
        } else {
            bar.classList.add('expanded');
            fill.setAttribute('aria-expanded', 'true');
            if (detail) detail.removeAttribute('hidden');
            currentlyExpanded = bar;
        }
    }

    function collapseBar(bar) {
        const fill = bar.querySelector('.bar-fill');
        const detail = bar.querySelector('.bar-detail');
        bar.classList.remove('expanded');
        fill.setAttribute('aria-expanded', 'false');
        // Wait for transition before re-hiding for a11y
        if (detail) {
            const onEnd = (e) => {
                if (e.propertyName === 'max-height' && !bar.classList.contains('expanded')) {
                    detail.setAttribute('hidden', '');
                }
                detail.removeEventListener('transitionend', onEnd);
            };
            detail.addEventListener('transitionend', onEnd);
        }
    }

    /* --------------------------------------------------------------------------
       Mobile: modal
       -------------------------------------------------------------------------- */
    function openModal(bar) {
        const side = bar.dataset.side;
        const fill = bar.querySelector('.bar-fill');
        const title = fill.dataset.title || 'Detail';
        const severity = fill.style.getPropertyValue('--severity').trim();
        const detail = bar.querySelector('.bar-detail');
        const description = detail ? detail.querySelector('.detail-description')?.textContent || '' : '';
        const sources = detail ? detail.querySelectorAll('.sources-list li') : [];

        modal.dataset.side = side;
        modalTitle.textContent = title;
        modalDescription.textContent = description;
        modalSeverity.textContent = severity;

        // Rebuild sources list
        modalSourcesList.innerHTML = '';
        sources.forEach((srcLi) => {
            const li = document.createElement('li');
            li.innerHTML = srcLi.innerHTML;
            modalSourcesList.appendChild(li);
        });

        modal.removeAttribute('hidden');
        document.body.style.overflow = 'hidden';

        // Focus the close button for keyboard users
        requestAnimationFrame(() => {
            const closeBtn = modal.querySelector('.modal-close');
            if (closeBtn) closeBtn.focus();
        });
    }

    function closeModal() {
        modal.setAttribute('hidden', '');
        document.body.style.overflow = '';
    }

    // Close handlers — backdrop, close button, ESC key
    modal.addEventListener('click', (e) => {
        if (e.target.matches('[data-modal-close]') || e.target.closest('[data-modal-close]')) {
            closeModal();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.hasAttribute('hidden')) {
            closeModal();
        }
    });

    /* --------------------------------------------------------------------------
       Resize handler — collapse open bars when crossing the breakpoint
       so we don't have leftover state from one mode in the other.
       -------------------------------------------------------------------------- */
    let lastIsMobile = isMobile();
    window.addEventListener('resize', () => {
        const nowMobile = isMobile();
        if (nowMobile !== lastIsMobile) {
            // Crossed breakpoint — reset state
            if (currentlyExpanded) {
                collapseBar(currentlyExpanded);
                currentlyExpanded = null;
            }
            if (!modal.hasAttribute('hidden')) {
                closeModal();
            }
            lastIsMobile = nowMobile;
        }
    });
})();