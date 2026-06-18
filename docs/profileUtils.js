const BIO_MAX_LEN = 256;
const palette = new Uint8Array(9); // 3 cores RGB

// Mink Drawing
function hex2rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [
        (n>>16) &0xff, 
        (n>>8)  &0xff, 
        n       &0xff
    ];
}


function updatePalette(i, hex) {
    const [r, g, b] = hex2rgb(hex);
    palette[3*i]     = r;
    palette[3*i + 1] = g;
    palette[3*i + 2] = b;
}


function P2rgb(i) {
    return `rgb(${palette[i*3]},${palette[i*3+1]},${palette[i*3+2]})`;
}


function loadImage(src) {
    return new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.src = src;
    });
}


const C = document.getElementById('pfp-canvas');
const ctx = C.getContext('2d');

(async () => {
    const [layer0, layer1, layer2, outline] = await Promise.all([
            loadImage('pfp/secondFur.png'),
            loadImage('pfp/mainFur.png'),
            loadImage('pfp/bg&eyes.png'),
            loadImage('pfp/outline.png'),
    ]);

    function inPaint(img, color) {
        const { width: w, height: h } = C;
        const off = new OffscreenCanvas(w, h);
        const oc = off.getContext('2d');
        oc.drawImage(img, 0, 0, w, h);
        oc.globalCompositeOperation = 'source-atop';
        oc.fillStyle = color;
        oc.fillRect(0, 0, w, h);
        ctx.drawImage(off, 0, 0);
    }

    function render() {
        const { width: w, height: h } = C;
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
        ctx.clip();
        inPaint(layer0, P2rgb(0));
        inPaint(layer1, P2rgb(1));
        inPaint(layer2, P2rgb(2));
        ctx.drawImage(outline, 0, 0, w, h);
        ctx.restore();
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

    document.getElementById('save-colors').addEventListener('click', () => {
        console.log('Paleta:', palette);
        alert(`Array de cores: ${Array.from(palette)}`);
    });

    render();
})();



// Bio
const minkPopupBtn  = document.getElementById('profile-btn');
const inspector     = document.querySelector('.inspector');
const profileName   = document.getElementById('profile-name');
const bioView       = document.querySelector('.bio-view');
const bioText       = document.getElementById('bio-text');
const bioSection    = document.querySelector('.bio-section');
const editBioBtn    = document.getElementById('edit-bio-btn');

const bioInput      = document.getElementById('bio-input');
const bioCount      = document.getElementById('bio-count');
const saveBioBtn    = document.getElementById('save-bio');
const USER_ID       = localStorage.getItem('user_id');

profileName.textContent = localStorage.getItem('username') || 'Usuário';

function toggleInspector() {
    inspector.classList.toggle('is-hidden');
}

C.addEventListener('click', toggleInspector);
minkPopupBtn.addEventListener('click', toggleInspector);

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