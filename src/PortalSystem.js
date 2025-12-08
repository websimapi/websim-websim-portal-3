import * as THREE from 'three';

export class PortalSystem {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.playerCamera = camera;
        this.renderer = renderer;
        
        this.portals = {
            blue: this.createPortalMesh(0x00aaff),
            orange: this.createPortalMesh(0xffaa00)
        };
        
        this.renderTargets = {
            blue: new THREE.WebGLRenderTarget(window.innerWidth / 2, window.innerHeight / 2, {
                type: THREE.HalfFloatType
            }),
            orange: new THREE.WebGLRenderTarget(window.innerWidth / 2, window.innerHeight / 2, {
                type: THREE.HalfFloatType
            })
        };

        // Screen-space texture projection shader
        const shader = {
            vertexShader: `
                varying vec4 vPos;
                void main() {
                    vPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    gl_Position = vPos;
                }
            `,
            fragmentShader: `
                uniform sampler2D map;
                uniform vec2 resolution;
                void main() {
                    vec2 uv = gl_FragCoord.xy / resolution;
                    gl_FragColor = texture2D(map, uv);
                }
            `
        };

        this.materials = {
            blue: new THREE.ShaderMaterial({
                uniforms: {
                    map: { value: this.renderTargets.blue.texture },
                    resolution: { value: new THREE.Vector2() }
                },
                vertexShader: shader.vertexShader,
                fragmentShader: shader.fragmentShader
            }),
            orange: new THREE.ShaderMaterial({
                uniforms: {
                    map: { value: this.renderTargets.orange.texture },
                    resolution: { value: new THREE.Vector2() }
                },
                vertexShader: shader.vertexShader,
                fragmentShader: shader.fragmentShader
            })
        };

        // Set initial resolution
        const size = new THREE.Vector2();
        this.renderer.getDrawingBufferSize(size);
        this.materials.blue.uniforms.resolution.value.copy(size);
        this.materials.orange.uniforms.resolution.value.copy(size);

        this.portalCam = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
        this.tempMatrix = new THREE.Matrix4();
        
        this.helperVec3 = new THREE.Vector3();
        this.helperBox3 = new THREE.Box3();
    }

    handleResize() {
        const size = new THREE.Vector2();
        this.renderer.getDrawingBufferSize(size);
        
        this.renderTargets.blue.setSize(size.width / 2, size.height / 2);
        this.renderTargets.orange.setSize(size.width / 2, size.height / 2);
        
        this.materials.blue.uniforms.resolution.value.copy(size);
        this.materials.orange.uniforms.resolution.value.copy(size);
    }

    createPortalMesh(color) {
        // Portal is a simple plane for now
        const geometry = new THREE.PlaneGeometry(2, 3.5);
        const material = new THREE.MeshBasicMaterial({ color: color });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.visible = false;
        mesh.userData.isPortal = true;
        mesh.userData.active = false;
        
        // Add a border
        const borderGeo = new THREE.RingGeometry(1, 1.1, 32); // Slightly flawed logic for a rectangular portal, let's use EdgesGeometry
        const edges = new THREE.EdgesGeometry(geometry);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: color, linewidth: 4 }));
        mesh.add(line);
        
        this.scene.add(mesh);
        return mesh;
    }

    placePortal(type, point, normal, wall) {
        const portal = this.portals[type];
        
        // Offset slightly from wall to prevent z-fighting
        const pos = point.clone().add(normal.clone().multiplyScalar(0.02));
        
        portal.position.copy(pos);
        
        // Orient portal to face away from wall
        portal.lookAt(pos.clone().add(normal));
        
        portal.visible = true;
        portal.userData.active = true;
        portal.userData.normal = normal;
        portal.userData.wall = wall;
        
        // If both portals are active, switch materials to render targets
        if (this.portals.blue.userData.active && this.portals.orange.userData.active) {
            this.portals.blue.material = this.materials.blue;
            this.portals.orange.material = this.materials.orange;
        }
    }

    render() {
        if (!this.portals.blue.userData.active || !this.portals.orange.userData.active) return;

        // Save current renderer state
        const currentRenderTarget = this.renderer.getRenderTarget();
        const currentXrEnabled = this.renderer.xr.enabled;
        this.renderer.xr.enabled = false;

        this.renderPortalView('blue', 'orange');
        this.renderPortalView('orange', 'blue');

        // Restore state
        this.renderer.setRenderTarget(currentRenderTarget);
        this.renderer.xr.enabled = currentXrEnabled;
    }

    renderPortalView(sourceName, destName) {
        const sourcePortal = this.portals[sourceName];
        const destPortal = this.portals[destName];
        const renderTarget = this.renderTargets[sourceName];

        // 1. Calculate Virtual Camera Matrix
        const rotationY180 = new THREE.Matrix4().makeRotationY(Math.PI);
        
        const relativeMatrix = sourcePortal.matrixWorld.clone().invert().multiply(this.playerCamera.matrixWorld);
        const newMatrix = destPortal.matrixWorld.clone().multiply(rotationY180).multiply(relativeMatrix);
        
        this.portalCam.matrixAutoUpdate = false;
        this.portalCam.matrixWorld.copy(newMatrix);
        this.portalCam.matrixWorldInverse.copy(newMatrix).invert();
        this.portalCam.projectionMatrix.copy(this.playerCamera.projectionMatrix);

        // 2. Hide Obstructions
        // Instead of clipping planes (which can cut the whole world in half), 
        // we temporarily hide the wall object the destination portal is attached to.
        // The camera is technically "inside" or "behind" this wall.
        
        const destVisible = destPortal.visible;
        destPortal.visible = false;
        
        let wallVisible = true;
        if (destPortal.userData.wall) {
            wallVisible = destPortal.userData.wall.visible;
            destPortal.userData.wall.visible = false;
        }

        // Render
        this.renderer.setRenderTarget(renderTarget);
        this.renderer.clear();
        this.renderer.render(this.scene, this.portalCam);

        // Restore
        destPortal.visible = destVisible;
        if (destPortal.userData.wall) {
            destPortal.userData.wall.visible = wallVisible;
        }
    }

    shouldCollide(wall, point) {
        const portals = [this.portals.blue, this.portals.orange];
        for(const portal of portals) {
            if(!portal.userData.active) continue;
            if(portal.userData.wall !== wall) continue;

            const localPoint = point.clone();
            portal.worldToLocal(localPoint);
            
            // Check if within bounds of the portal hole
            // Portal geom is 2x3.5. 
            // We use slightly smaller bounds to keep walls solid at the very frame edges
            // And a generous Z depth to allow the player to stand "in" the doorframe
            if (Math.abs(localPoint.x) < 0.8 && Math.abs(localPoint.y) < 1.6 && Math.abs(localPoint.z) < 2.0) {
                return false; 
            }
        }
        return true;
    }

    checkTeleport(playerCapsule, startPos, endPos, playerVelocity) {
        if (!this.portals.blue.userData.active || !this.portals.orange.userData.active) return false;

        const pairs = [
            { src: this.portals.blue, dest: this.portals.orange },
            { src: this.portals.orange, dest: this.portals.blue }
        ];

        for (const pair of pairs) {
            const { src, dest } = pair;
            
            // Portal Normal (local Z+ is out)
            const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(src.quaternion);
            
            // Vectors from portal center to positions
            const vecStart = startPos.clone().sub(src.position);
            const vecEnd = endPos.clone().sub(src.position);
            
            const dotStart = vecStart.dot(normal);
            const dotEnd = vecEnd.dot(normal);

            // Crossing check: Sign change (positive to negative means entering)
            if (dotStart > 0 && dotEnd <= 0) {
                // We crossed the plane. Now check if we are within the rectangle.
                
                // Find intersection point fraction along the path
                const totalDist = dotStart - dotEnd;
                const frac = dotStart / totalDist;
                
                const intersectPoint = startPos.clone().lerp(endPos, frac);
                
                // Check bounds in local space
                const localIntersect = intersectPoint.clone();
                src.worldToLocal(localIntersect);
                
                // Slightly wider acceptance for teleport than for collision hole to ensure we catch it
                if (Math.abs(localIntersect.x) < 1.0 && Math.abs(localIntersect.y) < 1.75) {
                    return this.teleport(playerCapsule, playerVelocity, src, dest, intersectPoint, endPos);
                }
            }
        }
        return false;
    }

    teleport(capsule, velocity, src, dest, intersectPoint, originalEndPos) {
        // Play sound
        const audio = new Audio('teleport.mp3');
        audio.volume = 0.5;
        audio.play().catch(() => {});

        // 1. Calculate relative transform logic
        const srcInverse = src.matrixWorld.clone().invert();
        const rotationY180 = new THREE.Matrix4().makeRotationY(Math.PI);
        const destMatrix = dest.matrixWorld.clone().multiply(rotationY180);
        
        // 2. Teleport the Capsule
        // Transform the intersection point (where we hit the portal)
        const localIntersect = intersectPoint.clone().applyMatrix4(srcInverse);
        const destIntersect = localIntersect.applyMatrix4(destMatrix);
        
        // Calculate remaining movement vector (how much we moved PAST the portal plane)
        const movementVec = originalEndPos.clone().sub(intersectPoint);
        
        // Transform movement vector
        const srcQInv = src.quaternion.clone().invert();
        const localMove = movementVec.applyQuaternion(srcQInv);
        // Rotate 180 Y locally implies x -> -x, z -> -z for the exit
        localMove.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI); 
        const newMove = localMove.applyQuaternion(dest.quaternion);
        
        // New position = DestIntersect + NewMove + Tiny Push
        const finalPos = destIntersect.clone().add(newMove);
        
        // Push slightly out to prevent immediate back-trigger (epsilon)
        const destNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(dest.quaternion);
        finalPos.add(destNormal.multiplyScalar(0.05));

        // Apply translation to capsule
        // We need to move the capsule so its center is at finalPos
        const currentCenter = new THREE.Vector3();
        capsule.getCenter(currentCenter); // effectively 'originalEndPos'
        
        const totalTranslation = finalPos.sub(currentCenter);
        capsule.translate(totalTranslation);

        // 3. Velocity Rotation
        const localVel = velocity.clone().applyQuaternion(srcQInv);
        localVel.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
        const newVel = localVel.applyQuaternion(dest.quaternion);
        velocity.copy(newVel);

        // 4. Return Rotation Delta for Camera
        const srcQ = src.quaternion.clone();
        const destQ = dest.quaternion.clone();
        const rot180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), Math.PI);
        const deltaRot = destQ.multiply(rot180).multiply(srcQ.invert());
        
        return deltaRot;
    }
}