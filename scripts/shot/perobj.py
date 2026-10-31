import cv2, json, numpy as np
im=cv2.imread('/home/user/studio/docs/reference/target-shot.jpg'); B=json.load(open('boxes.json'))
lab=cv2.cvtColor(im,cv2.COLOR_BGR2LAB)
res={}
crops=[]
for k,(x0,y0,x1,y1) in B.items():
    p=lab[y0:y1,x0:x1].reshape(-1,3).astype(np.float32)[::3]
    K=3; _,l,c=cv2.kmeans(p,K,None,(cv2.TERM_CRITERIA_EPS+cv2.TERM_CRITERIA_MAX_ITER,30,0.5),3,cv2.KMEANS_PP_CENTERS)
    n=np.bincount(l.ravel(),minlength=K)/len(l)
    cols=[]
    for i in np.argsort(-n):
        rgb=cv2.cvtColor(c[i].astype(np.uint8).reshape(1,1,3),cv2.COLOR_LAB2RGB)[0,0]
        cols.append(['#%02x%02x%02x'%tuple(int(v) for v in rgb),round(float(n[i]),2)])
    g=cv2.cvtColor(im[y0:y1,x0:x1],cv2.COLOR_BGR2GRAY).astype(np.float32)
    res[k]={'box':[x0,y0,x1,y1],'colors':cols,'texture':round(float(np.abs(cv2.Laplacian(g,cv2.CV_32F)).mean()),1)}
    if not k.startswith('hud') and k not in ('ceiling','floor-front','grass-ledge-right','waterfall'):
        cr=im[y0:y1,x0:x1]; s=260/max(cr.shape[:2]); cr=cv2.resize(cr,(int(cr.shape[1]*s),int(cr.shape[0]*s)))
        tile=np.full((290,270,3),245,np.uint8); tile[0:cr.shape[0],0:cr.shape[1]]=cr
        cv2.putText(tile,k,(4,284),cv2.FONT_HERSHEY_SIMPLEX,0.55,(40,40,40),1); crops.append(tile)
json.dump(res,open('perobj.json','w'),indent=1)
rows=[np.hstack(crops[i:i+6]+[np.full((290,270,3),245,np.uint8)]*(6-len(crops[i:i+6]))) for i in range(0,len(crops),6)]
cv2.imwrite('crops.jpg',np.vstack(rows),[cv2.IMWRITE_JPEG_QUALITY,85])
for k,v in res.items(): print(k, v['colors'], 'tex', v['texture'])
