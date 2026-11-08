from PIL import Image, ImageDraw, ImageFilter
import math
S=1024; SS=2
N=S*SS
def lerp(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))
# Hintergrund: diagonaler Verlauf Mint -> Petrol + weiches Licht oben links (wie Foody)
img=Image.new("RGB",(N,N))
px=img.load()
c1,c2=(98,191,180),(52,128,134)
for y in range(N):
    for x in range(N):
        t=(x+y)/(2*N)
        px[x,y]=lerp(c1,c2,t)
glow=Image.new("L",(N,N),0)
gd=ImageDraw.Draw(glow)
gd.ellipse([N*0.02,N*0.0,N*0.62,N*0.6],fill=120)
glow=glow.filter(ImageFilter.GaussianBlur(N*0.12))
light=Image.new("RGB",(N,N),(150,225,212))
img=Image.composite(light,img,glow)
d=ImageDraw.Draw(img)
cx,cy=N*0.485,N*0.515
R=N*0.305; w=N*0.044
W=(246,251,249)
d.ellipse([cx-R,cy-R,cx+R,cy+R],outline=W,width=int(w))
# Balken (Kursverlauf steigend) innen
bw=N*0.052; gap=N*0.038
hs=[0.10,0.16,0.23,0.31]
total=len(hs)*bw+(len(hs)-1)*gap
x0=cx-total/2; base=cy+N*0.13
for i,h in enumerate(hs):
    x=x0+i*(bw+gap)
    d.rounded_rectangle([x,base-N*h,x+bw,base],radius=bw/2,fill=W)
# Funkeln oben rechts auf dem Ring
def star(cx_,cy_,r,inner=0.28):
    pts=[]
    for k in range(8):
        a=math.pi/2*k/2 - math.pi/2
        rr=r if k%2==0 else r*inner
        pts.append((cx_+rr*math.cos(a),cy_+rr*math.sin(a)))
    return pts
ang=math.radians(-42)
sx,sy=cx+R*math.cos(ang),cy+R*math.sin(ang)
bgc=img.getpixel((int(sx+N*0.09),int(sy-N*0.09)))
d.ellipse([sx-N*0.062,sy-N*0.062,sx+N*0.062,sy+N*0.062],fill=bgc)
d.polygon(star(sx,sy,N*0.075),fill=W)
img=img.resize((S,S),Image.LANCZOS)
img.save("docs/icon-1024.png")
for n,s in [("icon.png",180),("icon-192.png",192),("icon-512.png",512),("favicon.png",48)]:
    img.resize((s,s),Image.LANCZOS).save("docs/"+n,optimize=True)
print("ok")
