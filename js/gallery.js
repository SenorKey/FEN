(function () {
    var galleryBtn = document.querySelector('.photo-cycle-btn');
    if (!galleryBtn) return;

    var imgs = document.querySelectorAll('.photo-img');
    var dots = document.querySelectorAll('.photo-dot');
    var frame = document.querySelector('.photo-frame');
    var autoDelay = 3000;
    var autoTimer = null;

    function updateFrameRatio(img) {
        if (img.naturalWidth && img.naturalHeight) {
            frame.style.aspectRatio = img.naturalWidth + ' / ' + img.naturalHeight;
        }
    }

    // Set initial ratio from the active image
    var activeImg = document.querySelector('.photo-img.active');
    if (activeImg) {
        if (activeImg.complete) {
            updateFrameRatio(activeImg);
        } else {
            activeImg.addEventListener('load', function () {
                updateFrameRatio(activeImg);
            });
        }
    }

    function advance() {
        var current = Array.from(imgs).findIndex(function (img) {
            return img.classList.contains('active');
        });
        var next = (current + 1) % imgs.length;

        imgs[current].classList.remove('active');
        imgs[next].classList.add('active');
        dots[current].classList.remove('active');
        dots[next].classList.add('active');

        // Adapt frame to new image's natural shape
        if (imgs[next].complete) {
            updateFrameRatio(imgs[next]);
        } else {
            imgs[next].addEventListener('load', function () {
                updateFrameRatio(imgs[next]);
            });
        }
    }

    function startAuto() {
        clearInterval(autoTimer);
        autoTimer = setInterval(advance, autoDelay);
    }

    galleryBtn.addEventListener('click', function () {
        advance();
        clearInterval(autoTimer); // user took control, stop auto-cycling
    });

    startAuto();
})();