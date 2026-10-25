"""Lossless OPLL stream prototype: offline phrase compression, bounded Z80 playback."""
import collections, json, struct, copy, io, zipfile, hashlib
import core

def compress(seq, terminals):
    rules = {}; depths = {}; next_id = 65536
    def cost(x): return 3 if x >= 65536 else len(terminals[x])
    while True:
        counts = collections.Counter(zip(seq, seq[1:]))
        candidates = [(n*(cost(a)+cost(b)-3)-(cost(a)+cost(b)+1), a,b)
                      for (a,b),n in counts.items() if max(depths.get(a,0),depths.get(b,0)) < 12]
        if not candidates: break
        gain,a,b = max(candidates)
        if gain <= 0: break
        out=[]; i=0; hits=0
        while i<len(seq):
            if i+1<len(seq) and seq[i]==a and seq[i+1]==b:
                out.append(next_id); i+=2; hits+=1
            else: out.append(seq[i]); i+=1
        if hits*(cost(a)+cost(b)-3) <= cost(a)+cost(b)+1:
            break
        rules[next_id]=(a,b); depths[next_id]=1+max(depths.get(a,0),depths.get(b,0))
        next_id+=1; seq=out
    return seq,rules,depths

def encode(song):
    song=core.validate(copy.deepcopy(song))
    original=copy.deepcopy(song)
    if song['hz']!=60: raise ValueError('軽量OPLLキットは60 Hz専用です。')
    if song['loop']: raise ValueError('軽量OPLLキット初版では編集画面のループ範囲は未対応です。LOOPをOFFにして出力してください。全曲ループは同梱ガイドで設定できます。')
    if any(t['chip']!='OPLL' and not t['mute'] and t['notes'] for t in song['tracks']):
        raise ValueError('軽量OPLLキットはOPLL専用です。他の音源のパートをミュートしてください。')
    for t in song['tracks']:
        for n in t['notes']: n.pop('vibratoDepth',None)
    compiled=core.compile_song(song)
    seq=[]; expected=[]; last=0; terminals={}; ids={}; pitches=[]; levels={}
    def token(data):
        data=bytes(data)
        if data not in ids:
            ids[data]=len(ids); terminals[ids[data]]=data
        seq.append(ids[data])
    for event in compiled['events']:
        writes=[]
        for chip,r,v in event['writes']:
            if chip!=1: continue
            if 0x30<=r<=0x38:
                if levels.get(r)==v: continue
                levels[r]=v
            writes.append((r,v))
        if not writes: continue
        delta=event['frame']-last
        while delta:
            wait=min(128,delta);token([63+wait]);delta-=wait
        last=event['frame']
        for r,v in writes:
            assert 0<=r<64 and 0<=v<256
            expected.append((last,r,v))
        i=0
        while i<len(writes):
            r,v=writes[i];ch=r-0x10
            if 0<=ch<9 and i+1<len(writes) and writes[i+1][0]==0x20+ch:
                pitch=(v,writes[i+1][1])
                if pitch not in pitches: pitches.append(pitch)

                if len(pitches)>256: raise ValueError('音程変化が多すぎます。軽量OPLLキットは最大256種類の音程ペアに対応します。')
                token([196+ch,pitches.index(pitch)]);i+=2
            else: token([r,v]);i+=1
    flat_size=sum(len(terminals[x]) for x in seq)+1
    common=[k for k,n in collections.Counter(seq).most_common() if len(terminals[k])>=2][:51]
    dictionary=b''
    for i,k in enumerate(common):
        dictionary+=(terminals[k]+bytes([193])).ljust(4,b'\0')
        terminals[k]=bytes([205+i])
    dictionary=dictionary.ljust(204,b'\0')
    packed,rules,depths=compress(seq,terminals)
    def size(xs): return sum(3 if x>=65536 else len(terminals[x]) for x in xs)
    offsets={}; pos=716+size(packed)+1
    for k,pair in rules.items(): offsets[k]=pos;pos+=size(pair)+1
    if pos>15872: raise ValueError(f'軽量OPLL曲データが{pos:,}バイトになりました。固定配置の上限15,872バイトを超えています。曲を短くするか音符を整理してください。')
    def encode(xs):
        out=bytearray()
        for x in xs:
            if x>=65536: out+=bytes([192])+struct.pack('<H',offsets[x])
            else: out+=terminals[x]
        return out
    table=bytes(v for p in pitches for v in p).ljust(512,b'\0')
    blob=table+dictionary+encode(packed)+bytes([194])
    for pair in rules.values(): blob+=encode(pair)+bytes([193])

    assert len(blob)==pos
    # Independent bytecode decoder, compares every timestamp and OPLL write.
    pc=716;frame=0; stack=[]; actual=[]; commands=collections.Counter(); max_stack=0
    while True:
        op=blob[pc];pc+=1;commands[frame]+=1
        if op<64: actual.append((frame,op,blob[pc]));pc+=1
        elif op<192: frame+=op-63
        elif op==192:
            addr=int.from_bytes(blob[pc:pc+2],'little');stack.append(pc+2);pc=addr;max_stack=max(max_stack,len(stack))
        elif op==193: pc=stack.pop()
        elif op==194: break
        elif 196<=op<=204:
            ch=op-196;idx=blob[pc]*2;pc+=1
            actual.extend([(frame,0x10+ch,blob[idx]),(frame,0x20+ch,blob[idx+1])])
        elif op>=205:
            stack.append(pc);pc=512+(op-205)*4;max_stack=max(max_stack,len(stack))
        else: raise AssertionError(op)
    assert actual==expected and not stack
    report=dict(song_bytes=len(blob),uncompressed_opll_bytes=flat_size,
                original_game_bin_bytes=len(core.binary(original)[0]),
                frames=compiled['frames'],hz=compiled['hz'],loop=compiled['loop'],
                writes=len(expected),macros=len(rules),max_depth=max_stack,
                max_commands_per_frame=max(commands.values()),decoded_trace_matches_reference=True,
                software_vibrato_omitted=True,
                vibrato_notes=sum(bool(n.get('vibratoDepth')) for t in original['tracks'] for n in t['notes']))
    return bytes(blob),report


def export_kit(song):
    blob,report=encode(song)
    assets=core.ROOT/'docs'/'opll-z80'
    driver=(assets/'player.bin').read_bytes()
    if len(driver)!=301 or hashlib.sha256(driver).hexdigest()!=DRIVER_SHA256:
        raise ValueError('軽量OPLLドライバの整合性確認に失敗しました。')
    report.update(driver_bytes=len(driver),ram_bytes=35,bank_bytes=16384,
                  data_limit_bytes=15872,software_vibrato_omitted=True)
    bank=(blob.ljust(15872,b'\0')+driver).ljust(16384,b'\0')
    files={'song.opz':blob,'music-bank.bin':bank,'player.bin':driver,
           'player.asm':(assets/'player.asm').read_bytes(),
           'README.txt':(assets/'README.txt').read_bytes(),
           'song.msx.json':json.dumps(song,ensure_ascii=False,indent=2).encode('utf-8'),
           'manifest.json':json.dumps(report,ensure_ascii=False,indent=2).encode('utf-8')}
    files['SHA256.json']=json.dumps({n:hashlib.sha256(v).hexdigest() for n,v in files.items()},indent=2).encode()
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
        for name,data in files.items(): z.writestr(name,data)
    return out.getvalue()

DRIVER_SHA256='835e69b2e7ec0bab6e0099459f363e8e9da61c4377a5abf5418dbc242b88814d'
