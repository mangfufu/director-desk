import {BufferGeometry,Float32BufferAttribute,LineBasicMaterial,LineSegments,PerspectiveCamera,Points,PointsMaterial,Scene,WebGLRenderer} from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';



export function createReconstructionPreview(container:HTMLElement){
    const scene=new Scene(),camera=new PerspectiveCamera(50,1,.01,1000);
    const renderer=new WebGLRenderer({antialias:true,alpha:false});
    renderer.setClearColor(0x151515);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    container.append(renderer.domElement);
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;
    const points=new Points(new BufferGeometry(),new PointsMaterial({color:0xaaaaaa,size:2,sizeAttenuation:false}));
    const lines=new LineSegments(new BufferGeometry(),new LineBasicMaterial({color:0xffffff}));scene.add(points,lines);
    let hasFrame=false,following=true,aspect=16/9;
    const render=()=>renderer.render(scene,camera);
    controls.addEventListener('change',render);controls.addEventListener('start',()=>following=false);
    function resize(){const width=container.clientWidth,height=container.clientHeight;if(!width||!height)return;const w=Math.min(width,height*aspect),h=w/aspect;renderer.setSize(w,h);camera.aspect=aspect;camera.updateProjectionMatrix();render();}
    const observer=new ResizeObserver(resize);observer.observe(container);
    return {
        update(frame:any){
            if(!frame.camera)return;
            aspect=frame.aspect||16/9;resize();
            points.geometry.dispose();points.geometry=new BufferGeometry();points.geometry.setAttribute('position',new Float32BufferAttribute(frame.points||[],3));
            const segments:number[]=[];
            for(const actor of frame.actors||[])for(let j=1;j<actor.joints.length;j++){const parent=frame.parents[j];if(parent>=0)segments.push(...actor.joints[parent],...actor.joints[j]);}
            lines.geometry.dispose();lines.geometry=new BufferGeometry();lines.geometry.setAttribute('position',new Float32BufferAttribute(segments,3));
            if(following||!hasFrame){camera.position.fromArray(frame.camera.position);camera.up.fromArray(frame.camera.up);controls.target.fromArray(frame.camera.target);camera.fov=frame.camera.fov;camera.updateProjectionMatrix();controls.update();}
            hasFrame=true;render();
        },
        follow(){following=true;},
        dispose(){observer.disconnect();controls.dispose();points.geometry.dispose();points.material.dispose();lines.geometry.dispose();lines.material.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();},
    };
}
