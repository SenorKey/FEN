# Stripped-down black hole renderer

A minimal, no-GUI fork of [oseiskar/black-hole](https://github.com/oseiskar/black-hole)
showing only the Schwarzschild black hole and skymap. Drag with the mouse to rotate.

## What's in this folder

- `index.html` — replaces the original `index.html`
- `main.js` — replaces the original `main.js`

## What you need to copy from your existing clone

Inside `~/projects/black-hole/` you should already have these. Copy them next
to the two files above so the layout looks like:

```
your-folder/
├── index.html        (new, from this bundle)
├── main.js           (new, from this bundle)
├── js-libs/
│   ├── three.min.js          (copy from clone)
│   └── OrbitControls.js      (copy from clone)
└── img/
    ├── milkyway.jpg          (copy from clone)
    ├── stars.png             (copy from clone)
    └── spectra.png           (copy from clone)
```

## What you can ignore from the clone

Not needed: `js-libs/jquery-2.1.4.min.js`, `js-libs/dat.gui.min.js`,
`js-libs/mustache.min.js`, `js-libs/ShaderLoader.min.js`, `js-libs/Detector.js`,
`js-libs/stats.min.js`, `three-js-monkey-patch.js`, `style.css`, `raytracer.glsl`
(its content is now inlined inside `index.html`), and the `img/beach-ball.png`
and `img/accretion-disk.png` textures.

## How to run

Same as before:

```bash
cd path/to/your-folder
python3 -m http.server 8080
```

Then open `http://localhost:8080/`.

## Things you might want to tweak

- **Camera distance**: change `OBSERVER_DISTANCE` near the top of `main.js`.
  11 is the original default. 6–8 looks more dramatic; below 3 you'll be
  inside the photon sphere and weird things happen.
- **Quality**: change `const int NSTEPS = 100;` in the fragment shader inside
  `index.html`. 200 = "high" (slower), 40 = "fast" (uglier but smooth on
  weak GPUs).
- **Skymap rotation**: change the `45.0` in `mat3 BG_COORDS = ROT_Y(45.0 * DEG_TO_RAD);`
  to spin which part of the Milky Way faces you.
- **Field of view**: change `FOV_ANGLE_DEG` in the fragment shader.

## Attribution

Code is MIT licensed (Otto Seiskari, 2015). The skymap image is CC-BY-NC 2.0
(Stellarium / Nick Risinger). If you publish this on a commercial site,
swap the milkyway.jpg for a CC-BY or public-domain skymap.