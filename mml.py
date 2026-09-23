"""Strict, explicitly bounded MGSC 1.11 melodic MML importer."""
import math
import re
from fractions import Fraction
from core import new_song, validate

LABELS='123456789abcdefgh'

def expand(text,depth=0):
    if depth>8: raise ValueError('繰り返しは8重まで対応しています。')
    out=''; i=0
    while i<len(text):
        if text[i]=='[':
            level=1; j=i+1
            while j<len(text) and level:
                if text[j]=='[': level+=1
                if text[j]==']': level-=1
                j+=1
            if level: raise ValueError('繰り返しの ] がありません。')
            body=text[i+1:j-1]; pre=re.match(r'\s*(\d+)',body); post=re.match(r'\s*(\d+)',text[j:])
            if pre and post: raise ValueError('繰り返し回数は前後の片方に指定してください。')
            count=int((pre or post)[1]) if pre or post else 2
            if not 1<=count<=32: raise ValueError('有限ループ1～32回に対応しています。無限ループは未対応です。')
            if pre: body=body[pre.end():]
            if post: j+=post.end()
            out+=expand(body,depth+1)*count; i=j
        elif text[i] in '] |':
            if text[i] in ']|': raise ValueError('対応しない繰り返し構文です。')
            out+=' '; i+=1
        else: out+=text[i]; i+=1
        if len(out)>200000: raise ValueError('MML展開後のサイズが大きすぎます。')
    return out

def import_mml(source):
    if not isinstance(source,str) or len(source)>200000: raise ValueError('MMLは200KB以内の文字列で指定してください。')
    p=new_song('Imported MML'); p.update(loop=False,bpm=120)
    texts={k:[] for k in LABELS}; waves={}; warnings=[]; mode=0
    clean=re.sub(r';[^\n]*','',source)
    # SCC definitions contain hexadecimal bytes, including contiguous groups.
    def wave_def(m):
        raw=re.sub(r'\s','',m[2])
        if not re.fullmatch(r'[0-9a-fA-F]{64}',raw): raise ValueError('@s 波形定義は32バイトの16進数にしてください。')
        values=bytes.fromhex(raw); waves[int(m[1])]=[v if v<128 else v-256 for v in values]
        return '\n'*m[0].count('\n')
    clean=re.sub(r'@s(\d+)\s*=\s*\{([^}]*)\}',wave_def,clean,flags=re.I)
    for line_no,line in enumerate(clean.splitlines(),1):
        line=line.strip()
        if not line: continue
        title=re.fullmatch(r'#title\s*\{?\s*"([^"\n]*)"\s*\}?',line,re.I)
        if title: p['title']=title[1]; continue
        directive=re.fullmatch(r'#(tempo|opll_mode)\s+(\d+)',line,re.I)
        if directive:
            if directive[1].lower()=='tempo': p['bpm']=int(directive[2])
            else: mode=int(directive[2])
            continue
        if re.fullmatch(r'#alloc\s+[0-9a-hA-H]+\s*=\s*\d+',line):
            warnings.append(f'{line_no}行: #alloc はPC側の編集には不要なため適用しません。'); continue
        match=re.fullmatch(r'([1-9a-hA-H]+)\s+(.+)',line)
        if not match: raise ValueError(f'{line_no}行: 未対応の宣言／行です: {line[:60]}')
        for label in match[1].lower(): texts[label].append(match[2])
    if mode!=0: raise ValueError('#opll_mode 0（FM9音）のみ対応しています。リズムモードは未対応です。')
    mapping=[0,1,2,12,13,14,15,16,3,4,5,6,7,8,9,10,11]
    global_tempos=set(); longest=0
    for label,idx in zip(LABELS,mapping):
        text=re.sub(r'\s+','',expand(' '.join(texts[label]))).lower()
        t=p['tracks'][idx]; pos=0; octave=4; default=Fraction(96); velocity=0; gate=8; cursor=0; inst=None
        def number(required=True):
            nonlocal pos
            m=re.match(r'\d+',text[pos:])
            if not m:
                if required: raise ValueError(f'トラック{label} / {pos+1}文字: 数値が必要です。')
                return None
            pos+=len(m[0]); return int(m[0])
        def length():
            nonlocal pos
            raw=pos<len(text) and text[pos]=='%'
            if raw: pos+=1
            n=number(raw)
            if n==0: raise ValueError('音長0は使用できません。')
            val=(Fraction(n*2) if raw else Fraction(384,n)) if n is not None else default
            add=val
            while pos<len(text) and text[pos]=='.': add/=2; val+=add; pos+=1
            return val
        while pos<len(text):
            ch=text[pos]; pos+=1
            if ch in 'cdefgabr':
                pitch=12*(octave+1)+{'c':0,'d':2,'e':4,'f':5,'g':7,'a':9,'b':11,'r':0}[ch]
                if ch!='r' and pos<len(text) and text[pos] in '+#-':
                    pitch+=-1 if text[pos]=='-' else 1; pos+=1
                duration=length()
                while pos<len(text) and text[pos]=='^': pos+=1; duration+=length()
                if duration.denominator!=1 or (duration*gate/8).denominator!=1:
                    raise ValueError('96 PPQで正確に表現できない音長です。量子化してから読み込んでください。')
                duration=int(duration); sounding=duration*gate//8
                if ch!='r' and velocity>0:
                    t['notes'].append(dict(id=f'm{label}-{cursor}',pitch=pitch,start=cursor,duration=sounding,velocity=velocity))
                cursor+=duration
                if cursor>64*384: raise ValueError('MMLは64小節以内にしてください。')
            elif ch=='o': octave=number()
            elif ch=='>': octave+=1
            elif ch=='<': octave-=1
            elif ch=='l': default=length()
            elif ch=='v':
                sign=0
                if pos<len(text) and text[pos] in '+-': sign=1 if text[pos]=='+' else -1; pos+=1
                v=number(); velocity=velocity+sign*v if sign else v
                if not 0<=velocity<=15: raise ValueError('vは0～15です。')
            elif ch in '()':
                velocity+=(number(False) or 1)*(1 if ch==')' else -1)
                if not 0<=velocity<=15: raise ValueError('音量が0～15の範囲外です。')
            elif ch=='q':
                gate=number()
                if not 1<=gate<=8: raise ValueError('q1～q8のみ対応しています。')
            elif ch=='t':
                tempo=number()
                if cursor: raise ValueError('曲途中のテンポ変更は未対応です。')
                global_tempos.add(tempo)
            elif ch=='@':
                value=number()
                if inst is not None and inst!=value: raise ValueError('トラック途中の音色変更は未対応です。')
                inst=value
                if t['chip']=='OPLL':
                    if value>14: raise ValueError('MGSCの@0～@14（ROM音色）のみ対応しています。')
                    t['instrument']=value+1
                elif t['chip']=='SCC':
                    if value not in waves: raise ValueError(f'@s{value} のSCC波形定義が必要です。')
                    t['wave']=waves[value][:]
                else: raise ValueError('PSGの@エンベロープは未対応です。')
            else: raise ValueError(f'トラック{label} / {pos}文字: 未対応コマンド「{ch}」。読み込みを中止しました。')
        if not 1<=octave<=8: raise ValueError('オクターブが範囲外です。')
        longest=max(longest,cursor)
        if text and t['chip']=='SCC' and inst is None: raise ValueError('SCCは@s波形定義と@音色番号を指定してください。')
        if text and t['chip']=='OPLL' and inst is None: t['instrument']=1
    if len(global_tempos)>1: raise ValueError('トラック間のテンポ指定が一致していません。')
    if global_tempos: p['bpm']=global_tempos.pop()
    p['bars']=max(1,math.ceil(longest/384))
    if longest==0: raise ValueError('読み込める音符／休符がありません。')
    # Mirror a defined waveform when the partner channel has no MML.
    if not texts['8']: p['tracks'][16]['wave']=p['tracks'][15]['wave'][:]
    if not texts['7']: p['tracks'][15]['wave']=p['tracks'][16]['wave'][:]
    return dict(song=validate(p),warnings=warnings)
