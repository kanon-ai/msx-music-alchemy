#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include "emu2149.h"
#include "opll.h"
#include "emu2212.h"
#ifdef _WIN32
#include <io.h>
#include <fcntl.h>
#endif
static unsigned read16(void) { unsigned a=getchar(), b=getchar(); if(a>255||b>255) exit(2); return a|(b<<8); }
int main(void) {
#ifdef _WIN32
  _setmode(_fileno(stdin), _O_BINARY); _setmode(_fileno(stdout), _O_BINARY);
#endif
  if(getchar()!='M'||getchar()!='S'||getchar()!='R'||getchar()!='1') return 2;
  unsigned hz=read16(), lo=read16(), frames=lo|(read16()<<16);
  if((hz!=50&&hz!=60)||frames>18060) return 2;
  PSG *psg=PSG_new(1789773,44100); void *opll=msx_opll_new(); SCC *scc=SCC_new(3579545,44100);
  if(!psg||!opll||!scc) return 3;
  PSG_setVolumeMode(psg,2); PSG_setQuality(psg,1); PSG_reset(psg);
  SCC_set_type(scc,SCC_STANDARD); SCC_set_quality(scc,1); SCC_reset(scc); SCC_write(scc,0x9000,0x3f);
  for(unsigned f=0;f<frames;f++) {
    unsigned count=read16(); if(count>1024) return 2;
    for(unsigned j=0;j<count;j++) {
      int chip=getchar(), reg=getchar(), val=getchar(); if(val<0) return 2;
      if(chip==0) PSG_writeReg(psg,reg,val);
      else if(chip==1) msx_opll_write(opll,reg,val);
      else if(chip==2) SCC_write(scc,0x9800+reg,val);
      else return 2;
    }
    for(unsigned i=0;i<44100/hz;i++) {
      int sample=(int)(PSG_calc(psg)*0.75+msx_opll_calc(opll)*0.65+SCC_calc(scc)*0.65);
      if(sample>32767)sample=32767; if(sample< -32768)sample=-32768;
      putchar(sample&255); putchar((sample>>8)&255);
    }
  }
  PSG_delete(psg); msx_opll_delete(opll); SCC_delete(scc); return ferror(stdout)?4:0;
}
