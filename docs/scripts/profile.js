const USER_ID     = localStorage.getItem('user_id');
const BIO_MAX_LEN = 256;
const palette = new Uint8Array(9);

function updatePalette(i, hex) {
    const [r, g, b] = hex2rgb(hex);
    palette[3*i]     = r;
    palette[3*i + 1] = g;
    palette[3*i + 2] = b;
}

const C = document.getElementById('pfp-canvas');

(async () => {
    const layers = await loadMinkLayers();

    const previewC   = document.getElementById('pfp-preview');
    const previewCtx = previewC.getContext('2d');

    function render() {
        renderMink(C, palette, layers, { circular: true });

        const pw = previewC.width, ph = previewC.height;
        previewCtx.clearRect(0, 0, pw, ph);
        previewCtx.save();
        previewCtx.beginPath();
        previewCtx.arc(pw/2, ph/2, Math.min(pw,ph)/2, 0, Math.PI*2);
        previewCtx.clip();
        previewCtx.drawImage(C, 0, 0, pw, ph);
        previewCtx.restore();
    }

    [0, 1, 2].forEach(i => {
        const el = document.getElementById(`color${i}`);
        updatePalette(i, el.value);
        el.addEventListener('input', e => {
            updatePalette(i, e.target.value);
            render();
        });
    });

    document.getElementById('save-file').addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = C.toDataURL('image/png');
        a.download = 'myMink.png';
        a.click();
    });

    document.getElementById('save-colors').addEventListener('click', async () => {
        if (!USER_ID) {
            toast('Faça login primeiro.');
            return;
        }

        try {
            await apiFetch(`/users/${USER_ID}/colors`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    colors: Array.from(palette)
                })
            });

            toast('Mink salvo!');
            closeInspector();

        } catch {
            toast('Erro ao salvar Mink.');
        }
    });

    if (USER_ID) {
        try {
            const data = await apiFetch(`/users/${USER_ID}/colors`);

            if (data.mink_colors) {
                const c = data.mink_colors;

                const hex0 = rgb2hex(c[0], c[1], c[2]);
                const hex1 = rgb2hex(c[3], c[4], c[5]);
                const hex2 = rgb2hex(c[6], c[7], c[8]);

                document.getElementById('color0').value = hex0;
                document.getElementById('color1').value = hex1;
                document.getElementById('color2').value = hex2;

                updatePalette(0, hex0);
                updatePalette(1, hex1);
                updatePalette(2, hex2);
            }
        } catch {
            console.error('Failed to load Mink colors');
        }
    }

    render();
})();

const inspector = document.getElementById('inspector-modal');
const backdrop  = document.getElementById('inspector-backdrop');
const closeBtn  = document.getElementById('inspector-close');

function openInspector() {
    inspector.style.removeProperty('display');
    backdrop.style.removeProperty('display');

    inspector.classList.remove('is-hidden');
    backdrop.classList.remove('is-hidden');

    document.body.style.overflow = 'hidden';
    closeBtn.focus();
}

function closeInspector() {
    inspector.classList.add('is-hidden');
    backdrop.classList.add('is-hidden');
    document.body.style.overflow = '';
}

C.addEventListener('click', openInspector);
document.getElementById('profile-btn').addEventListener('click', openInspector);

closeBtn.addEventListener('click', closeInspector);
backdrop.addEventListener('click', closeInspector);
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !inspector.classList.contains('is-hidden')) closeInspector();
});


// Bio
const profileName = document.getElementById('profile-name');
const bioView     = document.querySelector('.bio-view');
const bioText     = document.getElementById('bio-text');
const bioSection  = document.querySelector('.bio-section');
const editBioBtn  = document.getElementById('edit-bio-btn');
const bioInput    = document.getElementById('bio-input');
const bioCount    = document.getElementById('bio-count');
const saveBioBtn  = document.getElementById('save-bio');

profileName.textContent = localStorage.getItem('username') || 'Usuário';

editBioBtn.addEventListener('click', () => {
    bioView.classList.add('is-hidden');
    bioSection.classList.remove('is-hidden');
});

function updateBioCount() {
    bioCount.textContent = `${bioInput.value.length}/${BIO_MAX_LEN}`;
}

if (USER_ID) {
    apiFetch(`/users/${USER_ID}/bio`).then(data => {
        bioInput.value = data.bio || '';
        bioText.textContent = data.bio || 'Sem bio ainda.';
        updateBioCount();
    });
}

bioInput.addEventListener('input', updateBioCount);

saveBioBtn.addEventListener('click', () => {
    if (!USER_ID) return toast('Faça login para salvar sua bio.');

    apiFetch(`/users/${USER_ID}/bio`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: bioInput.value }),
    }).then(() => {
        toast('Bio salva!');
        bioText.textContent = bioInput.value || 'Sem bio ainda.';
        bioSection.classList.add('is-hidden');
        bioView.classList.remove('is-hidden');
    });
});

async function loadProfileStats() {
    if (!USER_ID) return;

    try {
        const [followers, followings, likes, posts] = await Promise.all([
            apiFetch(`/users/${USER_ID}/followers`),
            apiFetch(`/users/${USER_ID}/followings`),
            apiFetch(`/users/${USER_ID}/likes_received`),
            apiFetch(`/posts/user/${USER_ID}`),
        ]);

        document.getElementById('followers-count').textContent =
            followers.length;

        document.getElementById('following-count').textContent =
            followings.length;

        document.getElementById('likes-count').textContent =
            likes.likes;

        const postsContainer =
            document.getElementById('user-posts');

        postsContainer.innerHTML = posts.map(post => `
            <article class="post-card">
                <p>${escHtml(post.content)}</p>
                <small> Curtidas: ${post.likes_count || 0}</small>
            </article>
        `).join('');

    } catch (err) {
        console.error(err);
    }
}

loadProfileStats();

if (USER_ID) initChat(USER_ID);

	document.getElementById("exit-btn").addEventListener("click", handleExit);