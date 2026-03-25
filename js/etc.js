(function () {

    // ── Stack of content items ──
    // Each item has a label, title, and body (HTML strings).
    // The visible window is always the top 3.

    var stack = [
        {
            label: 'Main',
            title: 'First Content',
            body: '<p class="body-text">This is the first piece of content. It starts in the main panel — the largest section on the left. Click one of the smaller panels on the right to cycle the stack forward.</p>'
        },
        {
            label: 'Stack item 2 of 4',
            title: 'Other Content 1',
            body: '<p class="body-text">This is other content 1. It was waiting in the top sidebar slot. Now that you\'ve promoted it, it takes center stage.</p>'
        },
        {
            label: 'Stack item 3 of 4',
            title: 'Other Content 2',
            body: '<p class="body-text">This is other content 2. It was sitting in the bottom sidebar — or maybe it was hidden entirely, waiting for its turn.</p>'
        },
        {
            label: 'Stack item 4 of 4',
            title: 'Other Content 3',
            body: '<p class="body-text">This is other content 3. It started out of view, but the stack brought it forward. There\'s nothing left after this one.</p>'
        }
    ];

    var currentIndex = 0;
    var animating = false;

    var mainEl = document.getElementById('etcMain');
    var topEl = document.getElementById('etcTop');
    var bottomEl = document.getElementById('etcBottom');
    var shellEl = document.querySelector('.etc-shell');

    var EXIT_DURATION = 300;   // ms — slightly longer than 280ms animation to add breathing room
    var ENTER_DURATION = 340;

    // ── All animation classes we might apply ──

    var ALL_CLASSES = [
        'etc-exit-poof', 'etc-exit-slide-left', 'etc-exit-slide-up',
        'etc-enter-main', 'etc-enter-top', 'etc-enter-bottom'
    ];

    function clearAnimations(el) {
        ALL_CLASSES.forEach(function (cls) {
            el.classList.remove(cls);
        });
    }

    // ── Render content into a panel ──

    function renderPanel(el, item) {
        el.innerHTML =
            '<p class="section-label">' + item.label + '</p>' +
            '<h2 class="sub">' + item.title + '</h2>' +
            item.body;
    }

    // ── Render all visible panels (no animation) ──

    function renderAll() {
        var items = stack.slice(currentIndex, currentIndex + 3);

        if (items[0]) {
            renderPanel(mainEl, items[0]);
            mainEl.classList.remove('etc-hidden');
        }

        if (items[1]) {
            renderPanel(topEl, items[1]);
            topEl.classList.remove('etc-hidden');
        } else {
            topEl.classList.add('etc-hidden');
        }

        if (items[2]) {
            renderPanel(bottomEl, items[2]);
            bottomEl.classList.remove('etc-hidden');
        } else {
            bottomEl.classList.add('etc-hidden');
        }
    }

    // ── Animated transition ──
    //    popCount = 1 → gr-top clicked
    //    popCount = 2 → gr-bottom clicked

    function transition(popCount) {
        var newIndex = currentIndex + popCount;
        if (newIndex >= stack.length || animating) return;

        animating = true;
        shellEl.classList.add('etc-animating');

        // ── Phase 1: exit animations ──

        // Main always poofs out
        clearAnimations(mainEl);
        mainEl.classList.add('etc-exit-poof');

        if (popCount === 1) {
            // gr-top clicked: top slides left (it's being promoted),
            // bottom slides up (it's moving into top's slot)
            clearAnimations(topEl);
            topEl.classList.add('etc-exit-slide-left');

            if (!bottomEl.classList.contains('etc-hidden')) {
                clearAnimations(bottomEl);
                bottomEl.classList.add('etc-exit-slide-up');
            }
        } else {
            // gr-bottom clicked: top also poofs (ejected alongside main),
            // bottom slides up (being promoted past top into main)
            if (!topEl.classList.contains('etc-hidden')) {
                clearAnimations(topEl);
                topEl.classList.add('etc-exit-poof');
            }

            if (!bottomEl.classList.contains('etc-hidden')) {
                clearAnimations(bottomEl);
                bottomEl.classList.add('etc-exit-slide-up');
            }
        }

        // ── Phase 2: swap content, apply enter animations ──

        setTimeout(function () {
            currentIndex = newIndex;
            var items = stack.slice(currentIndex, currentIndex + 3);

            // Clear all exit classes
            clearAnimations(mainEl);
            clearAnimations(topEl);
            clearAnimations(bottomEl);

            // Render new content
            if (items[0]) {
                renderPanel(mainEl, items[0]);
                mainEl.classList.remove('etc-hidden');
                mainEl.classList.add('etc-enter-main');
            }

            if (items[1]) {
                renderPanel(topEl, items[1]);
                topEl.classList.remove('etc-hidden');
                topEl.classList.add('etc-enter-top');
            } else {
                topEl.classList.add('etc-hidden');
            }

            if (items[2]) {
                renderPanel(bottomEl, items[2]);
                bottomEl.classList.remove('etc-hidden');
                bottomEl.classList.add('etc-enter-bottom');
            } else {
                bottomEl.classList.add('etc-hidden');
            }

            // ── Phase 3: clean up after enter animations finish ──

            setTimeout(function () {
                clearAnimations(mainEl);
                clearAnimations(topEl);
                clearAnimations(bottomEl);
                shellEl.classList.remove('etc-animating');
                animating = false;
            }, ENTER_DURATION);

        }, EXIT_DURATION);
    }

    // ── Click handlers ──

    topEl.addEventListener('click', function () {
        transition(1);
    });

    bottomEl.addEventListener('click', function () {
        transition(2);
    });

    // ── Initial render ──

    renderAll();

})();