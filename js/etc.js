(function () {

    // ── Stack of content items ──
    // Each item has a label, title, and body (HTML strings).
    // The visible window is always the top 3.

    var stack = [
        {
            label: 'Main',
            title: 'First Content',
            body: '<p class="body-text">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc ultricies blandit commodo. Ut nulla lorem, viverra eget accumsan et, convallis sed libero. Mauris ullamcorper vulputate congue. Suspendisse non imperdiet urna. Sed feugiat interdum condimentum. Sed semper nulla eget porta pretium. Cras at libero orci. Etiam congue commodo congue. Integer blandit sem ac dui rutrum, vitae eleifend est laoreet. Duis viverra laoreet turpis. Aliquam metus ex, viverra id laoreet eu, scelerisque quis tellus. Phasellus euismod commodo nisi ut dapibus. Phasellus lobortis quis orci sit amet bibendum. Praesent eget nibh eget augue euismod volutpat. Mauris et risus quis dolor sodales gravida. Maecenas condimentum pulvinar erat, eu lacinia dui gravida sit amet. Fusce lorem massa, scelerisque ut iaculis sed, placerat eu orci. Praesent tempor lectus et augue lobortis egestas. Phasellus vel tristique ex. Praesent nisi ipsum, volutpat sit amet suscipit a, mattis ut dolor. Donec aliquet consectetur purus et egestas. Pellentesque dui lorem, consequat vel mi sed, laoreet maximus nisi. Donec lobortis sit amet dolor eget fermentum. Maecenas bibendum nisi eu nisl ornare ullamcorper. Aliquam ex quam, ornare id sapien ut, gravida imperdiet nisl. Sed fringilla suscipit gravida. Quisque at nunc massa. Nullam in commodo dolor. Nunc risus felis, rhoncus quis vehicula vitae, blandit a nulla. Morbi sodales sem in felis volutpat, non vehicula eros imperdiet. Duis dictum, enim ac efficitur mattis, ipsum est rhoncus urna, at sagittis elit risus quis dui. Praesent at molestie elit, non consectetur quam. Pellentesque ac elit mauris. Suspendisse non vehicula urna, in eleifend nisl. Fusce lacinia ipsum eu lorem commodo pretium. Duis lacinia mauris eu risus blandit, quis iaculis nisl dapibus. Cras sodales nibh nec dolor semper ultricies. Cras sollicitudin congue leo, ac finibus arcu interdum sed. Ut mattis convallis sem eget finibus. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Ut ac diam ut turpis pretium pretium eu sit amet sapien. Vivamus semper interdum ipsum id dictum. Quisque accumsan elit id dui bibendum, in placerat erat eleifend. Suspendisse sit amet lorem quis ex consequat faucibus sed quis mauris. Donec lacus justo, laoreet sagittis convallis ac, varius in quam. Donec eleifend eros justo, nec blandit est dignissim et. Integer sagittis suscipit consectetur.</p>'
        },
        {
            label: 'Stack item 2 of 4',
            title: 'Other Content 1',
            body: '<p class="body-text">This is other content 1. It was waiting in the top sidebar slot. Now that you\'ve promoted it, it takes center stage.</p>'
        },
        {
            label: 'Stack item 3 of 4',
            title: 'Other Content 2',
            body: '<p class="body-text">Praesent at molestie elit, non consectetur quam. Pellentesque ac elit mauris. Suspendisse non vehicula urna, in eleifend nisl. Fusce lacinia ipsum eu lorem commodo pretium. Duis lacinia mauris eu risus blandit, quis iaculis nisl dapibus. Cras sodales nibh nec dolor semper ultricies. Cras sollicitudin congue leo, ac finibus arcu interdum sed. Ut mattis convallis sem eget finibus. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Ut ac diam ut turpis pretium pretium eu sit amet sapien. Vivamus semper interdum ipsum id dictum. Quisque accumsan elit id dui bibendum, in placerat erat eleifend. Suspendisse sit amet lorem quis ex consequat faucibus sed quis mauris. Donec lacus justo, laoreet sagittis convallis ac, varius in quam. Donec eleifend eros justo, nec blandit est dignissim et. Integer sagittis suscipit consectetur.</p>'
        },
        {
            label: 'Stack item 4 of 4',
            title: 'Other Content 3',
            body: '<p class="body-text">In mattis eros et odio hendrerit, at finibus ex auctor. Vivamus molestie gravida turpis eu porta. Fusce convallis convallis porttitor. Ut quis odio volutpat, posuere tortor a, ultrices est. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Phasellus ante ex, vulputate non hendrerit in, vestibulum in nunc. Quisque non fermentum tortor. Curabitur ullamcorper dui massa, quis volutpat dui viverra a. Sed nec augue ipsum. Phasellus ac libero vel lectus viverra aliquam sit amet non tortor. Mauris tortor diam, tempus quis tincidunt in, molestie vel quam. Pellentesque leo justo, pulvinar ac urna viverra, cursus venenatis lacus. Quisque sed mauris id mauris luctus porta ac eu nunc. Fusce in tempus elit. Quisque sit amet cursus metus. Ut sed dui metus.</p>'
        }
    ];

    var currentIndex = 0;
    var animating = false;

    var mainEl = document.getElementById('etcMainContent');
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