(function () {

    var btn = document.querySelector('.phone-cycle-btn');
    if (btn) {
        btn.addEventListener('click', function () {
            var imgs = document.querySelectorAll('.phone-img');
            var dots = document.querySelectorAll('.phone-dot');
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

})();