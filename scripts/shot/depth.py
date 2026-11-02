# Geometric depth estimate: floor and ceiling planes from an estimated horizon, objects placed at the
# depth of their ground-contact row, object silhouettes from GrabCut inside their boxes.
import cv2, json, numpy as np
im=cv2.imread('/home/user/studio/docs/reference/target-shot.jpg'); H,W=im.shape[:2]; B=json.load(open('boxes.json'))
yh=560.0   # horizon row (estimated from the receding floor lines and the back wall's base)
def floorZ(y): return 1000.0/np.maximum(y-yh,8.0)
ys=np.arange(H,dtype=np.float32)[:,None].repeat(W,1)
Z=np.where(ys>yh, floorZ(ys), 1000.0/np.maximum(yh-ys,8.0)*0.55)  # floor below, ceiling above (lower)
back=floorZ(985.0)   # the back wall stands at the door's base
Z=np.minimum(Z,back)
order=[('door',985),('door-pillar',940),('willow',900),('cube-tree',905),('mushrooms',880),('mira',815),('little-fence',975),('jars-cream',960),('lavender-pom',1025),('jars-mint',1160),('dog',1062),('critter-b',1105),('critter-a',1155),('player',1690)]
masks={}
for k,contact in order:
    x0,y0,x1,y1=B[k]; m=np.zeros((H,W),np.uint8); m[:]=cv2.GC_BGD; m[y0:y1,x0:x1]=cv2.GC_PR_FGD
    if k in ('door','door-pillar'):
        sil=np.zeros((H,W),bool); sil[y0:y1,x0:x1]=True
    else:
        bg=np.zeros((1,65),np.float64); fg=np.zeros((1,65),np.float64)
        pad=40; X0,Y0,X1,Y1=max(0,x0-pad),max(0,y0-pad),min(W,x1+pad),min(H,y1+pad)
        sub=im[Y0:Y1,X0:X1].copy(); ms=m[Y0:Y1,X0:X1].copy()
        cv2.grabCut(sub,ms,None,bg,fg,5,cv2.GC_INIT_WITH_MASK)
        s=np.isin(ms,[cv2.GC_FGD,cv2.GC_PR_FGD]); sil=np.zeros((H,W),bool); sil[Y0:Y1,X0:X1]=s
    masks[k]=sil
    Z=np.where(sil, np.minimum(Z, floorZ(float(contact))), Z)
np.save('depth.npy',Z)
d=np.log(Z); d=(d-d.min())/(d.max()-d.min()); vis=cv2.applyColorMap((255*(1-d)).astype(np.uint8),cv2.COLORMAP_TURBO)
cv2.imwrite('depth.png',vis)
ov=im.copy()
rng=np.random.default_rng(3)
for k,s in masks.items():
    col=rng.integers(60,255,3); ov[s]=(0.45*ov[s]+0.55*col).astype(np.uint8)
    yx=np.argwhere(s); 
    if len(yx): cy,cx=yx.mean(0).astype(int); cv2.putText(ov,k,(cx-40,cy),cv2.FONT_HERSHEY_SIMPLEX,0.8,(255,255,255),4); cv2.putText(ov,k,(cx-40,cy),cv2.FONT_HERSHEY_SIMPLEX,0.8,(0,0,0),2)
cv2.imwrite('masks.png',ov)
# normals from depth (shape cue)
zs=cv2.GaussianBlur(np.log(Z).astype(np.float32),(0,0),3); gx=cv2.Sobel(zs,cv2.CV_32F,1,0); gy=cv2.Sobel(zs,cv2.CV_32F,0,1)
n=np.dstack([-gx*40,-gy*40,np.ones_like(gx)]); n/=np.linalg.norm(n,axis=2,keepdims=True)
cv2.imwrite('normals.png',((n[...,::-1]*0.5+0.5)*255).astype(np.uint8))
print({k:int(v.sum()) for k,v in masks.items()})
print('player feet depth', floorZ(1690.0), 'dog', floorZ(1062.0), 'door', back, 'ratio dog/player', floorZ(1062.0)/floorZ(1690.0))
