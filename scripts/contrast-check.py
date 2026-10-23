def lum(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c: c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def cr(a,b):
    la,lb=sorted([lum(a),lum(b)],reverse=True); return (la+0.05)/(lb+0.05)
L=dict(bg='#FAFAF9',surface='#FFFFFF',surface2='#F0EFED',text='#1C1917',muted='#57534E',accent='#C2410C',accentHover='#9A330A',accentSoft='#FFF1EA',accentText='#FFFFFF',danger='#B42318',dangerBg='#FDECEA',warning='#854D0E',warningBg='#FEF3C7',success='#15803D',successBg='#EDF8F0')
D=dict(bg='#121212',surface='#1C1B1A',surface2='#262524',text='#F5F5F4',muted='#A8A29E',accent='#F26B2A',accentHover='#FF8A4C',accentSoft='#3A2116',accentText='#1C1917',danger='#F87171',dangerBg='#3B1614',warning='#FACC15',warningBg='#33290A',success='#4ADE80',successBg='#0F2A1A')
pairs=[('text','bg'),('text','surface'),('text','surface2'),('muted','surface'),('muted','bg'),('muted','surface2'),('accentText','accent'),('accentText','accentHover'),('accent','surface'),('accent','accentSoft'),('accent','bg'),('danger','dangerBg'),('danger','surface'),('warning','warningBg'),('warning','surface'),('success','successBg'),('success','surface'),('text','accentSoft')]
for name,T in (('jasny',L),('ciemny',D)):
    for a,b in pairs:
        v=cr(T[a],T[b]); print(f"{name}\t{a} na {b}\t{T[a]}/{T[b]}\t{v:.2f}\t{'OK' if v>=4.5 else 'ZA MAŁO'}")
