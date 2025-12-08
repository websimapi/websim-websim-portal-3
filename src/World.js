import * as THREE from 'three';

export class World {
    constructor(scene) {
        this.scene = scene;
        this.colliders = [];
        this.textureLoader = new THREE.TextureLoader();
        
        this.init();
    }

    init() {
        const wallTex = this.textureLoader.load('grid_wall.png');
        wallTex.colorSpace = THREE.SRGBColorSpace;
        wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
        wallTex.repeat.set(4, 2);
        
        const floorTex = this.textureLoader.load('grid_floor.png');
        floorTex.colorSpace = THREE.SRGBColorSpace;
        floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
        floorTex.repeat.set(4, 4);

        const materialWall = new THREE.MeshStandardMaterial({ 
            map: wallTex, 
            roughness: 0.1,
            metalness: 0.1
        });
        
        const materialFloor = new THREE.MeshStandardMaterial({ 
            map: floorTex, 
            roughness: 0.8,
            metalness: 0.2
        });

        // Room Dimensions
        const width = 20;
        const height = 10;
        const depth = 20;

        // Floor
        const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 1, depth), materialFloor);
        floor.position.set(0, -0.5, 0);
        this.addStaticObject(floor);

        // Ceiling
        const ceiling = new THREE.Mesh(new THREE.BoxGeometry(width, 1, depth), materialWall);
        ceiling.position.set(0, height + 0.5, 0);
        this.addStaticObject(ceiling);

        // Walls
        const wallParams = [
            { pos: [0, height/2, -depth/2 - 0.5], dim: [width, height, 1] }, // Back
            { pos: [0, height/2, depth/2 + 0.5], dim: [width, height, 1] },  // Front
            { pos: [-width/2 - 0.5, height/2, 0], dim: [1, height, depth] }, // Left
            { pos: [width/2 + 0.5, height/2, 0], dim: [1, height, depth] }   // Right
        ];

        wallParams.forEach(p => {
            const wall = new THREE.Mesh(new THREE.BoxGeometry(...p.dim), materialWall);
            wall.position.set(...p.pos);
            this.addStaticObject(wall);
        });

        // Random Pillars for interest
        const pillarGeo = new THREE.BoxGeometry(2, 6, 2);
        const pillar1 = new THREE.Mesh(pillarGeo, materialWall);
        pillar1.position.set(-5, 3, -5);
        this.addStaticObject(pillar1);
        
        const pillar2 = new THREE.Mesh(pillarGeo, materialWall);
        pillar2.position.set(5, 3, 5);
        this.addStaticObject(pillar2);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0xffffff, 0.8, 50);
        pointLight.position.set(0, 9, 0);
        this.scene.add(pointLight);
    }

    addStaticObject(mesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.colliders.push(mesh);
        mesh.userData.isWall = true; // Tag for portal placement
    }

    getColliders() {
        return this.colliders;
    }
}