export function activate(api){
    const T=api.THREE,root=new T.Group();root.name='Curve Lab';api.render.attach(root);
    const geometry=new T.SphereGeometry(.1,10,8),material=new T.MeshStandardMaterial({color:'#d8d8d8',roughness:.4});
    const dots=new T.InstancedMesh(geometry,material,256),matrix=new T.Matrix4();root.add(dots);dots.count=0;dots.frustumCulled=false;
    api.dispose(()=>{geometry.dispose();material.dispose();});
    api.render.onSample(({time,project})=>{
        const data=project.extensions?.[api.id];root.visible=!!data;if(!data)return;
        material.color.set(data.color);const points=data.points;dots.count=Math.min(256,points.length);
        for(let i=0;i<dots.count;i++){const p=points[i];matrix.makeTranslation(p[0],1.5+Math.sin(time*data.speed+i*.15)*data.height,p[1]);dots.setMatrixAt(i,matrix);}dots.instanceMatrix.needsUpdate=true;
    });
    function generate(input={}){
        const points=input.points??Array.from({length:160},(_,i)=>{const a=i/159*Math.PI*4,r=.5+i/159*2;return [Math.cos(a)*r,Math.sin(a)*r];});
        const data={points,height:input.height??.7,speed:input.speed??2,color:input.color??'#d8d8d8'};
        if(!Array.isArray(points)||!points.length||points.length>256||points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))||![data.height,data.speed].every(Number.isFinite)||!/^#[a-f\d]{6}$/i.test(data.color))throw Error('曲线参数无效');
        api.project.set(data);return {points:points.length};
    }
    let panel;
    api.commands.register('open',()=>{
        if(panel){panel.show();return;}
        panel=api.ui.panel({title:'自由曲线实验室',mount(root){
            root.innerHTML=`<style>:host{display:grid;gap:12px}canvas{width:100%;height:220px;background:#101010;border:1px solid #555;border-radius:6px;touch-action:none}label{display:flex;justify-content:space-between;gap:12px}input{width:100px;background:#292929;color:white;border:1px solid #555;padding:4px}button{background:#eee;color:#111;border:0;border-radius:4px;padding:8px}nav{display:flex;gap:8px}output{white-space:pre-wrap}</style><canvas width="640" height="440" aria-label="曲线绘图区"></canvas><label>起伏幅度<input id="height" type="number" step=".1" value=".7"></label><label>运动速度<input id="speed" type="number" step=".1" value="2"></label><nav><button id="apply">生成</button><button id="spiral">示例螺旋</button><button id="stats">统计</button></nav><output></output>`;
            const canvas=root.querySelector('canvas'),context=canvas.getContext('2d');let points=[];
            const paint=()=>{context.clearRect(0,0,640,440);if(!points.length)return;context.strokeStyle='#eee';context.lineWidth=3;context.beginPath();points.forEach((p,i)=>{const x=(p[0]+4)/8*640,y=(p[1]+3)/6*440;i?context.lineTo(x,y):context.moveTo(x,y);});context.stroke();};
            const add=e=>{if(points.length>=256)return;const b=canvas.getBoundingClientRect();points.push([(e.clientX-b.left)/b.width*8-4,(e.clientY-b.top)/b.height*6-3]);paint();};
            canvas.onpointerdown=e=>{points=[];canvas.setPointerCapture(e.pointerId);add(e);canvas.onpointermove=add;};canvas.onpointerup=canvas.onpointercancel=()=>{canvas.onpointermove=null;};
            const showError=fn=>async()=>{try{const value=await fn();root.querySelector('output').textContent=value?JSON.stringify(value):'';}catch(error){root.querySelector('output').textContent=error.message;}};
            root.querySelector('#apply').onclick=showError(()=>generate({points,height:Number(root.querySelector('#height').value),speed:Number(root.querySelector('#speed').value)}));
            root.querySelector('#spiral').onclick=showError(()=>{const result=generate();points=api.project.get().points;paint();return result;});
            root.querySelector('#stats').onclick=showError(()=>api.backend.call('statistics',{points:api.project.get()?.points??points}));
            const saved=api.project.get();points=saved?.points??[];
            root.querySelector('#height').value=saved?.height??.7;root.querySelector('#speed').value=saved?.speed??2;paint();
        }});
    });
    api.commands.register('generate',generate);
    api.commands.register('statistics',()=>api.backend.call('statistics',{points:api.project.get()?.points??[]}));
    api.services.provide('curve',{generate});
    api.ui.commandButton('open');
}
