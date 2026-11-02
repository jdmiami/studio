import cv2, numpy as np, json
src='/home/user/studio/docs/reference/target-shot.jpg'
bgr=cv2.imread(src); H,W=bgr.shape[:2]
lab=cv2.cvtColor(bgr,cv2.COLOR_BGR2LAB).astype(np.float32)
L=lab[...,0]*100/255; a=lab[...,1]-128; b=lab[...,2]-128; C=np.hypot(a,b); hue=(np.degrees(np.arctan2(b,a))+360)%360
out={}
# HUD mask (approx boxes) so stats describe the world
hud=np.zeros((H,W),bool)
for x0,y0,x1,y1 in [(30,25,475,120),(700,20,1095,215),(30,1705,295,1965),(405,1770,720,1880)]: hud[y0:y1,x0:x1]=True
world=~hud
out['size']=[W,H]
out['L']={'mean':float(L[world].mean()),'p05':float(np.percentile(L[world],5)),'p50':float(np.percentile(L[world],50)),'p95':float(np.percentile(L[world],95))}
out['C']={'mean':float(C[world].mean()),'p90':float(np.percentile(C[world],90))}
# palette by kmeans in Lab
px=lab[world].reshape(-1,3)[::7]
crit=(cv2.TERM_CRITERIA_EPS+cv2.TERM_CRITERIA_MAX_ITER,40,0.5)
K=14
_,lbl,cen=cv2.kmeans(px,K,None,crit,4,cv2.KMEANS_PP_CENTERS)
cnt=np.bincount(lbl.ravel(),minlength=K)/len(lbl)
pal=[]
for i in np.argsort(-cnt):
    c=cen[i].astype(np.uint8).reshape(1,1,3); rgb=cv2.cvtColor(c,cv2.COLOR_LAB2RGB)[0,0]
    pal.append({'hex':'#%02x%02x%02x'%tuple(int(v) for v in rgb),'share':round(float(cnt[i]),3),'L':round(float(cen[i][0]*100/255),1),'C':round(float(np.hypot(cen[i][1]-128,cen[i][2]-128)),1)})
out['palette']=pal
# swatch image
sw=np.zeros((120,W,3),np.uint8); x=0
for p in pal:
    w=max(1,int(round(p['share']*W))); col=tuple(int(p['hex'][k:k+2],16) for k in (5,3,1)); sw[:,x:x+w]=col; x+=w
cv2.imwrite('palette.png',sw)
# value map: 5-step posterized value
Lw=L.copy(); steps=np.digitize(Lw,[40,55,68,80]); vals=np.array([30,50,65,78,92])[steps]
cv2.imwrite('values5.png',(vals*2.55).astype(np.uint8))
# temperature map: warm(+)/cool(-) from b and a
temp=np.clip((b*0.8+a*0.4),-25,25); tm=((temp+25)/50*255).astype(np.uint8)
cv2.imwrite('temperature.png',cv2.applyColorMap(tm,cv2.COLORMAP_COOLWARM if hasattr(cv2,'COLORMAP_COOLWARM') else cv2.COLORMAP_JET))
# chroma heat
cv2.imwrite('chroma.png',cv2.applyColorMap(np.clip(C*8,0,255).astype(np.uint8),cv2.COLORMAP_INFERNO))
# edges + detail frequency heatmap
g=cv2.cvtColor(bgr,cv2.COLOR_BGR2GRAY)
e=cv2.Canny(cv2.GaussianBlur(g,(3,3),0),40,110); cv2.imwrite('edges.png',255-e)
lap=np.abs(cv2.Laplacian(g.astype(np.float32),cv2.CV_32F)); det=cv2.GaussianBlur(lap,(0,0),18)
det=(det/np.percentile(det,99)*255).clip(0,255).astype(np.uint8); cv2.imwrite('detail.png',cv2.applyColorMap(det,cv2.COLORMAP_INFERNO))
# saliency: spectral residual
small=cv2.resize(g,(128,int(128*H/W))).astype(np.float32)
F=np.fft.fft2(small); la=np.log(np.abs(F)+1e-6); ph=np.angle(F)
sr=la-cv2.blur(la,(3,3)); sal=np.abs(np.fft.ifft2(np.exp(sr+1j*ph)))**2; sal=cv2.GaussianBlur(sal,(0,0),3)
sal=cv2.resize(sal/sal.max(),(W,H)); cv2.imwrite('saliency.png',cv2.applyColorMap((sal*255).astype(np.uint8),cv2.COLORMAP_JET))
blend=cv2.addWeighted(bgr,0.55,cv2.applyColorMap((sal*255).astype(np.uint8),cv2.COLORMAP_JET),0.45,0); cv2.imwrite('saliency_over.png',blend)
# light map: very bright low-chroma regions (light sources, bloom)
light=((L>88)&(C<12)).astype(np.uint8)*255; cv2.imwrite('highlights.png',light)
out['highlight_share']=float((light>0)[world].mean())
# perspective: Hough lines, classify, estimate vanishing points
lines=cv2.HoughLinesP(e,1,np.pi/360,90,minLineLength=70,maxLineGap=6)
segs=[] if lines is None else np.asarray(lines).reshape(-1,4).tolist()
vis=bgr.copy()
ang=[]
for x1,y1,x2,y2 in segs:
    t=np.degrees(np.arctan2(y2-y1,x2-x1))%180; ang.append(t)
    col=(0,0,255) if (t<10 or t>170) else (0,200,0) if 80<t<100 else (255,0,0)
    cv2.line(vis,(x1,y1),(x2,y2),col,3)
cv2.imwrite('lines.png',vis)
out['lines']=len(segs)
hist,_=np.histogram(ang,bins=18,range=(0,180)); out['line_angle_hist_10deg']=hist.tolist()
# grid of region stats 4 cols x 7 rows
grid=[]
for r in range(7):
  for c in range(4):
    ys,ye=r*H//7,(r+1)*H//7; xs,xe=c*W//4,(c+1)*W//4
    m=world[ys:ye,xs:xe]
    if m.mean()<0.3: continue
    rgb=cv2.cvtColor(bgr[ys:ye,xs:xe],cv2.COLOR_BGR2RGB)[m].mean(0)
    grid.append({'cell':[c,r],'hex':'#%02x%02x%02x'%tuple(int(v) for v in rgb),'L':round(float(L[ys:ye,xs:xe][m].mean()),1),'C':round(float(C[ys:ye,xs:xe][m].mean()),1)})
out['grid']=grid
json.dump(out,open('stats.json','w'),indent=1)
print(json.dumps({k:out[k] for k in ['size','L','C','highlight_share','lines','line_angle_hist_10deg']}))
for p in pal: print(p)
