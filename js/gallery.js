(function () {
    var galleryBtn = document.querySelector('.photo-cycle-btn');
    if (!galleryBtn) return;

    var imgs = document.querySelectorAll('.photo-img');
    var dots = document.querySelectorAll('.photo-dot');

    galleryBtn.addEventListener('click', function () {
        var current = Array.from(imgs).findIndex(function (img) {
            return img.classList.contains('active');
        });
        var next = (current + 1) % imgs.length;

        imgs[current].classList.remove('active');
        imgs[next].classList.add('active');
        dots[current].classList.remove('active');
        dots[next].classList.add('active');
    });
})();