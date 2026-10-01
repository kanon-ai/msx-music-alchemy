"""Compact MGS313 native expression/rhythm encoding; no driver bundled."""
import collections, math, struct, copy
import core

FM_TABLE=(172,182,193,205,217,230,244,258,274,290,307,326)

def timing_grid(p):
    # Native musical durations must never round to zero driver frames.
    return math.ceil(p['bpm']*2/75)

def pack(tokens):
    """Choose the shortest sequence of literal commands and exact counted loops."""
    count=len(tokens);cost=[0]*(count+1);choice=[None]*count
    sizes=[0]
    for token in tokens:sizes.append(sizes[-1]+len(token))
    for i in range(count-1,-1,-1):
        cost[i]=len(tokens[i])+cost[i+1]
        for width in range(1,min(256,(count-i)//2)+1):
            chunk=tokens[i:i+width];repeats=2
            while repeats<=255 and i+repeats*width<=count and tokens[i+(repeats-1)*width:i+repeats*width]==chunk:
                candidate=8+sizes[i+width]-sizes[i]+cost[i+repeats*width]
                if candidate<cost[i]:cost[i]=candidate;choice[i]=(width,repeats)
                repeats+=1
    out=bytearray();i=0
    while i<count:
        if choice[i]:
            width,repeats=choice[i];body=b''.join(tokens[i:i+width])
            out+=bytes([0x57,repeats])+struct.pack('<H',len(body)+1)+body+bytes([0x59,0])+struct.pack('<h',-(len(body)+3))
            i+=width*repeats
        else:out+=tokens[i];i+=1
    return bytes(out)

class Track:
    def __init__(self,loop,default,rhythm=False,grid=1):
        self.tokens=[];self.prefix=None;self.loop=loop;self.cursor=0;self.default=default;self.state={};self.grid=grid
        # MGSDRV initializes q to 8; every gate is explicit.
        if default:self.add(0x42,min(256,default)&255)
    def add(self,*values):
        token=bytes(values);self.tokens.append(token)
        op=values[0]
        if 0x80<=op<=0x9f:key='patch'
        elif 0xc0<=op<=0xcf:key='volume'
        elif 0xd0<=op<=0xd7:key='octave'
        elif op==0x54:key='lfo';self.state.pop('lfo-enable',None)
        elif op==0x5a:key='lfo-enable'
        elif op==0x45:key=('drum',values[1]>>5)
        elif op==0x50:key='detune'
        else:return
        self.state[key]=token
    def wait(self,code,duration,rhythm=False):
        if duration<=0:return
        if self.loop is not None and self.prefix is None and self.cursor<=self.loop<self.cursor+duration:
            first=self.loop-self.cursor
            if first:self.wait(code,first,rhythm)
            self.prefix=self.tokens;self.tokens=list(self.state.values())
            if first and code!=12 and not rhythm:self.add(0x40)
            duration-=first
        if duration % self.grid:raise ValueError("MGS timing segment is below the supported grid.")
        remaining=duration
        while remaining:
            part=min(256//self.grid*self.grid,remaining)
            if part==self.default:self.add(code+(0xa0 if rhythm else 0x30))
            else:self.add(code+0x20,part&255)
            remaining-=part
            if remaining and rhythm:code=0
            elif remaining and code!=12:self.add(0x40)
        self.cursor+=duration
    def finish(self):
        body=pack(self.tokens)
        if self.prefix is not None:
            if len(body)+3>32767:raise ValueError('MGSループ区間が大きすぎます。')
            return pack(self.prefix)+bytes([0x57,0])+struct.pack('<H',len(body)+1)+body+bytes([0x59,0])+struct.pack('<h',-(len(body)+3))+b'\xff'
        return body+b'\xff'

def build_blocks(p,frame,end,loop,order):
    tracks={(t['chip'],t['channel']):t for t in p['tracks']};blocks=[]
    rhythm=bool(p.get('opllRhythm'));grid=timing_grid(p)
    for chip,ch in order:
        if rhythm and chip=='OPLL' and ch>=6:
            blocks.append(rhythm_block(p,frame,end,loop) if ch==6 else b'\xff');continue
        t=tracks[chip,ch];notes=[] if t['mute'] else t['notes']
        durations=collections.Counter(min(256//grid*grid,n['duration']) for n in notes)
        default=durations.most_common(1)[0][0] if durations else 0
        b=Track(loop,default,grid=grid);octave=volume=patch=lfo=last_lfo=None;detune=0
        if chip=='OPLL':b.state.update(detune=bytes([0x50,0]),**{'lfo-enable':bytes([0x5a,0])})
        if chip=='SCC':b.add(0x80+next(i for i in range(ch+1) if tracks['SCC',i]['wave']==t['wave']))
        for n in notes:
            start,stop=n['start'],n['start']+n['duration']
            b.wait(12,start-b.cursor)
            if chip=='OPLL':
                inst=n.get('instrument',t['instrument']);new=inst-1 if inst else 15
                if new!=patch:b.add(0x80+new);patch=new
            octv=n['pitch']//12-2+(chip=='OPLL')
            has_glide=n.get('portamentoMs',0)>0 and n.get('portamentoFrom',n['pitch'])!=n['pitch']
            if not has_glide and octv!=octave:b.add(0xd0+octv);octave=octv
            if n['velocity']!=volume:b.add(0xc0+n['velocity']);volume=n['velocity']
            depth=n.get('vibratoDepth',0)
            delay=round(n.get('vibratoDelayMs',0)*60/1000)
            if chip!='OPLL' and any(n.get(k,0) for k in ('vibratoDepth','detuneCents','portamentoMs')):
                raise ValueError('PSG/SCC pitch expression MGS export is not supported yet.')
            if depth and delay<frame(stop)-frame(start):
                rate=n.get('vibratoRate',50)/10
                amplitude=2*FM_TABLE[n['pitch']%12]*(2**(depth/1200)-1)
                choices=((abs(60/(2*(d+1)*sp)-rate)/rate+abs(d*step/2-amplitude)/max(1,amplitude),d,sp,step) for d in range(1,32) for sp in range(1,9) for step in range(1,9))
                _,d,sp,step=min(choices)
                lf=(min(255,delay+1),d,sp,step)
            else:lf=None
            if lf!=lfo:
                if lf:
                    if lf==last_lfo:b.add(0x5a,1)
                    else:b.add(0x54,*lf);last_lfo=lf
                else:b.add(0x5a,0)
                lfo=lf
            cents=n.get('detuneCents',0)
            delta=round(FM_TABLE[n['pitch']%12]*(2**(cents/1200)-1)) if chip=='OPLL' else 0
            if chip=='OPLL' and delta!=detune:b.add(0x50,delta&255);detune=delta
            glide=min(stop-start,round(n.get('portamentoMs',0)*p['bpm']*96/60000/grid)*grid)
            source=n.get('portamentoFrom',n['pitch'])
            if glide and source!=n['pitch']:
                source_oct=source//12-1
                if source_oct!=octave:b.add(0xd0+source_oct)
                b.add(0x53,source%12)
                if source_oct!=octv:b.add(0xd0+octv)
                octave=octv
                b.wait(n['pitch']%12,glide)
                if stop-start>glide:b.add(0x40)
                b.wait(n['pitch']%12,stop-start-glide)
            else:
                if octv!=octave:b.add(0xd0+octv);octave=octv
                b.wait(n['pitch']%12,stop-start)
        b.wait(12,end-b.cursor);blocks.append(b.finish())
    return blocks

def rhythm_block(p,frame,end,loop):
    grid=timing_grid(p)
    changes=collections.defaultdict(list)
    for t in p['tracks']:
        if t['chip']!='OPLL' or t['channel']<6 or t['mute']:continue
        for n in t['notes']:changes[n['start']].append(n)
    points=sorted(set(changes)|{0,end})
    spans=collections.Counter(b-a for a,b in zip(points,points[1:]))
    default=min(256//grid*grid,spans.most_common(1)[0][0]) if spans else 0
    b=Track(loop,default,True,grid);b.add(0x5a,0);levels={}
    mapping={36:(16,0),38:(8,1),45:(4,2),49:(2,3),42:(1,4)}
    for i,f in enumerate(points[:-1]):
        mask=0
        for n in changes[f]:
            bit,target=mapping[n['pitch']]
            if levels.get(target)!=n['velocity']:b.add(0x45,(target<<5)|n['velocity']);levels[target]=n['velocity']
            mask|=bit
        b.wait(mask,points[i+1]-f,True)
    return b.finish()


def compact_song(p):
    """Use the finest safe native-duration grid. Input data is never edited."""
    p=copy.deepcopy(p);grid=timing_grid(p);end=(p.get('loopEnd',p['bars']*384) if p['loop'] else p['bars']*384)//grid*grid
    def snap(t):return min(end,round(t/grid)*grid)
    for track in p['tracks']:
        if track['mute']:continue
        for n in track['notes']:
            start,stop=snap(n['start']),snap(n['start']+n['duration'])
            if stop<=start:
                raise ValueError('MGSの奏法出力では短すぎる音符です。音長を1/60秒以上に広げてください。')
            n['start'],n['duration']=start,stop-start
    p['loopStart']=min(max(0,end-grid),snap(p['loopStart']))
    return core.validate(p),end
