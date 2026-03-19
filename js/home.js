(function () {

    // ── Photo gallery ───────────────────────────────────────

    var galleryBtn = document.querySelector('.photo-cycle-btn');
    if (galleryBtn) {
        galleryBtn.addEventListener('click', function () {
            var imgs = document.querySelectorAll('.photo-img');
            var dots = document.querySelectorAll('.photo-dot');
            var current = Array.from(imgs).findIndex(function (img) {
                return img.classList.contains('active');
            });
            var next = (current + 1) % imgs.length;

            imgs[current].classList.remove('active');
            imgs[next].classList.add('active');
            dots[current].classList.remove('active');
            dots[next].classList.add('active');
        });
    }

    // ── Easter egg ──────────────────────────────────────────

    var allLetters = ['v', 'o', 'l', 'u', 'm', 'e'];
    var placed = {};
    var currentDragLetter = null;
    var currentDragSource = null;
    var slots = document.querySelectorAll('.egg-slot');

    function showSlots() {
        slots.forEach(function (s) {
            if (!s.classList.contains('egg-filled')) {
                s.style.opacity = '1';
                s.style.pointerEvents = 'all';
            }
        });
    }

    function hideSlots() {
        slots.forEach(function (s) {
            if (!s.classList.contains('egg-filled')) {
                s.style.opacity = '';
                s.style.pointerEvents = '';
            }
        });
    }

    // ── Draggable letter setup ──────────────────────────────

    document.querySelectorAll('.egg-letter').forEach(function (span) {

        span.addEventListener('dragstart', function (e) {
            if (span.classList.contains('egg-used')) {
                e.preventDefault();
                return;
            }

            currentDragLetter = span.dataset.letter;
            currentDragSource = span;
            e.dataTransfer.setData('text/plain', span.dataset.letter);
            e.dataTransfer.effectAllowed = 'move';

            var ghost = document.createElement('div');
            ghost.textContent = span.dataset.letter;
            ghost.setAttribute('style', [
                'position:fixed',
                'top:-200px',
                'left:-200px',
                'font-family:DM Sans,sans-serif',
                'font-size:1.1rem',
                'font-weight:500',
                'color:#1a1a1a',
                'background:#f7eff2',
                'border:1px solid rgba(26,26,26,0.15)',
                'border-radius:4px',
                'padding:4px 10px',
                'box-shadow:0 2px 8px rgba(0,0,0,0.12)',
                'pointer-events:none'
            ].join(';'));
            document.body.appendChild(ghost);
            e.dataTransfer.setDragImage(ghost, 14, 18);
            setTimeout(function () { document.body.removeChild(ghost); }, 0);

            setTimeout(function () {
                span.classList.add('egg-invisible');
                showSlots();
            }, 0);
        });

        span.addEventListener('dragend', function () {
            hideSlots();
            if (currentDragSource && !currentDragSource.classList.contains('egg-used')) {
                currentDragSource.classList.remove('egg-invisible');
            }
            currentDragLetter = null;
            currentDragSource = null;
        });

    });

    // ── Drop zone: entire gr-right ──────────────────────────

    var grRight = document.querySelector('.gr-right');

    grRight.addEventListener('dragover', function (e) {
        if (currentDragLetter && !placed[currentDragLetter]) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        }
    });

    grRight.addEventListener('drop', function (e) {
        e.preventDefault();
        var letter = currentDragLetter;
        if (!letter || placed[letter]) return;

        var targetSlot = document.querySelector('.egg-slot[data-target="' + letter + '"]');
        if (!targetSlot) return;

        targetSlot.textContent = letter;
        targetSlot.classList.add('egg-filled');
        targetSlot.style.opacity = '';
        targetSlot.style.pointerEvents = '';
        placed[letter] = true;

        if (currentDragSource) {
            currentDragSource.classList.add('egg-used');
            currentDragSource.classList.remove('egg-invisible');
        }

        if (allLetters.every(function (l) { return placed[l]; })) {
            onVolumeComplete();
        }
    });

    // ── Helpers ──────────────────────────────────────────────

    function getBrightness(hex) {
        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }

    function hexToRgb(hex) {
        return {
            r: parseInt(hex.slice(1, 3), 16),
            g: parseInt(hex.slice(3, 5), 16),
            b: parseInt(hex.slice(5, 7), 16)
        };
    }

    // ── Completion handler ───────────────────────────────────

    function onVolumeComplete() {
        document.querySelector('.nav-home').textContent = 'FE!N';
        document.querySelector('.page-title').innerHTML = 'Front End<br>!nsertion Needed';

        var sound = new Audio('/audio/igorrrTPM.mp3');
        sound.volume = 0.6;

        // ── Web Audio API setup ──
        // AudioContext must be created from a user gesture — the drop counts.
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        var audioCtx = new AudioCtx();

        var source = audioCtx.createMediaElementSource(sound);

        var analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;           // 128 frequency bins
        analyser.smoothingTimeConstant = 0.75; // 0=instant, 1=never changes; 0.75 feels punchy but not jittery

        source.connect(analyser);
        analyser.connect(audioCtx.destination);

        sound.play();

        // ── Picker setup ──
        var picker = document.getElementById('egg-color-picker');
        picker.style.visibility = 'visible';

        var pickerColor = picker.value; // #808080 default

        picker.addEventListener('input', function () {
            pickerColor = picker.value;
            sound.volume = getBrightness(picker.value);
        });

        // ── Panels + their radial gradient focal points ──
        // Each panel gets a unique origin so they feel distinct when they pulse.
        var panels = [
            { el: document.querySelector('.gr-top'), origin: '50% 50%' },
            { el: document.querySelector('.gr-left'), origin: '50% 50%' },
            { el: document.querySelector('.gr-right'), origin: '50% 50%' }
        ];

        var dataArray = new Uint8Array(analyser.frequencyBinCount); // 128 values, 0-255

        // ── Read bass energy ──
        // Bins 0-7 map to the lowest frequencies (~0-344 Hz at 44.1kHz sample rate).
        // Averaging them gives a number from 0.0 to 1.0 that punches with kick/bass.
        function getBassEnergy() {
            analyser.getByteFrequencyData(dataArray);
            var sum = 0;
            var bassEnd = 8;
            for (var i = 0; i < bassEnd; i++) { sum += dataArray[i]; }
            return sum / (bassEnd * 255);
        }

        // ── Animation loop ──
        function pulse() {
            var energy = getBassEnergy();
            var rgb = hexToRgb(pickerColor);

            // Gradient radius: 15% at silence → up to 120% on a hard beat
            var radius = 2 + energy * 100;

            // Opacity: subtle at low energy, vivid at peak
            var alpha = 0.08 + energy * 1.20;

            panels.forEach(function (panel) {
                panel.el.style.background =
                    'radial-gradient(circle at ' + panel.origin + ', ' +
                    'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ') ' +
                    radius + '%, transparent 100%)';
            });

            requestAnimationFrame(pulse);
        }

        pulse();

        // ── Cleanup on song end: fade panels back to their CSS defaults ──
        sound.addEventListener('ended', function () {
            panels.forEach(function (panel) {
                panel.el.style.background = '';
            });
        });
    }

})();
