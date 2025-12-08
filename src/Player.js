import * as THREE from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import nipplejs from 'nipplejs';

export class Player {
    constructor(scene, camera, domElement, world, portalSystem) {
        this.scene = scene;
        this.camera = camera;
        this.domElement = domElement;
        this.world = world;
        this.portalSystem = portalSystem;

        // Physics
        this.playerVelocity = new THREE.Vector3();
        this.playerDirection = new THREE.Vector3();
        this.playerOnFloor = false;
        this.gravity = 30;

        // Capsule: radius 0.35, length 1 (total height 1.7)
        this.playerCollider = new Capsule(
            new THREE.Vector3(0, 0.35, 0),
            new THREE.Vector3(0, 1.35, 0),
            0.35
        );

        // Input State
        this.keyStates = {};
        this.moveInput = { x: 0, y: 0 }; // From WASD or Joystick
        this.lookInput = { x: 0, y: 0 }; // From Mouse or Touch Drag

        // Camera State
        this.pitch = 0;
        this.yaw = 0;

        this.initInput();
        this.initMobileControls();
    }

    initInput() {
        document.addEventListener('keydown', (event) => {
            this.keyStates[event.code] = true;
            if(event.code === 'Space') this.jump();
        });
        document.addEventListener('keyup', (event) => {
            this.keyStates[event.code] = false;
        });

        // Mouse Look
        document.body.addEventListener('mousemove', (event) => {
            if (document.pointerLockElement === document.body) {
                this.yaw -= event.movementX * 0.002;
                this.pitch -= event.movementY * 0.002;
                this.clampPitch();
            }
        });

        document.addEventListener('mousedown', (event) => {
            if (this.isMobile()) return;

            if (document.pointerLockElement !== document.body) {
                document.body.requestPointerLock();
            } else {
                if (event.button === 0) {
                    this.shootPortal('blue');
                } else if (event.button === 2) {
                    this.shootPortal('orange');
                }
            }
        }); 
        
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    isMobile() {
        return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    }

    initMobileControls() {
        if (!this.isMobile()) return;

        const mobileControls = document.getElementById('mobile-controls');
        mobileControls.style.display = 'block';
        document.getElementById('instructions').style.display = 'none';

        // Joystick (Left)
        const zoneMove = document.getElementById('zone-move');
        const joystickManager = nipplejs.create({
            zone: zoneMove,
            mode: 'static', 
            position: { left: '50%', top: '50%' },
            color: 'white'
        });

        joystickManager.on('move', (evt, data) => {
            const forward = data.vector.y;
            const turn = data.vector.x;
            this.moveInput.x = turn;
            this.moveInput.y = forward;
        });

        joystickManager.on('end', () => {
            this.moveInput.x = 0;
            this.moveInput.y = 0;
        });

        // Touch Look (Right)
        const zoneLook = document.getElementById('zone-look');
        let lastTouchX = 0;
        let lastTouchY = 0;

        zoneLook.addEventListener('touchstart', (e) => {
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
        }, {passive: false});

        zoneLook.addEventListener('touchmove', (e) => {
            e.preventDefault(); 
            const touchX = e.touches[0].clientX;
            const touchY = e.touches[0].clientY;
            
            const deltaX = touchX - lastTouchX;
            const deltaY = touchY - lastTouchY;
            
            this.yaw -= deltaX * 0.005;
            this.pitch -= deltaY * 0.005;
            this.clampPitch();

            lastTouchX = touchX;
            lastTouchY = touchY;
        }, {passive: false});

        // Buttons
        document.getElementById('btn-blue').addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.shootPortal('blue');
        });
        document.getElementById('btn-orange').addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.shootPortal('orange');
        });
    }

    clampPitch() {
        this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    }

    jump() {
        if (this.playerOnFloor) {
            this.playerVelocity.y = 10;
        }
    }

    shootPortal(type) {
        // Raycast from camera center
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        
        // Get walls from world
        const intersects = raycaster.intersectObjects(this.world.getColliders());
        
        if (intersects.length > 0) {
            const hit = intersects[0];
            if (hit.object.userData.isWall) {
                // Play Sound
                const audio = new Audio('portal_shoot.mp3');
                audio.volume = 0.3;
                audio.play().catch(()=>{});

                this.portalSystem.placePortal(type, hit.point, hit.face.normal, hit.object);
            }
        }
    }

    update(deltaTime) {
        // Process Input
        let speed = 15; // Ground speed
        if (!this.playerOnFloor) speed = 8; // Air control

        // Reset delta move
        const moveVector = new THREE.Vector3();

        if (this.isMobile()) {
            moveVector.z = this.moveInput.y;
            moveVector.x = this.moveInput.x;
        } else {
            if (this.keyStates['KeyW']) moveVector.z = 1;
            if (this.keyStates['KeyS']) moveVector.z = -1;
            if (this.keyStates['KeyA']) moveVector.x = -1;
            if (this.keyStates['KeyD']) moveVector.x = 1;
        }

        moveVector.normalize(); 
        
        // Get forward/right vectors flattened to XZ plane
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, this.yaw, 0));
        const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, this.yaw, 0));

        // Apply input to velocity (with damping)
        const damping = Math.exp(-4 * deltaTime) - 1;
        if (this.playerOnFloor) {
            this.playerVelocity.addScaledVector(this.playerVelocity, damping);
        } else {
             this.playerVelocity.addScaledVector(this.playerVelocity, damping * 0.1); // Less drag in air
        }

        const inputAccel = forward.multiplyScalar(moveVector.z).add(right.multiplyScalar(moveVector.x)).multiplyScalar(speed * deltaTime * 5);
        this.playerVelocity.add(inputAccel);

        // Gravity
        this.playerVelocity.y -= this.gravity * deltaTime;

        // Capture start position before move
        const startPos = new THREE.Vector3();
        this.playerCollider.getCenter(startPos);

        // Apply Velocity
        const deltaPosition = this.playerVelocity.clone().multiplyScalar(deltaTime);
        this.playerCollider.translate(deltaPosition);

        // Capture end position after move
        const endPos = new THREE.Vector3();
        this.playerCollider.getCenter(endPos);

        // Check Portal Teleport
        const teleportRotDelta = this.portalSystem.checkTeleport(this.playerCollider, startPos, endPos, this.playerVelocity);
        
        if (teleportRotDelta) {
            // Adjust Yaw based on quaternion delta
            const direction = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, this.yaw, 0));
            direction.applyQuaternion(teleportRotDelta);
            
            // Extract new yaw from direction
            const newYaw = Math.atan2(-direction.x, -direction.z);
            this.yaw = newYaw;
            
            // Re-sync camera
            this.updateCamera();
            return; // Skip collision this frame
        }

        // Collision with World
        this.playerOnFloor = false;
        this.collisionDetection(deltaTime);

        // Update Camera
        this.updateCamera();
    }

    collisionDetection(dt) {
        // Simple sphere collisions against boxes
        // For a robust system we'd use Octree, but for this specific "World" with known boxes:
        const colliders = this.world.getColliders();
        
        // We primarily check the bottom sphere (feet) to prevent falling
        const pPos = this.playerCollider.start.clone();
        const pRadius = this.playerCollider.radius;

        // Capture center for portal hole check
        const pCenter = new THREE.Vector3();
        this.playerCollider.getCenter(pCenter);

        // Ground/Wall check
        for (const mesh of colliders) {
            // Skip collision if this is a wall with an active portal we are walking into
            // This allows us to stand 'inside' the wall/portal frame
            if (mesh.userData.isWall && !this.portalSystem.shouldCollide(mesh, pCenter)) {
                continue;
            }

            // Simplified Box3 collision
            const box = new THREE.Box3().setFromObject(mesh);
            const closestPoint = new THREE.Vector3();
            box.clampPoint(pPos, closestPoint);
            
            const delta = pPos.clone().sub(closestPoint);
            let dist = delta.length();
            let normal = null;
            let overlap = 0;
            
            // Handle being inside the box (Tunneling fix)
            if (dist < 0.0001 && box.containsPoint(pPos)) {
                 const dx = Math.min(Math.abs(pPos.x - box.min.x), Math.abs(box.max.x - pPos.x));
                 const dy = Math.min(Math.abs(pPos.y - box.min.y), Math.abs(box.max.y - pPos.y));
                 const dz = Math.min(Math.abs(pPos.z - box.min.z), Math.abs(box.max.z - pPos.z));
                 
                 const minAxis = Math.min(dx, dy, dz);
                 normal = new THREE.Vector3();
                 
                 if (minAxis === dy) normal.y = (Math.abs(pPos.y - box.max.y) < Math.abs(pPos.y - box.min.y)) ? 1 : -1;
                 else if (minAxis === dx) normal.x = (Math.abs(pPos.x - box.max.x) < Math.abs(pPos.x - box.min.x)) ? 1 : -1;
                 else normal.z = (Math.abs(pPos.z - box.max.z) < Math.abs(pPos.z - box.min.z)) ? 1 : -1;
                 
                 overlap = minAxis + pRadius;
            } else if (dist < pRadius) {
                 normal = delta.normalize();
                 overlap = pRadius - dist;
            }

            if (normal) {
                // Push out
                const correction = normal.clone().multiplyScalar(overlap);
                this.playerCollider.translate(correction);
                pPos.add(correction);
                
                // Adjust velocity
                // If hitting floor (normal.y > 0.5)
                if (normal.y > 0.5) {
                    this.playerOnFloor = true;
                    this.playerVelocity.y = Math.max(0, this.playerVelocity.y);
                } else if (normal.y < -0.5) {
                    this.playerVelocity.y = Math.min(0, this.playerVelocity.y);
                }
                
                // Project velocity onto plane for sliding
                const vDotN = this.playerVelocity.dot(normal);
                const project = normal.multiplyScalar(vDotN);
                this.playerVelocity.sub(project);
            }
        }
        
        // Floor reset if falling infinitely
        const center = new THREE.Vector3();
        this.playerCollider.getCenter(center);
        if (center.y < -20) {
            this.playerCollider.start.set(0, 0.35, 0);
            this.playerCollider.end.set(0, 1.35, 0);
            this.playerVelocity.set(0, 0, 0);
        }
    }

    updateCamera() {
        const camPos = new THREE.Vector3();
        this.playerCollider.getCenter(camPos);
        camPos.y += 0.5; // Eye height
        this.camera.position.copy(camPos);
        this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }
}