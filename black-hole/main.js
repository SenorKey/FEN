/*
 * Stripped-down black hole renderer.
 *
 * Based on the WebGL Schwarzschild black hole simulation by Otto Seiskari:
 * https://github.com/oseiskar/black-hole
 *
 * Copyright (c) 2015 Otto Seiskari, MIT License.
 * Full license text is included in the comment block at the top of index.html.
 */

"use strict";
/* global THREE */

// Distance from the black hole to the observer, in Schwarzschild radii.
// 11.0 matches the original demo's default. Try 6 for closer / scarier;
// stay above ~3 to avoid the photon sphere and weird artifacts.
var OBSERVER_DISTANCE = 11.0;

var camera, scene, renderer, cameraControls;
var material, uniforms;

// The "observer" is the simulated camera position passed to the shader.
// It rides on a sphere of radius OBSERVER_DISTANCE around the origin,
// always pointing at the black hole at (0, 0, 0). When the user drags
// with the mouse, OrbitControls moves the THREE camera around, and we
// mirror that into observer.position / observer.orientation.
var observer = {
    position: new THREE.Vector3(OBSERVER_DISTANCE, 0, 0),
    orientation: new THREE.Matrix3()
};

function degToRad(a) { return Math.PI * a / 180.0; }

// ---- Texture loading -------------------------------------------------------
// All three skymap textures must finish loading before we can start rendering.
(function loadTexturesThenStart() {
    var textures = { galaxy: null, stars: null, spectra: null };
    var texLoader = new THREE.TextureLoader();

    function loadTexture(symbol, filename, interpolation) {
        texLoader.load(filename, function (tex) {
            tex.magFilter = interpolation;
            tex.minFilter = interpolation;
            textures[symbol] = tex;
            checkLoaded();
        });
    }

    function checkLoaded() {
        for (var key in textures) {
            if (textures[key] === null) return;
        }
        init(textures);
        animate();
        var loader = document.getElementById('loader');
        if (loader) loader.style.display = 'none';
    }

    loadTexture('galaxy', 'img/milkyway.jpg', THREE.NearestFilter);
    loadTexture('stars', 'img/stars.png', THREE.LinearFilter);
    loadTexture('spectra', 'img/spectra.png', THREE.LinearFilter);
})();

// ---- Scene setup -----------------------------------------------------------
function init(textures) {
    scene = new THREE.Scene();

    // The whole render is one fullscreen quad. The shader does all the work.
    var geometry = new THREE.PlaneBufferGeometry(2, 2);

    uniforms = {
        resolution: { type: "v2", value: new THREE.Vector2() },
        cam_pos: { type: "v3", value: new THREE.Vector3() },
        cam_x: { type: "v3", value: new THREE.Vector3() },
        cam_y: { type: "v3", value: new THREE.Vector3() },
        cam_z: { type: "v3", value: new THREE.Vector3() },

        galaxy_texture: { type: "t", value: textures.galaxy },
        star_texture: { type: "t", value: textures.stars },
        spectrum_texture: { type: "t", value: textures.spectra }
    };

    var vertexShader = document.getElementById('vertex-shader').textContent;
    var fragmentShader = document.getElementById('fragment-shader').textContent;

    material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    });

    scene.add(new THREE.Mesh(geometry, material));

    renderer = new THREE.WebGLRenderer();
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    camera = new THREE.PerspectiveCamera(
        45, window.innerWidth / window.innerHeight, 1, 80000
    );
    initializeCamera(camera);

    cameraControls = new THREE.OrbitControls(camera, renderer.domElement);
    cameraControls.target.set(0, 0, 0);
    cameraControls.enableZoom = false;  // fixed distance from BH
    cameraControls.enablePan = false;  // no Shift+drag panning
    cameraControls.addEventListener('change', updateCamera);
    updateCamera();

    onWindowResize();
    window.addEventListener('resize', onWindowResize, false);
}

// Set an initial pitch/yaw so we don't start staring straight down a pole.
function initializeCamera(camera) {
    var pitchAngle = 3.0, yawAngle = 0.0;
    camera.matrixWorldInverse.makeRotationX(degToRad(-pitchAngle));
    camera.matrixWorldInverse.multiply(
        new THREE.Matrix4().makeRotationY(degToRad(-yawAngle))
    );
    var m = camera.matrixWorldInverse.elements;
    camera.position.set(m[2], m[6], m[10]);
}

// Translate the THREE camera's view matrix into the shader's expected
// observer frame (y and z swapped — see original code's comment, "nice").
function updateCamera() {
    var m = camera.matrixWorldInverse.elements;

    observer.orientation.set(
        m[0], m[1], m[2],
        m[8], m[9], m[10],
        m[4], m[5], m[6]
    );

    var oe = observer.orientation.elements;
    var p = new THREE.Vector3(oe[6], oe[7], oe[8]);

    observer.position.set(
        -p.x * OBSERVER_DISTANCE,
        -p.y * OBSERVER_DISTANCE,
        -p.z * OBSERVER_DISTANCE
    );
}

function updateUniforms() {
    uniforms.resolution.value.x = renderer.domElement.width;
    uniforms.resolution.value.y = renderer.domElement.height;
    uniforms.cam_pos.value.copy(observer.position);

    var e = observer.orientation.elements;
    uniforms.cam_x.value.set(e[0], e[1], e[2]);
    uniforms.cam_y.value.set(e[3], e[4], e[5]);
    uniforms.cam_z.value.set(e[6], e[7], e[8]);
}

function onWindowResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    updateUniforms();
}

// ---- Render loop -----------------------------------------------------------
// Nothing animates on its own — we only re-render when the user drags.
// This keeps the GPU idle when nothing is changing.
function frobeniusDistance(a, b) {
    var sum = 0.0;
    for (var i in a.elements) {
        var diff = a.elements[i] - b.elements[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}

var lastCameraMat = new THREE.Matrix4().identity();

function animate() {
    requestAnimationFrame(animate);

    camera.updateMatrixWorld();
    camera.matrixWorldInverse.getInverse(camera.matrixWorld);

    if (frobeniusDistance(camera.matrixWorldInverse, lastCameraMat) > 1e-10) {
        updateUniforms();
        renderer.render(scene, camera);
        lastCameraMat = camera.matrixWorldInverse.clone();
    }
}