(function () {



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

    function hueToHex(h) {
        // h is 0–360, full saturation, full brightness
        var s = 1, v = 1;
        var c = v * s;
        var x = c * (1 - Math.abs((h / 60) % 2 - 1));
        var r, g, b;
    
        if      (h < 60)  { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else              { r = c; g = 0; b = x; }
    
        var toHex = function (n) {
            var hex = Math.round(n * 255).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
    
        return '#' + toHex(r) + toHex(g) + toHex(b);
    }

    // ── Completion handler ───────────────────────────────────

    function onVolumeComplete() {
        document.querySelector('.nav-home').textContent = 'FE!N';
        document.querySelector('.page-title').innerHTML = 'Front End<br>!nsertion Needed';
        document.querySelector('.nav-etc').classList.add('egg-revealed');
        var frame = document.querySelector('.photo-frame');
        frame.innerHTML = '<img class="photo-img active" src="/images/gallery/durag.webp" alt="me">';
        

        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        var audioCtx = new AudioCtx();

        // ── Three audio elements ──
        var soundFull = new Audio('/audio/durag.mp3');
        var soundVocals = new Audio('/audio/durag-vocals.mp3');
        var soundBass = new Audio('/audio/durag-bass.mp3');
        var soundDrums = new Audio('/audio/durag-drums.mp3');


        soundFull.volume = 0.6;  // audible

        // ── Build source → analyser → gain → destination for each track ──
        function buildChain(sound, muted) {
            var source = audioCtx.createMediaElementSource(sound);
            var analyser = audioCtx.createAnalyser();
            var gain = audioCtx.createGain();

            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.75;

            gain.gain.value = muted ? 0 : 1;

            source.connect(analyser);
            analyser.connect(gain);
            gain.connect(audioCtx.destination);

            return { analyser: analyser, gain: gain };
        }

        var chainFull = buildChain(soundFull, false);
        var chainVocals = buildChain(soundVocals, true);
        var chainBass = buildChain(soundBass, true);
        var chainDrums = buildChain(soundDrums, true);

        // ── Start all three as close together as possible ──
        soundFull.play();
        soundVocals.play();
        soundBass.play();
        soundDrums.play();

        // ── Picker setup ──
        var picker = document.getElementById('egg-color-picker');
        picker.style.visibility = 'visible';
        document.getElementById('egg-picker-label').style.visibility = 'visible';

        var pickerColor = picker.value;
        var autoCycle = true;
        var hue = 0;
        picker.addEventListener('input', function () {
            autoCycle = false;
            pickerColor = picker.value;
            chainFull.gain.gain.value = getBrightness(picker.value);
        });

        // ── Panels mapped to their respective analysers ──
        var panels = [
            { el: document.querySelector('.gr-top'), analyser: chainVocals.analyser, origin: '50% 50%' },
            { el: document.querySelector('.gr-left'), analyser: chainBass.analyser, origin: '50% 50%' },
            { el: document.querySelector('.gr-right'), analyser: chainDrums.analyser, origin: '50% 50%' }
        ];

        // ── Bass energy helper (reusable per analyser) ──
        function getBassEnergy(analyser) {
            var dataArray = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(dataArray);
            var sum = 0;
            var bassEnd = 8;
            for (var i = 0; i < bassEnd; i++) { sum += dataArray[i]; }
            return sum / (bassEnd * 255);
        }

        // ── Animation loop ──
        function pulse() {
            if (autoCycle) {
                hue = (hue + 0.3) % 360;
                var hex = hueToHex(hue);
                picker.value = hex;
                pickerColor = hex;
                chainFull.gain.gain.value = getBrightness(hex);
            }
        
            var rgb = hexToRgb(pickerColor);
        
            panels.forEach(function (panel) {
                var energy = getBassEnergy(panel.analyser);
                var radius = 2 + energy * 100;
                var alpha = 0.08 + energy * 1.20;
        
                panel.el.style.background =
                    'radial-gradient(circle at ' + panel.origin + ', ' +
                    'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ') ' +
                    radius + '%, transparent 100%)';
            });
        
            requestAnimationFrame(pulse);
        }

        pulse();

        // ── Cleanup on song end ──
        soundFull.addEventListener('ended', function () {
            panels.forEach(function (panel) {
                panel.el.style.background = '';
            });
        });
    }

})();
