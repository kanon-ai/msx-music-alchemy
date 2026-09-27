"""Optional YM2151 melodic compiler. Operators follow algorithm order (0,16,8,24)."""
import copy, math
FIELDS={'dt1':7,'mul':15,'tl':127,'ks':3,'ar':31,'d1r':31,'d2r':31,'dt2':3,'sl':15,'rr':15}
OFFSETS=(0,16,8,24)
CARRIERS=((3,),(3,),(3,),(3,),(1,3),(1,2,3),(1,2,3),(0,1,2,3))
def patch():
    return dict(algorithm=4,feedback=2,operators=[dict(dt1=0,mul=m,tl=l,ks=1,ar=24,d1r=6,d2r=2,dt2=0,sl=4,rr=7) for m,l in [(1,32),(1,12),(2,40),(1,16)]])
def tracks():
    return [dict(id=f'opm{c+1}',name=f'OPM {c+1}',chip='OPM',channel=c,instrument=0,wave=[0]*32,mute=False,notes=[],opmPatch=patch()) for c in range(8)]
def validate_patch(p,integer):
    if not isinstance(p,dict):raise ValueError('OPM音色が必要です。')
    integer(p.get('algorithm'),0,7,'OPM algorithm');integer(p.get('feedback'),0,7,'OPM feedback')
    ops=p.get('operators')
    if not isinstance(ops,list) or len(ops)!=4:raise ValueError('OPM音色は4オペレーター必要です。')
    for op in ops:
        if not isinstance(op,dict):raise ValueError('OPM operator is invalid')
        for k,hi in FIELDS.items():integer(op.get(k),0,hi,'OPM '+k)
def configure(song,enabled):
    import core
    p=core.validate(song)
    if type(enabled) is not bool:raise ValueError('OPM enabled must be boolean')
    if enabled==p.get('opmEnabled',False):return p
    if enabled:p['tracks'].extend(tracks())
    else:
        if any(t['notes'] for t in p['tracks'] if t['chip']=='OPM'):raise ValueError('OPMの音符を退避して空にしてから無効にしてください。')
        p['tracks']=[t for t in p['tracks'] if t['chip']!='OPM']
    p['opmEnabled']=enabled
    return core.validate(p)
def pitch(write,f,ch,midi):
    # KC starts at C#0. The preceding B code + 63/64 gives C to within 1.6 cents.
    units=max(0,min(95*64,round((midi-13)*64)))
    note,frac=divmod(units,64);octave,semitone=divmod(note,12)
    code=(0,1,2,4,5,6,8,9,10,12,13,14)[semitone]
    write(f,3,0x28+ch,(octave<<4)|code);write(f,3,0x30+ch,frac<<2)
def compile_into(p,events,frame):
    if not p.get('opmEnabled'):return
    def write(f,c,r,v):events[f].append([c,r,v])
    for ch in range(8):write(0,3,8,ch)
    schedule=[]
    for t in p['tracks']:
        if t['chip']!='OPM' or t['mute']:continue
        ch=t['channel'];pat=t['opmPatch']
        write(0,3,0x20+ch,0xc0|(pat['feedback']<<3)|pat['algorithm'])
        write(0,3,0x38+ch,0)
        for i,op in enumerate(pat['operators']):
            off=OFFSETS[i]+ch
            for reg,value in [(0x40,(op['dt1']<<4)|op['mul']),(0x60,op['tl']),(0x80,(op['ks']<<6)|op['ar']),(0xa0,op['d1r']),(0xc0,(op['dt2']<<6)|op['d2r']),(0xe0,(op['sl']<<4)|op['rr'])]:write(0,3,reg+off,value)
        for n in t['notes']:
            first,last=frame(n['start']),frame(n['start']+n['duration'])
            if first>=last:raise ValueError('OPM note is shorter than one frame')
            schedule.extend([(first,1,t,n),(last,0,t,n)])
    for f,on,t,n in sorted(schedule,key=lambda e:(e[0],e[1])):
        ch=t['channel'];pat=t['opmPatch']
        if not on:write(f,3,8,ch);continue
        for i in CARRIERS[pat['algorithm']]:write(f,3,0x60+OFFSETS[i]+ch,min(127,pat['operators'][i]['tl']+(15-n['velocity'])*3))
        pitch(write,f,ch,n['pitch']);write(f,3,8,0x78|ch)
        previous_cents=None
        for pos in range(f,frame(n['start']+n['duration'])):
            ms=(pos-f)*1000/p['hz'];cents=n.get('detuneCents',0);glide=n.get('portamentoMs',0)
            if glide:cents+=(n.get('portamentoFrom',n['pitch'])-n['pitch'])*100*max(0,1-ms/glide)
            delay=n.get('vibratoDelayMs',0)
            if ms>=delay:cents+=n.get('vibratoDepth',0)*min(1,(ms-delay)/100)*math.sin(math.tau*n.get('vibratoRate',50)/10*(ms-delay)/1000)
            if cents!=previous_cents:pitch(write,pos,ch,n['pitch']+cents/100)
            previous_cents=cents
    for ch in range(8):write(frame(p['bars']*384),3,8,ch)
    # Key-on register is channel multiplexed: restore all eight separately at loops.
    if p['loop'] and p['loopStart']:
        lf=frame(p['loopStart']);state={};keys={c:c for c in range(8)}
        for writes in events[:lf]:
            for c,r,v in writes:
                if c==3:
                    if r==8:keys[v&7]=v
                    else:state[r]=v
        events[lf]=[[3,8,c] for c in range(8)]+[[3,r,v] for r,v in sorted(state.items())]+[[3,8,v] for v in keys.values()]+events[lf]
