// Carregamento e desenho do avatar "Mink". Usado tanto no editor de perfil
// (canvas grande, recortado em círculo) quanto nos avatares pequenos do feed.

const MINK_LAYER_SRCS = [
    'pfp/secondFur.png',
    'pfp/mainFur.png',
    'pfp/bg&eyes.png',
    'pfp/outline.png',
];

let minkLayersPromise = null;

// Carrega as 4 camadas uma única vez e reaproveita a mesma promise
// em todas as chamadas seguintes.
function loadMinkLayers() {
    if (!minkLayersPromise) {
        minkLayersPromise = Promise.all(MINK_LAYER_SRCS.map(loadImage));
    }
    return minkLayersPromise;
}

function hex2rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [
        (n >> 16) & 0xff,
        (n >> 8)  & 0xff,
        n         & 0xff,
    ];
}

function rgb2hex(r, g, b) {
    return "#" + [r, g, b]
        .map(v => v.toString(16).padStart(2, "0"))
        .join("");
}

function paintLayer(targetCtx, img, w, h, rgb) {
    const tmp = document.createElement("canvas");
    tmp.width  = w;
    tmp.height = h;

    const tctx = tmp.getContext("2d");
    tctx.drawImage(img, 0, 0, w, h);
    tctx.globalCompositeOperation = "source-atop";
    tctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    tctx.fillRect(0, 0, w, h);

    targetCtx.drawImage(tmp, 0, 0);
}

// colors: 9 valores [r0,g0,b0, r1,g1,b1, r2,g2,b2] (array comum ou Uint8Array)
// layers: [secondFur, mainFur, bgEyes, outline], vindos de loadMinkLayers()
// options.circular: recorta o resultado em círculo (usado no editor de perfil)
function renderMink(canvas, colors, layers, { circular = false } = {}) {
    if (!colors || !layers || !canvas) return;

    const { width: w, height: h } = canvas;
    const ctx = canvas.getContext("2d");
    const [layer0, layer1, layer2, outline] = layers;

    const off = document.createElement("canvas");
    off.width  = w;
    off.height = h;
    const offCtx = off.getContext("2d");

    paintLayer(offCtx, layer0, w, h, colors.slice(0, 3));
    paintLayer(offCtx, layer1, w, h, colors.slice(3, 6));
    paintLayer(offCtx, layer2, w, h, colors.slice(6, 9));
    offCtx.drawImage(outline, 0, 0, w, h);

    ctx.clearRect(0, 0, w, h);

    if (circular) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(off, 0, 0);
        ctx.restore();
    } else {
        ctx.drawImage(off, 0, 0);
    }
}