#include "opll.h"
#include "ymfm_opm.h"
#include <algorithm>
#include <cmath>
#include <new>
namespace {
class LiveOpm : public ymfm::ym2151 {
public:
 using ymfm::ym2151::ym2151;
 unsigned muted=0;
 void generate(output_data *out) {
  m_fm.clock(fm_engine::ALL_CHANNELS);
  m_fm.output(out->clear(),0,32767,fm_engine::ALL_CHANNELS & ~muted);
  out->roundtrip_fp();
 }
};
class Opm : public ymfm::ymfm_interface {
public:
 LiveOpm chip; ymfm::ym2151::output_data output{};
 const double ratio; uint64_t samples=0,native=0;
 double held=0,previous=0,dc=0;
 unsigned keys[8]{},sampled[8]{},deferred[8]{};bool pending[8]{};
 Opm():chip(*this),ratio(double(chip.sample_rate(3579545))/44100){chip.reset();}
 void raw(unsigned r,unsigned v){chip.write(0,r);chip.write(1,v);if(r==8)keys[v&7]=v;}
 void write(unsigned r,unsigned v){
  r&=255;v&=255;
  if(r==8){unsigned c=v&7;if(sampled[c]&~keys[c]&v&0x78){pending[c]=true;deferred[c]=v;return;}pending[c]=false;}
  raw(r,v);
 }
 double sample(){
  double pos=samples*ratio,end=(++samples)*ratio,sum=0;
  while(pos<end-1e-9){
   if(native<=uint64_t(std::floor(pos+1e-9))){
    chip.generate(&output);
    for(unsigned c=0;c<8;c++){sampled[c]=keys[c];if(pending[c]){pending[c]=false;raw(8,deferred[c]);}}
    held=(output.data[0]+output.data[1])*0.5;++native;
   }
   double next=std::min(end,double(native));sum+=held*(next-pos);pos=next;
  }
  double x=sum/ratio;dc=x-previous+0.997154*dc;previous=x;return dc*0.25;
 }
};
}
extern "C" void *msx_opm_new(void){return new(std::nothrow) Opm;}
extern "C" void msx_opm_write(void *p,unsigned r,unsigned v){static_cast<Opm*>(p)->write(r,v);}
extern "C" double msx_opm_calc(void *p){return p?static_cast<Opm*>(p)->sample():0;}
extern "C" void msx_opm_mask(void *p,unsigned m){if(p)static_cast<Opm*>(p)->chip.muted=m&255;}
extern "C" void msx_opm_delete(void *p){delete static_cast<Opm*>(p);}
