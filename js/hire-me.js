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

    var input = document.getElementById('chatInput');
    var btn = document.getElementById('chatSend');
    var scroll = document.getElementById('chatScroll');

    var history = [];

    function addMessage(text, role) {
        var div = document.createElement('div');
        div.className = 'chat-msg ' + (role === 'user' ? 'chat-user' : 'chat-ai');
        var p = document.createElement('p');
        p.className = 'body-text';
        p.textContent = text;
        div.appendChild(p);
        scroll.appendChild(div);
        scroll.scrollTop = scroll.scrollHeight;
        return div;
    }

    function addTyping() {
        var div = document.createElement('div');
        div.className = 'chat-typing';
        div.innerHTML = '<span></span><span></span><span></span>';
        scroll.appendChild(div);
        scroll.scrollTop = scroll.scrollHeight;
        return div;
    }

    function setEnabled(on) {
        input.disabled = !on;
        btn.disabled = !on;
    }

    async function send() {
        var text = input.value.trim();
        if (!text) return;

        addMessage(text, 'user');
        input.value = '';
        setEnabled(false);

        history.push({ role: 'user', content: text });
        history = history.slice(-20);

        var typing = addTyping();

        try {
            var res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'llama3',
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT }
                    ].concat(history),
                    stream: false
                })
            });

            var data = await res.json();
            var reply = data.message && data.message.content
                ? data.message.content
                : 'Sorry, something went wrong. Try again.';

            history.push({ role: 'assistant', content: reply });
            history = history.slice(-20);

            typing.remove();
            addMessage(reply, 'assistant');
        } catch (err) {
            typing.remove();
            addMessage('Could not reach the AI right now. Try again in a moment.', 'assistant');
        }

        setEnabled(true);
        input.focus();
    }

    btn.addEventListener('click', send);
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') send();
    });

})();