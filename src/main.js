import * as THREE from 'three';
import { World } from './World.js';
import { Player } from './Player.js';
import { PortalSystem } from './PortalSystem.js';

// Setup
const container = document.getElementById('game-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88ccff); // Sky color
scene.fog = new THREE.Fog(0x88ccff, 0, 50);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.localClippingEnabled = true;
container.appendChild(renderer.domElement);

// Systems
const world = new World(scene);
const portalSystem = new PortalSystem(scene, camera, renderer);
const player = new Player(scene, camera, renderer.domElement, world, portalSystem);

// Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    portalSystem.handleResize();
});

// Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const deltaTime = Math.min(0.05, clock.getDelta()); // Cap dt to prevent physics explosions

    // 1. Logic
    player.update(deltaTime);
    portalSystem.update(deltaTime);

    // 2. Render Portals (Draws to textures)
    portalSystem.render();

    // 3. Main Render
    renderer.render(scene, camera);
}

animate();