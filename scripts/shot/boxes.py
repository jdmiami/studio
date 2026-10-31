import cv2, json
im=cv2.imread('/home/user/studio/docs/reference/target-shot.jpg')
B={
 'player':(255,905,660,1720),'dog':(790,915,945,1065),'critter-a':(860,1095,925,1155),'critter-b':(990,1045,1055,1105),
 'mira':(70,655,200,805),'cube-tree':(310,510,610,905),'willow':(585,615,810,900),'door':(925,600,1125,985),
 'door-pillar':(840,560,965,940),'waterfall':(0,800,470,1520),'pool':(130,1180,690,1560),'ceiling':(0,0,1125,560),
 'light-left':(0,420,150,640),'light-right':(960,360,1125,480),'mushrooms':(310,825,450,880),'lavender-pom':(505,965,570,1025),
 'jars-mint':(550,990,770,1160),'jars-cream':(460,870,610,960),'stairs':(740,1120,1060,1320),'grass-ledge-right':(700,1180,1125,1979),
 'floor-front':(0,1450,760,1979),'little-fence':(690,915,770,975),
 'hud-hearts':(30,25,475,120),'hud-quest':(700,20,1095,215),'hud-minimap':(30,1705,295,1965),'hud-prompts':(405,1770,720,1880),
}
json.dump(B,open('boxes.json','w'),indent=1)
o=im.copy()
for k,(x0,y0,x1,y1) in B.items():
    cv2.rectangle(o,(x0,y0),(x1,y1),(40,40,255),3); cv2.putText(o,k,(x0+4,y0+24),cv2.FONT_HERSHEY_SIMPLEX,0.7,(255,255,255),4); cv2.putText(o,k,(x0+4,y0+24),cv2.FONT_HERSHEY_SIMPLEX,0.7,(20,20,200),2)
cv2.imwrite('boxes.jpg',cv2.resize(o,(675,1187)),[cv2.IMWRITE_JPEG_QUALITY,85])
