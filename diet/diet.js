(function () {

    var items = document.querySelectorAll('.reset-item');
    var fill = document.getElementById('progressFill');
    var label = document.getElementById('progressLabel');
    var total = items.length;

    function updateProgress() {
        var checked = document.querySelectorAll('.reset-item.checked').length;
        var pct = (checked / total) * 100;
        fill.style.width = pct + '%';
        label.textContent = checked + ' / ' + total + ' complete';
    }

    items.forEach(function (item) {
        item.addEventListener('click', function () {
            var isChecked = !item.classList.contains('checked');
            item.classList.toggle('checked');
            item.setAttribute('aria-checked', isChecked ? 'true' : 'false');
            updateProgress();
        });

        item.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                item.click();
            }
        });
    });

})();